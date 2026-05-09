import { Router } from 'express';
import { getUsers } from '../storage/userStorage.js';

export const meRouter = Router();
meRouter.get('/', async (req: any, res) => {
  const user = (await getUsers()).find((u) => u.id === req.user?.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json({ id: user.id, craftWorldUserId: user.craftWorldUserId, username: user.username, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt });
});
