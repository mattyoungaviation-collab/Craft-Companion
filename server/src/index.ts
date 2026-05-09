import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { craftworldRouter } from './routes/craftworld.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const auth = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'replace_me'); next(); }
  catch { return res.status(401).json({ message: 'Invalid token' }); }
};

app.use('/api/auth', authRouter);
app.use('/api/me', auth, meRouter);
app.use('/api/craftworld', auth, craftworldRouter);

app.listen(process.env.PORT || 3001, () => console.log('Server running'));
