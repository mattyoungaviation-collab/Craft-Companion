import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { craftworldRouter } from './routes/craftworld.js';
import { startMatrixScanner } from './services/matrixScanner.js';

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');

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

startMatrixScanner();

app.use(express.static(clientDistPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.listen(process.env.PORT || 3001, () => console.log('Server running'));
