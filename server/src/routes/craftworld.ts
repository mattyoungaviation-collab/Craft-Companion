import { Router } from 'express';
import { getCraftworldHomeData } from '../services/craftworldGraphql.js';

export const craftworldRouter = Router();
craftworldRouter.get('/home', async (req: any, res) => {
  const data = await getCraftworldHomeData(req.user.craftWorldUserId);
  res.json(data);
});
