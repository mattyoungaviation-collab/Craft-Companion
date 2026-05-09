import { promises as fs } from 'node:fs';
import path from 'node:path';
import { UserAccount } from '../types.js';

const dataDir = process.env.DATA_DIR || './data';
const usersFile = path.join(dataDir, 'users.json');

async function ensureFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try { await fs.access(usersFile); } catch { await fs.writeFile(usersFile, '[]', 'utf-8'); }
}

export async function getUsers(): Promise<UserAccount[]> {
  await ensureFile();
  return JSON.parse(await fs.readFile(usersFile, 'utf-8'));
}

export async function saveUsers(users: UserAccount[]) { await ensureFile(); await fs.writeFile(usersFile, JSON.stringify(users, null, 2), 'utf-8'); }
