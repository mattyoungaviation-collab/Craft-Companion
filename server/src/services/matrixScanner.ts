import { loadFactoryCsvData, type FactoryDataRow } from './factoryCsvData.js';
import { getCraftworldExactInputQuote } from './craftworldQuote.js';
import { getMatrixCache, saveMatrixCache } from '../storage/matrixCacheStorage.js';

const REFRESH_MS = 150_000;
const QUOTE_DELAY_MS = 250;
const tokenOrder = [
  'MUD', 'CLAY', 'SAND', 'COPPER', 'STEEL', 'SCREWS',
  'SEAWATER', 'ALGAE', 'OXYGEN', 'GAS', 'FUEL', 'OIL',
  'HEAT', 'LAVA', 'GLASS', 'SULFUR', 'FIBERGLASS',
  'STEAM', 'CERAMICS', 'STONE', 'CEMENT', 'ACID', 'PLASTICS', 'ENERGY', 'HYDROGEN', 'DYNAMITE',
];

let started = false;
let scanning = false;
let nextScanAt = new Date(Date.now() + REFRESH_MS).toISOString();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cellKey(token: string, level: number) {
  return `${token}-${level}`;
}

function orderedTokens(rows: FactoryDataRow[]) {
  const tokens = [...new Set(rows.map((row) => row.token).filter(Boolean))];
  return tokens.sort((a, b) => {
    const indexA = tokenOrder.indexOf(a);
    const indexB = tokenOrder.indexOf(b);
    const normalizedA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
    const normalizedB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
    if (normalizedA !== normalizedB) return normalizedA - normalizedB;
    return a.localeCompare(b);
  });
}

async function quoteTokenToCoin(symbol: string, amount: number) {
  await wait(QUOTE_DELAY_MS);
  return getCraftworldExactInputQuote(
    { inputSymbol: symbol, outputSymbol: 'COIN', inputAmount: amount },
    process.env.CRAFTWORLD_AUTH_TOKEN,
  );
}

async function scanOnce() {
  if (scanning) return;
  scanning = true;
  const scanStartedAt = new Date().toISOString();
  nextScanAt = new Date(Date.now() + REFRESH_MS).toISOString();

  try {
    const rows = await loadFactoryCsvData();
    const tokens = orderedTokens(rows);
    const cache = await getMatrixCache();
    let cells = { ...(cache.cells || {}) };

    await saveMatrixCache({
      ...cache,
      cells,
      scanStatus: 'scanning',
      scanColumn: '',
      scanStartedAt,
      nextScanAt,
      updatedAt: new Date().toISOString(),
    });

    for (const token of tokens) {
      await saveMatrixCache({
        ...cache,
        cells,
        scanStatus: 'scanning',
        scanColumn: token,
        scanStartedAt,
        nextScanAt,
        updatedAt: new Date().toISOString(),
      });

      const columnRows = rows.filter((row) => row.token === token).sort((a, b) => a.level - b.level);
      for (const row of columnRows) {
        try {
          const outputQuote = await quoteTokenToCoin(row.output_token, row.output_amount);
          const input1Quote = await quoteTokenToCoin(row.input_token_1, row.input_amount_1);
          const input2Quote = row.input_token_2 && row.input_amount_2 > 0 ? await quoteTokenToCoin(row.input_token_2, row.input_amount_2) : null;

          const outputSellValue = outputQuote.output.amount || 0;
          const inputBuyCost = (input1Quote.output.amount || 0) + (input2Quote?.output.amount || 0);
          const returnPercent = inputBuyCost > 0 ? ((outputSellValue - inputBuyCost) / inputBuyCost) * 100 : 0;
          const priceImpactPercentage = Math.max(
            outputQuote.details?.priceImpactPercentage || 0,
            input1Quote.details?.priceImpactPercentage || 0,
            input2Quote?.details?.priceImpactPercentage || 0,
          );

          cells = {
            ...cells,
            [cellKey(row.token, row.level)]: {
              inputBuyCost,
              outputSellValue,
              returnPercent,
              priceImpactPercentage,
              isComplete: true,
              updatedAt: new Date().toISOString(),
            },
          };

          await saveMatrixCache({
            ...cache,
            cells,
            scanStatus: 'scanning',
            scanColumn: token,
            scanStartedAt,
            nextScanAt,
            updatedAt: new Date().toISOString(),
          });
        } catch (error: any) {
          console.warn(`Matrix scan failed for ${row.token} level ${row.level}: ${error?.message || error}`);
        }
      }
    }

    await saveMatrixCache({
      ...cache,
      cells,
      scanStatus: 'idle',
      scanColumn: '',
      scanStartedAt,
      nextScanAt,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Matrix scan failed', error?.message || error);
  } finally {
    scanning = false;
  }
}

export function startMatrixScanner() {
  if (started) return;
  started = true;
  scanOnce();
  setInterval(() => {
    nextScanAt = new Date(Date.now() + REFRESH_MS).toISOString();
    scanOnce();
  }, REFRESH_MS);
}
