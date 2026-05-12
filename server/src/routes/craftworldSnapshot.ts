import { Router } from 'express';
import { getUsers, saveUsers } from '../storage/userStorage.js';
import { getCraftworldHomeData, getPublicCraftworldHomeData } from '../services/craftworldGraphql.js';

export const craftworldSnapshotRouter = Router();

function getUid(user: any, reqUser: any) {
  return String(user?.craftWorldUid || user?.craftWorldUserId || reqUser?.craftWorldUid || reqUser?.craftWorldUserId || '').trim();
}

function getUserAuthTokens(user: any) {
  return [user?.craftWorldIdToken, user?.craftWorldCustomToken].filter(Boolean) as string[];
}

craftworldSnapshotRouter.get('/home', async (req: any, res) => {
  const users = await getUsers();
  const user = users.find((item) => item.id === req.user?.id);
  const uid = getUid(user, req.user);

  if (!user) return res.status(404).json({ message: 'User not found.' });
  if (!uid) return res.status(400).json({ message: 'Craft World UID is not set.' });

  const authTokens = getUserAuthTokens(user);

  if (authTokens.length) {
    try {
      const data = await getCraftworldHomeData(uid, authTokens);
      return res.json(data);
    } catch (error) {
      console.warn('Authenticated Craft World snapshot failed. Falling back to UID snapshot.');
    }
  }

  try {
    const data = await getPublicCraftworldHomeData(uid, user.manualWorkshop || [], user.manualProficiencies || []);
    return res.json(data);
  } catch (error: any) {
    return res.status(502).json({ message: error.message || 'Unable to load Craft World UID snapshot.' });
  }
});

craftworldSnapshotRouter.put('/manual-modifiers', async (req: any, res) => {
  const users = await getUsers();
  const user = users.find((item) => item.id === req.user?.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const workshop = Array.isArray(req.body?.workshop) ? req.body.workshop : [];
  const proficiencies = Array.isArray(req.body?.proficiencies) ? req.body.proficiencies : [];

  user.manualWorkshop = workshop
    .map((item: any) => ({ symbol: String(item.symbol || '').trim().toUpperCase(), level: Number(item.level || 0) }))
    .filter((item: any) => item.symbol && Number.isFinite(item.level));

  user.manualProficiencies = proficiencies
    .map((item: any) => ({
      symbol: String(item.symbol || '').trim().toUpperCase(),
      collectedAmount: Number(item.collectedAmount || 0),
      claimedLevel: Number(item.claimedLevel || 0),
    }))
    .filter((item: any) => item.symbol && Number.isFinite(item.claimedLevel));

  await saveUsers(users);

  res.json({ workshop: user.manualWorkshop, proficiencies: user.manualProficiencies });
});
