import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getUsers, saveUsers } from '../storage/userStorage.js';
import { createWalletNonce, consumeWalletNonce } from '../storage/walletNonceStorage.js';
import {
  exchangeCraftworldCustomToken,
  getCraftworldAccountIdentity,
  loginCraftworldWithSignedPayload,
  lookupCraftworldFirebaseAccount,
  requestCraftworldAuthPayload,
} from '../services/craftworldAuth.js';

export const authRouter = Router();

function safeUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    craftWorldUserId: user.craftWorldUserId,
    craftWorldUid: user.craftWorldUid,
    craftWorldFirebaseUserId: user.craftWorldFirebaseUserId,
    craftWorldAccountId: user.craftWorldAccountId,
    walletAddress: user.walletAddress,
    primaryWalletAddress: user.primaryWalletAddress,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function signAppToken(user: any) {
  const secret = process.env.JWT_SECRET || 'replace_me';
  return jwt.sign(
    { id: user.id, username: user.username, craftWorldUserId: user.craftWorldUserId, craftWorldUid: user.craftWorldUid },
    secret,
    { expiresIn: '7d' },
  );
}

function isWalletAddress(value?: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
}

function getCustomJwtUserId(account: any, fallback = '') {
  const customJwt = account?.linkedAccounts?.find((linked: any) => linked?.type === 'custom_jwt');
  return String(customJwt?.details?.user_id || customJwt?.details?.id || fallback || '').trim();
}

function getPrimaryWalletAddress(account: any, fallbackAddress = '') {
  const wallets = Array.isArray(account?.wallets) ? account.wallets : [];

  const primary = wallets.find((wallet: any) => wallet?.primary && wallet?.address)?.address;

  const nonJwt = wallets.find(
    (wallet: any) =>
      wallet?.address &&
      String(wallet?.provider || '').toLowerCase() !== 'jwt' &&
      String(wallet?.providerId || '').toLowerCase() !== 'inappwallet',
  )?.address;

  const first = wallets.find((wallet: any) => wallet?.address)?.address;

  return String(primary || nonJwt || first || fallbackAddress || '').toLowerCase();
}

authRouter.post('/register', async (req, res) => {
  const { craftWorldUserId, username, password } = req.body ?? {};
  if (!craftWorldUserId || !username || !password) return res.status(400).json({ message: 'All fields are required.' });
  const users = await getUsers();
  if (users.some((u) => u.username.toLowerCase() === String(username).toLowerCase())) return res.status(409).json({ message: 'Username already exists.' });
  const passwordHash = await bcrypt.hash(password, 10);
  users.push({ id: uuid(), craftWorldUserId, username, passwordHash, createdAt: new Date().toISOString() });
  await saveUsers(users);
  return res.status(201).json({ message: 'Account created successfully.' });
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ message: 'Username and password are required.' });
  const users = await getUsers();
  const user = users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Invalid credentials.' });
  user.lastLoginAt = new Date().toISOString();
  await saveUsers(users);
  res.json({ token: signAppToken(user), user: safeUser(user) });
});

authRouter.post('/craftworld-wallet/payload', async (req, res) => {
  const { address } = req.body ?? {};
  if (!address) return res.status(400).json({ message: 'Wallet address is required.' });

  try {
    const payload = await requestCraftworldAuthPayload(String(address));
    return res.json({ payload });
  } catch (error: any) {
    console.error('Craft World wallet payload failed', {
      address,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(502).json({ message: error.message || 'Unable to create Craft World auth payload.' });
  }
});

authRouter.post('/craftworld-wallet/login', async (req, res) => {
  const { payload, signature } = req.body ?? {};
  if (!payload || !signature) return res.status(400).json({ message: 'Payload and signature are required.' });

  console.log('Craft World wallet login attempt', {
    walletAddress: payload?.walletAddress || payload?.address,
    hasSignature: Boolean(signature),
    noncePreview: String(payload?.nonce || '').slice(0, 80),
  });

  try {
    const craftWorldAuth = await loginCraftworldWithSignedPayload(payload, String(signature));
    const firebaseAuth = await exchangeCraftworldCustomToken(craftWorldAuth.customToken);
    const firebaseAccount = await lookupCraftworldFirebaseAccount(firebaseAuth.idToken);
    const account = await getCraftworldAccountIdentity(firebaseAuth.idToken, payload.walletAddress || payload.address || '');

    const craftWorldAccountId = String(account?.id || '').trim();
    const firebaseLocalId = String(firebaseAccount.localId || '').trim();
    const linkedUid = getCustomJwtUserId(account, '');
    const craftWorldUid = linkedUid || (firebaseLocalId && !isWalletAddress(firebaseLocalId) ? firebaseLocalId : craftWorldAccountId);
    const walletAddress = getPrimaryWalletAddress(account, payload.walletAddress || payload.address || '');

    if (!craftWorldUid) {
      console.error('Craft World UID was not available', {
        craftWorldAccountId,
        craftWorldUid,
        firebaseLocalId: firebaseAccount.localId,
        craftWorldAuthUid: craftWorldAuth.uid,
        walletAddress,
        linkedAccounts: account?.linkedAccounts,
      });
      return res.status(502).json({ message: 'Craft World UID was not available.' });
    }

    console.log('Craft World wallet login identity', {
      craftWorldAccountId,
      craftWorldUid,
      firebaseLocalId: firebaseAccount.localId,
      craftWorldAuthUid: craftWorldAuth.uid,
      walletAddress,
    });

    const users = await getUsers();
    let user = users.find(
      (item) =>
        item.craftWorldUid === craftWorldUid ||
        item.craftWorldUserId === craftWorldUid ||
        item.craftWorldFirebaseUserId === firebaseLocalId ||
        item.craftWorldAccountId === craftWorldAccountId ||
        Boolean(walletAddress && item.walletAddress?.toLowerCase() === walletAddress),
    );

    const now = new Date().toISOString();
    const expiresInMs = Number(firebaseAuth.expiresIn || '0') * 1000;
    if (!user) {
      user = {
        id: uuid(),
        username: `wallet-${walletAddress.slice(2, 8) || 'craft'}`,
        craftWorldUserId: craftWorldUid,
        craftWorldUid: craftWorldUid,
        craftWorldFirebaseUserId: firebaseLocalId || craftWorldUid,
        craftWorldAccountId: craftWorldAccountId,
        walletAddress,
        passwordHash: '',
        createdAt: now,
      };
      users.push(user);
    }

    user.craftWorldUid = craftWorldUid;
    user.craftWorldUserId = craftWorldUid;
    user.craftWorldFirebaseUserId = firebaseLocalId || craftWorldUid;
    user.craftWorldAccountId = craftWorldAccountId;
    user.walletAddress = walletAddress;
    user.craftWorldCustomToken = craftWorldAuth.customToken;
    user.craftWorldIdToken = firebaseAuth.idToken;
    user.craftWorldRefreshToken = firebaseAuth.refreshToken;
    user.craftWorldTokenExpiresAt = new Date(Date.now() + expiresInMs).toISOString();
    user.lastLoginAt = now;
    await saveUsers(users);

    return res.json({ token: signAppToken(user), user: safeUser(user) });
  } catch (error: any) {
    console.error('Craft World wallet login failed', {
      walletAddress: payload?.walletAddress || payload?.address,
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(502).json({ message: error.message || 'Unable to complete Craft World auth login.' });
  }
});

authRouter.post('/wallet/nonce', async (req, res) => {
  const { address } = req.body ?? {};
  if (!address) return res.status(400).json({ message: 'Wallet address is required.' });
  const nonce = await createWalletNonce(String(address));
  res.json({ address: nonce.address, message: nonce.message, expiresAt: nonce.expiresAt });
});

authRouter.post('/wallet/login', async (req, res) => {
  const { address, message, signature } = req.body ?? {};
  if (!address || !message || !signature) return res.status(400).json({ message: 'Address, message, and signature are required.' });

  const nonce = await consumeWalletNonce(String(address), String(message));
  if (!nonce) return res.status(401).json({ message: 'Login message is invalid or expired.' });

  const normalizedAddress = String(address).toLowerCase();


  const users = await getUsers();
  let user = users.find((item) => item.walletAddress?.toLowerCase() === normalizedAddress);
  const now = new Date().toISOString();

  if (!user) {
    user = {
      id: uuid(),
      username: `wallet-${normalizedAddress.slice(2, 8)}`,
      craftWorldUserId: '',
      walletAddress: normalizedAddress,
      passwordHash: '',
      createdAt: now,
    };
    users.push(user);
  }

  user.walletAddress = normalizedAddress;
  user.lastLoginAt = now;
  await saveUsers(users);

  res.json({ token: signAppToken(user), user: safeUser(user) });
});
