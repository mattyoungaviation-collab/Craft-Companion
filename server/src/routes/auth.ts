import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getUsers, saveUsers } from '../storage/userStorage.js';

export const authRouter = Router();

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
  const secret = process.env.JWT_SECRET || 'replace_me';
  const token = jwt.sign({ id: user.id, username: user.username, craftWorldUserId: user.craftWorldUserId }, secret, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, craftWorldUserId: user.craftWorldUserId, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt } });
});
