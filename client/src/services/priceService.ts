import { getCraftworldBuyQuote, getCraftworldQuote } from './api';
import { savePriceSnapshots, type PriceSnapshot } from './priceHistory';

export type LivePriceResult = {
  symbol: string;
  buyPriceCoin?: number;
  sellPriceCoin?: number;
  usdPrice?: number;
  timestamp: string;
  source: string;
  stale: boolean;
  error?: string;
};

const CACHE_KEY = 'craftworld.latestPrices.v1';
const SOURCE = 'craftworld-quote-api';

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function loadCachedPrices(storage: Storage = window.localStorage): Record<string, LivePriceResult> {
  try {
    return JSON.parse(storage.getItem(CACHE_KEY) || '{}') as Record<string, LivePriceResult>;
  } catch {
    return {};
  }
}

function saveCachedPrices(prices: Record<string, LivePriceResult>, storage: Storage = window.localStorage) {
  storage.setItem(CACHE_KEY, JSON.stringify(prices));
}

export async function fetchLiveTokenPrice(symbol: string, storage: Storage = window.localStorage): Promise<LivePriceResult> {
  const normalized = normalizeSymbol(symbol);
  const timestamp = new Date().toISOString();

  try {
    const [sellQuote, buyQuote] = await Promise.all([
      getCraftworldQuote({ inputSymbol: normalized, outputSymbol: 'COIN', inputAmount: 1 }),
      getCraftworldBuyQuote({ inputSymbol: 'COIN', outputSymbol: normalized, outputAmount: 1 }),
    ]);
    const result: LivePriceResult = {
      symbol: normalized,
      sellPriceCoin: Number(sellQuote.output.amount || 0),
      buyPriceCoin: Number(buyQuote.input.amount || 0),
      timestamp,
      source: SOURCE,
      stale: false,
    };
    const cache = loadCachedPrices(storage);
    cache[normalized] = result;
    saveCachedPrices(cache, storage);
    savePriceSnapshots([result as PriceSnapshot], storage);
    return result;
  } catch (error) {
    const cached = loadCachedPrices(storage)[normalized];
    if (cached) return { ...cached, stale: true, error: error instanceof Error ? error.message : 'Price refresh failed' };
    return {
      symbol: normalized,
      timestamp,
      source: SOURCE,
      stale: true,
      error: error instanceof Error ? error.message : 'Price refresh failed',
    };
  }
}

export async function fetchLiveTokenPrices(symbols: string[], storage: Storage = window.localStorage) {
  const uniqueSymbols = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean)));
  const results = await Promise.all(uniqueSymbols.map((symbol) => fetchLiveTokenPrice(symbol, storage)));
  return results.reduce<Record<string, LivePriceResult>>((acc, result) => {
    acc[result.symbol] = result;
    return acc;
  }, {});
}
