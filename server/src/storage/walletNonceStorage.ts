import { promises as fs } from 'node:fs';
import path from 'node:path';

type WalletNonceRecord = {
  address: string;
  nonce: string;
  message: string;
  createdAt: string;
  expiresAt: string;
};

const dataDir = process.env.DATA_DIR || './data';
const noncesFile = path.join(dataDir, 'wallet-nonces.json');

async function ensureFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(noncesFile);
  } catch {
    await fs.writeFile(noncesFile, '[]', 'utf-8');
  }
}

async function getNonces(): Promise<WalletNonceRecord[]> {
  await ensureFile();
  return JSON.parse(await fs.readFile(noncesFile, 'utf-8'));
}

async function saveNonces(records: WalletNonceRecord[]) {
  await ensureFile();
  await fs.writeFile(noncesFile, JSON.stringify(records, null, 2), 'utf-8');
}

export async function createWalletNonce(address: string): Promise<WalletNonceRecord> {
  const normalizedAddress = address.toLowerCase();
  const now = new Date();
  const nonce = crypto.randomUUID();
  const message = [
    'Sign in to Craft Companion',
    '',
    `Wallet: ${normalizedAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${now.toISOString()}`,
  ].join('\n');

  const record: WalletNonceRecord = {
    address: normalizedAddress,
    nonce,
    message,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
  };

  const records = (await getNonces()).filter((item) => item.address !== normalizedAddress);
  records.push(record);
  await saveNonces(records);
  return record;
}

export async function consumeWalletNonce(address: string, message: string): Promise<WalletNonceRecord | null> {
  const normalizedAddress = address.toLowerCase();
  const records = await getNonces();
  const record = records.find((item) => item.address === normalizedAddress && item.message === message) || null;
  await saveNonces(records.filter((item) => item !== record));

  if (!record) return null;
  if (new Date(record.expiresAt).getTime() < Date.now()) return null;
  return record;
}
