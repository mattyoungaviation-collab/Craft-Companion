import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const dataDir = process.env.DATA_DIR || './data';
const matrixCacheFile = path.join(dataDir, 'matrix-cache.json');

export type MatrixCachePayload = {
  updatedAt: string;
  selectedGroup?: string;
  scanStatus?: 'idle' | 'scanning';
  scanColumn?: string;
  scanStartedAt?: string;
  nextScanAt?: string;
  cells: Record<string, unknown>;
};

async function ensureCacheFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(matrixCacheFile);
  } catch {
    await fs.writeFile(matrixCacheFile, JSON.stringify({ updatedAt: '', scanStatus: 'idle', cells: {} }, null, 2), 'utf-8');
  }
}

export async function getMatrixCache(): Promise<MatrixCachePayload> {
  await ensureCacheFile();
  try {
    const raw = await fs.readFile(matrixCacheFile, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    return {
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      selectedGroup: typeof parsed.selectedGroup === 'string' ? parsed.selectedGroup : undefined,
      scanStatus: parsed.scanStatus === 'scanning' ? 'scanning' : 'idle',
      scanColumn: typeof parsed.scanColumn === 'string' ? parsed.scanColumn : '',
      scanStartedAt: typeof parsed.scanStartedAt === 'string' ? parsed.scanStartedAt : '',
      nextScanAt: typeof parsed.nextScanAt === 'string' ? parsed.nextScanAt : '',
      cells: parsed.cells && typeof parsed.cells === 'object' ? parsed.cells : {},
    };
  } catch {
    return { updatedAt: '', scanStatus: 'idle', cells: {} };
  }
}

export async function saveMatrixCache(payload: MatrixCachePayload) {
  await ensureCacheFile();
  const safePayload: MatrixCachePayload = {
    updatedAt: payload.updatedAt || new Date().toISOString(),
    selectedGroup: payload.selectedGroup,
    scanStatus: payload.scanStatus || 'idle',
    scanColumn: payload.scanColumn || '',
    scanStartedAt: payload.scanStartedAt || '',
    nextScanAt: payload.nextScanAt || '',
    cells: payload.cells || {},
  };
  const tempFile = `${matrixCacheFile}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(safePayload, null, 2), 'utf-8');
  await fs.rename(tempFile, matrixCacheFile);
  return safePayload;
}
