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

function asAccountId(value?: string) {
  const clean = String(value || '').trim();
  if (!clean || isWalletAddress(clean)) return '';
  return clean;
}

function getCustomJwtUserId(account: any) {
  const customJwt = account?.linkedAccounts?.find((linked: any) => linked?.type === 'custom_jwt');
  return String(customJwt?.details?.user_id || customJwt?.details?.id || '').trim();
}

function getPrimaryWalletAddress(account: any, fallbackAddress = '') {
  const primary = account?.wallets?.find((wallet: any) => wallet?.primary && wallet?.address)?.address;
  const first = account?.wallets?.find((wallet: any) => wallet?.address)?.address;
  return String(primary || first || fallbackAddress || '').toLowerCase();
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
  const { address, chainId } = req.body ?? {};
  if (!address) return res.status(400).json({ message: 'Wallet address is required.' });

  try {
    const payload = await requestCraftworldAuthPayload(String(address), String(chainId || '2020'));
    return res.json({ payload });
  } catch (error: any) {
    return res.status(502).json({ message: error.message || 'Unable to create Craft World auth payload.' });
  }
});

authRouter.post('/craftworld-wallet/login', async (req, res) => {
  const { payload, signature } = req.body ?? {};
  if (!payload || !signature) return res.status(400).json({ message: 'Payload and signature are required.' });

  try {
    const craftWorldAuth = await loginCraftworldWithSignedPayload(payload, String(signature));
    const firebaseAuth = await exchangeCraftworldCustomToken(craftWorldAuth.customToken);
    const firebaseAccount = await lookupCraftworldFirebaseAccount(firebaseAuth.idToken);
    const account = await getCraftworldAccountIdentity(firebaseAuth.idToken);

    const accountId = asAccountId(account.id);
    const customJwtUserId = getCustomJwtUserId(account);
    const walletAddress = getPrimaryWalletAddress(account, payload.address);

    if (!accountId) return res.status(502).json({ message: 'Craft World account id was not returned.' });

    console.log('Craft World wallet login identity', {
      accountId,
      customJwtUserId,
      firebaseLocalId: firebaseAccount.localId,
      craftWorldAuthUid: craftWorldAuth.uid,
      walletAddress,
    });

    const users = await getUsers();
    let user = users.find(
      (item) =>
        item.craftWorldUid === accountId ||
        item.craftWorldUserId === accountId ||
        Boolean(customJwtUserId && item.craftWorldFirebaseUserId === customJwtUserId) ||
        Boolean(walletAddress && item.walletAddress?.toLowerCase() === walletAddress),
    );

    const now = new Date().toISOString();
    const expiresInMs = Number(firebaseAuth.expiresIn || '0') * 1000;
    if (!user) {
      user = {
        id: uuid(),
        username: `wallet-${walletAddress.slice(2, 8) || 'craft'}`,
        craftWorldUserId: accountId,
        craftWorldUid: accountId,
        craftWorldFirebaseUserId: customJwtUserId,
        walletAddress,
        passwordHash: '',
        createdAt: now,
      };
      users.push(user);
    }

    user.craftWorldUid = accountId;
    user.craftWorldUserId = accountId;
    user.craftWorldFirebaseUserId = customJwtUserId;
    user.walletAddress = walletAddress;
    user.craftWorldCustomToken = craftWorldAuth.customToken;
    user.craftWorldIdToken = firebaseAuth.idToken;
    user.craftWorldRefreshToken = firebaseAuth.refreshToken;
    user.craftWorldTokenExpiresAt = new Date(Date.now() + expiresInMs).toISOString();
    user.lastLoginAt = now;
    await saveUsers(users);

    return res.json({ token: signAppToken(user), user: safeUser(user) });
  } catch (error: any) {
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
