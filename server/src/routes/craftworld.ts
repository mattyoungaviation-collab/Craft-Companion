import { Router } from 'express';
import { getUsers } from '../storage/userStorage.js';
import { getCraftworldHomeData } from '../services/craftworldGraphql.js';
import { getCraftworldProfileByUid, getCraftworldWallets } from '../services/craftworldIdentity.js';

export const craftworldRouter = Router();

craftworldRouter.get('/home', async (req: any, res) => {
  const data = await getCraftworldHomeData(req.user.craftWorldUserId);
  res.json(data);
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
