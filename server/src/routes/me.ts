import { Router } from 'express';
import { getUsers, saveUsers } from '../storage/userStorage.js';

function safeUser(user: any) {
  return {
    id: user.id,
    craftWorldUserId: user.craftWorldUserId,
    craftWorldUid: user.craftWorldUid,
    walletAddress: user.walletAddress,
    primaryWalletAddress: user.primaryWalletAddress,
    username: user.username,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export const meRouter = Router();

meRouter.get('/', async (req: any, res) => {
  const user = (await getUsers()).find((u) => u.id === req.user?.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json(safeUser(user));
});

meRouter.put('/craftworld', async (req: any, res) => {
  const { craftWorldUid, walletAddress, primaryWalletAddress } = req.body ?? {};
  const users = await getUsers();
  const user = users.find((u) => u.id === req.user?.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  if (craftWorldUid !== undefined) user.craftWorldUid = String(craftWorldUid).trim();
  if (walletAddress !== undefined) user.walletAddress = String(walletAddress).trim();
  if (primaryWalletAddress !== undefined) user.primaryWalletAddress = String(primaryWalletAddress).trim();

  if (!user.craftWorldUserId && user.craftWorldUid) user.craftWorldUserId = user.craftWorldUid;

  await saveUsers(users);
  res.json(safeUser(user));
});
