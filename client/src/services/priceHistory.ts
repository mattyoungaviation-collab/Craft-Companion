export type PriceSnapshot = {
  symbol: string;
  buyPriceCoin?: number;
  sellPriceCoin?: number;
  usdPrice?: number;
  timestamp: string;
  source: string;
  stale: boolean;
  error?: string;
};

export type PriceDelta = {
  oneHourPercent: number | null;
  twentyFourHourPercent: number | null;
  state: 'up' | 'down' | 'neutral' | 'missing';
};

const STORAGE_KEY = 'craftworld.priceHistory.v1';
const MAX_AGE_MS = 25 * 60 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function toMs(timestamp: string) {
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
}

function getComparablePrice(snapshot: PriceSnapshot) {
  return Number(snapshot.sellPriceCoin ?? snapshot.buyPriceCoin ?? 0);
}

export function loadPriceHistory(storage: Storage = window.localStorage): PriceSnapshot[] {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]') as PriceSnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((snapshot) => snapshot?.symbol && toMs(snapshot.timestamp) > nowMs() - MAX_AGE_MS)
      .map((snapshot) => ({ ...snapshot, symbol: snapshot.symbol.toUpperCase() }));
  } catch {
    return [];
  }
}

export function savePriceSnapshots(snapshots: PriceSnapshot[], storage: Storage = window.localStorage) {
  const previous = loadPriceHistory(storage);
  const cutoff = nowMs() - MAX_AGE_MS;
  const merged = [...previous, ...snapshots]
    .filter((snapshot) => snapshot.symbol && toMs(snapshot.timestamp) >= cutoff)
    .map((snapshot) => ({ ...snapshot, symbol: snapshot.symbol.toUpperCase() }))
    .sort((a, b) => toMs(a.timestamp) - toMs(b.timestamp));

  storage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

function nearestSnapshot(history: PriceSnapshot[], symbol: string, targetMs: number) {
  const candidates = history.filter((snapshot) => snapshot.symbol === symbol && getComparablePrice(snapshot) > 0);
  if (!candidates.length) return null;
  return candidates.reduce<PriceSnapshot | null>((best, snapshot) => {
    if (!best) return snapshot;
    return Math.abs(toMs(snapshot.timestamp) - targetMs) < Math.abs(toMs(best.timestamp) - targetMs) ? snapshot : best;
  }, null);
}

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function computePriceDelta(history: PriceSnapshot[], symbol: string, timestamp = new Date().toISOString()): PriceDelta {
  const normalized = symbol.toUpperCase();
  const current = nearestSnapshot(history, normalized, toMs(timestamp));
  if (!current) return { oneHourPercent: null, twentyFourHourPercent: null, state: 'missing' };

  const currentPrice = getComparablePrice(current);
  const oneHour = nearestSnapshot(history, normalized, toMs(timestamp) - 60 * 60 * 1000);
  const twentyFourHour = nearestSnapshot(history, normalized, toMs(timestamp) - 24 * 60 * 60 * 1000);
  const oneHourPercent = oneHour ? percentChange(currentPrice, getComparablePrice(oneHour)) : null;
  const twentyFourHourPercent = twentyFourHour ? percentChange(currentPrice, getComparablePrice(twentyFourHour)) : null;
  const signal = twentyFourHourPercent ?? oneHourPercent;
  const state = signal === null ? 'missing' : signal > 0.1 ? 'up' : signal < -0.1 ? 'down' : 'neutral';

  return { oneHourPercent, twentyFourHourPercent, state };
}
