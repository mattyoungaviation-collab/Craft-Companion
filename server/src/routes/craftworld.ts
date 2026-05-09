import { Router } from 'express';
import { getUsers, saveUsers } from '../storage/userStorage.js';
import { getCraftworldHomeData } from '../services/craftworldGraphql.js';
import { getCraftworldProfileByUid, getCraftworldWallets } from '../services/craftworldIdentity.js';
import {
  exchangeCraftworldCustomToken,
  loginCraftworldWithSignedPayload,
  requestCraftworldAuthPayload,
} from '../services/craftworldAuth.js';

export const craftworldRouter = Router();

craftworldRouter.get('/home', async (req: any, res) => {
  const user = (await getUsers()).find((u) => u.id === req.user?.id);
  const uid = user?.craftWorldUid || user?.craftWorldUserId || req.user.craftWorldUid || req.user.craftWorldUserId;
  const token = user?.craftWorldIdToken || process.env.CRAFTWORLD_AUTH_TOKEN;

  try {
    const data = await getCraftworldHomeData(uid || '', token);
    res.json(data);
  } catch (error: any) {
    res.status(502).json({ message: error.message || 'Unable to load Craft World home data.' });
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

craftworldRouter.post('/auth/payload', async (req, res) => {
  const { address, chainId } = req.body ?? {};
  if (!address) return res.status(400).json({ message: 'Wallet address is required.' });

  try {
    const payload = await requestCraftworldAuthPayload(String(address), String(chainId || '2020'));
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

    const users = await getUsers();
    const user = users.find((u) => u.id === req.user?.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const expiresInMs = Number(firebaseAuth.expiresIn || 3600) * 1000;
    user.craftWorldUid = craftWorldAuth.uid;
    user.craftWorldUserId = craftWorldAuth.uid;
    user.walletAddress = payload.address;
    user.craftWorldIdToken = firebaseAuth.idToken;
    user.craftWorldRefreshToken = firebaseAuth.refreshToken;
    user.craftWorldTokenExpiresAt = new Date(Date.now() + expiresInMs).toISOString();

    await saveUsers(users);

    res.json({
      uid: craftWorldAuth.uid,
      walletAddress: user.walletAddress,
      expiresAt: user.craftWorldTokenExpiresAt,
      isNewUser: firebaseAuth.isNewUser,
    });
  } catch (error: any) {
    res.status(502).json({ message: error.message || 'Unable to complete Craft World auth login.' });
  }
});
