import { Router } from 'express';
import { getUsers, saveUsers } from '../storage/userStorage.js';
import { getMatrixCache, saveMatrixCache } from '../storage/matrixCacheStorage.js';
import { getCraftworldHomeData } from '../services/craftworldGraphql.js';
import { getCraftworldProfileByUid, getCraftworldWallets } from '../services/craftworldIdentity.js';
import { getMockCraftworldHomeData } from '../services/mockCraftworldData.js';
import { getCraftworldExactInputQuote, getCraftworldExactOutputQuote } from '../services/craftworldQuote.js';
import {
  exchangeCraftworldCustomToken,
  getCraftworldAccountIdentity,
  loginCraftworldWithSignedPayload,
  lookupCraftworldFirebaseAccount,
  refreshCraftworldIdToken,
  requestCraftworldAuthPayload,
} from '../services/craftworldAuth.js';

export const craftworldRouter = Router();

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

async function getFreshCraftworldTokens(user: any) {
  if (!user) return [process.env.CRAFTWORLD_AUTH_TOKEN].filter(Boolean) as string[];

  const expiresAt = user.craftWorldTokenExpiresAt ? new Date(user.craftWorldTokenExpiresAt).getTime() : 0;
  const shouldRefresh = Boolean(user.craftWorldRefreshToken && (!user.craftWorldIdToken || expiresAt < Date.now() + 2 * 60 * 1000));

  if (shouldRefresh) {
    const refreshed = await refreshCraftworldIdToken(user.craftWorldRefreshToken);
    const expiresInMs = Number(refreshed.expiresIn || 3600) * 1000;
    user.craftWorldIdToken = refreshed.idToken;
    user.craftWorldRefreshToken = refreshed.refreshToken;
    user.craftWorldTokenExpiresAt = new Date(Date.now() + expiresInMs).toISOString();
  }

  return [user.craftWorldIdToken, user.craftWorldCustomToken, process.env.CRAFTWORLD_AUTH_TOKEN].filter(Boolean) as string[];
}

async function getCurrentUserAndFreshToken(req: any) {
  const users = await getUsers();
  const user = users.find((u) => u.id === req.user?.id);
  const tokens = await getFreshCraftworldTokens(user);
  if (user) await saveUsers(users);
  return { user, token: tokens[0] || '' };
}

async function getPublicProfileHomeFallback(uid: string) {
  const home = getMockCraftworldHomeData();
  if (!uid) return home;

  try {
    const profile = await getCraftworldProfileByUid(uid);
    home.profile = {
      uid: profile.uid,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      walletAddress: profile.walletAddress,
    };
    home.account.walletAddress = profile.walletAddress;
  } catch {
    home.profile = { uid };
  }

  return home;
}

craftworldRouter.get('/home', async (req: any, res) => {
  const users = await getUsers();
  const user = users.find((u) => u.id === req.user?.id);
  const uid = user?.craftWorldUid || user?.craftWorldUserId || req.user.craftWorldUid || req.user.craftWorldUserId;

  try {
    const tokens = await getFreshCraftworldTokens(user);
    if (user) await saveUsers(users);
    const data = await getCraftworldHomeData(uid || '', tokens);
    res.json(data);
  } catch (error: any) {
    console.error('Protected Craft World home failed, returning public profile fallback', error.message);
    const fallback = await getPublicProfileHomeFallback(uid || '');
    res.json(fallback);
  }
});

craftworldRouter.get('/profile', async (req: any, res) => {
  const user = (await getUsers()).find((u) => u.id === req.user?.id);
  const uid = user?.craftWorldUid || user?.craftWorldUserId || req.user.craftWorldUid || req.user.craftWorldUserId;
  if (!uid) return res.status(400).json({ message: 'Craft World UID is not set.' });

  try {
    const profile = await getCraftworldProfileByUid(uid);
    res.json(profile);
  } catch (error: any) {
    res.status(502).json({ message: error.message || 'Unable to load Craft World profile.' });
  }
});

craftworldRouter.get('/wallets', async (_req, res) => {
  try {
    const wallets = await getCraftworldWallets();
    res.json(wallets);
  } catch (error: any) {
    res.status(502).json({ message: error.message || 'Unable to load Craft World wallets.' });
  }
});

craftworldRouter.post('/quote', async (req: any, res) => {
  const { inputSymbol, outputSymbol = 'COIN', inputAmount } = req.body ?? {};

  try {
    const { token } = await getCurrentUserAndFreshToken(req);
    const quote = await getCraftworldExactInputQuote(
      {
        inputSymbol: String(inputSymbol || ''),
        outputSymbol: String(outputSymbol || 'COIN'),
        inputAmount: Number(inputAmount || 0),
      },
      token,
    );
    res.json(quote);
  } catch (error: any) {
    res.status(502).json({ message: error.message || 'Unable to load Craft World quote.' });
  }
});

craftworldRouter.post('/buy-quote', async (req: any, res) => {
  const { inputSymbol = 'COIN', outputSymbol, outputAmount } = req.body ?? {};

  try {
    const { token } = await getCurrentUserAndFreshToken(req);
    const quote = await getCraftworldExactOutputQuote(
      {
        inputSymbol: String(inputSymbol || 'COIN'),
        outputSymbol: String(outputSymbol || ''),
        outputAmount: Number(outputAmount || 0),
      },
      token,
    );
    res.json(quote);
  } catch (error: any) {
    res.status(502).json({ message: error.message || 'Unable to load Craft World buy quote.' });
  }
});

craftworldRouter.get('/matrix-cache', async (_req, res) => {
  try {
    res.json(await getMatrixCache());
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Unable to load matrix cache.' });
  }
});

craftworldRouter.put('/matrix-cache', async (req, res) => {
  try {
    const { selectedGroup, cells } = req.body ?? {};
    const saved = await saveMatrixCache({
      updatedAt: new Date().toISOString(),
      selectedGroup: typeof selectedGroup === 'string' ? selectedGroup : undefined,
      cells: cells && typeof cells === 'object' ? cells : {},
    });
    res.json(saved);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Unable to save matrix cache.' });
  }
});

craftworldRouter.post('/auth/payload', async (req, res) => {
  const { address } = req.body ?? {};
  if (!address) return res.status(400).json({ message: 'Wallet address is required.' });

  try {
    const payload = await requestCraftworldAuthPayload(String(address));
    res.json({ payload });
  } catch (error: any) {
    res.status(502).json({ message: error.message || 'Unable to create Craft World auth payload.' });
  }
});

craftworldRouter.post('/auth/login', async (req: any, res) => {
  const { payload, signature } = req.body ?? {};
  if (!payload || !signature) return res.status(400).json({ message: 'Payload and signature are required.' });

  try {
    const craftWorldAuth = await loginCraftworldWithSignedPayload(payload, String(signature));
    const firebaseAuth = await exchangeCraftworldCustomToken(craftWorldAuth.customToken);
    const firebaseAccount = await lookupCraftworldFirebaseAccount(firebaseAuth.idToken);
    const account = await getCraftworldAccountIdentity(firebaseAuth.idToken, payload.walletAddress || payload.address || '');

    const users = await getUsers();
    const user = users.find((u) => u.id === req.user?.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const expiresInMs = Number(firebaseAuth.expiresIn || 3600) * 1000;
    user.craftWorldUid = firebaseAccount.localId || craftWorldAuth.uid;
    user.craftWorldUserId = firebaseAccount.localId || craftWorldAuth.uid;
    user.walletAddress = getPrimaryWalletAddress(account, payload.walletAddress || payload.address || '');
    user.craftWorldCustomToken = craftWorldAuth.customToken;
    user.craftWorldIdToken = firebaseAuth.idToken;
    user.craftWorldRefreshToken = firebaseAuth.refreshToken;
    user.craftWorldTokenExpiresAt = new Date(Date.now() + expiresInMs).toISOString();

    await saveUsers(users);

    res.json({
      uid: user.craftWorldUid,
      walletAddress: user.walletAddress,
      expiresAt: user.craftWorldTokenExpiresAt,
      isNewUser: firebaseAuth.isNewUser,
    });
  } catch (error: any) {
    res.status(502).json({ message: error.message || 'Unable to complete Craft World auth login.' });
  }
});
