import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { UserAccount } from '../types.js';

const dataDir = process.env.DATA_DIR || './data';
const usersFile = path.join(dataDir, 'users.json');

async function ensureFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(usersFile);
  } catch {
    await fs.writeFile(usersFile, '[]', 'utf-8');
  }
}

async function resetUsersFile(reason: string) {
  console.warn(`Resetting users file to empty array: ${reason}`);
  await fs.writeFile(usersFile, '[]', 'utf-8');
  return [] as UserAccount[];
}

export async function getUsers(): Promise<UserAccount[]> {
  await ensureFile();
  const raw = await fs.readFile(usersFile, 'utf-8');
  const trimmed = raw.trim();

  if (!trimmed) return resetUsersFile('users.json was empty');

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return resetUsersFile('users.json did not contain an array');
    return parsed as UserAccount[];
  } catch (error: any) {
    return resetUsersFile(error?.message || 'users.json was invalid JSON');
  }
}

export async function saveUsers(users: UserAccount[]) {
  await ensureFile();
  const tempFile = `${usersFile}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(users, null, 2), 'utf-8');
  await fs.rename(tempFile, usersFile);
}
