import { Router } from 'express';
import { getUsers, saveUsers } from '../storage/userStorage.js';

function safeUser(user: any) {
  return {
    id: user.id,
    craftWorldUserId: user.craftWorldUserId,
    craftWorldUid: user.craftWorldUid,
    craftWorldFirebaseUserId: user.craftWorldFirebaseUserId,
    craftWorldAccountId: user.craftWorldAccountId,
    walletAddress: user.walletAddress,
    primaryWalletAddress: user.primaryWalletAddress,
    username: user.username,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function isWalletAddress(value?: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
}

export const meRouter = Router();

meRouter.get('/', async (req: any, res) => {
  const user = (await getUsers()).find((u) => u.id === req.user?.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json(safeUser(user));
});

meRouter.put('/craftworld', async (req: any, res) => {
  const { craftWorldUid, walletAddress, primaryWalletAddress, craftWorldFirebaseUserId } = req.body ?? {};
  const users = await getUsers();
  const user = users.find((u) => u.id === req.user?.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  if (craftWorldUid !== undefined) {
    const trimmedUid = String(craftWorldUid).trim();
    if (!isWalletAddress(trimmedUid)) {
      user.craftWorldUid = trimmedUid;
      user.craftWorldUserId = trimmedUid;
    }
  }
  if (craftWorldFirebaseUserId !== undefined) user.craftWorldFirebaseUserId = String(craftWorldFirebaseUserId).trim();
  if (walletAddress !== undefined) user.walletAddress = String(walletAddress).trim().toLowerCase();
  if (primaryWalletAddress !== undefined) user.primaryWalletAddress = String(primaryWalletAddress).trim().toLowerCase();

  if (!user.craftWorldUserId && user.craftWorldUid) user.craftWorldUserId = user.craftWorldUid;

  await saveUsers(users);
  res.json(safeUser(user));
});
