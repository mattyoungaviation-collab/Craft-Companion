import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldQuote } from '../services/api';
import { loadFactoryData, type FactoryDataRow } from '../services/factoryData';
import { enqueueQuoteRequest } from '../utils/rateLimit';

type Quote = {
  input: { symbol: string; amount: number };
  output: { symbol: string; amount: number };
  details?: { priceImpactPercentage?: number };
};

type MatrixCell = {
  inputBuyCost: number;
  outputSellValue: number;
  returnPercent: number;
  priceImpactPercentage: number;
  isComplete: boolean;
  updatedAt: string;
};

type MatrixCachePayload = {
  updatedAt: string;
  selectedGroup?: string;
  cells: Record<string, MatrixCell>;
};

const tokenOrder = [
  'MUD',
  'CLAY',
  'SAND',
  'COPPER',
  'STEEL',
  'SCREWS',
  'SEAWATER',
  'HEAT',
  'ALGAE',
  'LAVA',
  'OXYGEN',
  'GAS',
  'FUEL',
  'OIL',
  'GLASS',
  'SULFUR',
  'FIBERGLASS',
  'STEAM',
  'CERAMICS',
  'STONE',
  'CEMENT',
  'ACID',
  'PLASTICS',
  'ENERGY',
  'HYDROGEN',
  'DYNAMITE',
];

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const REFRESH_SECONDS = 150;

function formatNumber(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function quoteKey(symbol: string, amount: number) {
  return `${symbol.toUpperCase()}-${amount}`;
}

function cellKey(token: string, level: number) {
  return `${token}-${level}`;
}

function getCellClass(value: number) {
  if (!Number.isFinite(value)) return 'bg-slate-950 text-slate-500';
  if (value >= 0) return 'bg-emerald-950/70 text-emerald-300';
  return 'bg-red-950/70 text-red-300';
}

async function matrixCacheRequest(path: string, init: RequestInit = {}) {
  const authToken = localStorage.getItem('token');
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) throw new Error('Matrix cache request failed.');
  return response.json();
}

async function loadMatrixCache(): Promise<MatrixCachePayload> {
  return matrixCacheRequest('/api/craftworld/matrix-cache');
}

async function saveMatrixCache(selectedGroup: string, cells: Record<string, MatrixCell>) {
  return matrixCacheRequest('/api/craftworld/matrix-cache', {
    method: 'PUT',
    body: JSON.stringify({ selectedGroup, cells }),
  });
}

export default function Matrix() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [matrixCells, setMatrixCells] = useState<Record<string, MatrixCell>>({});
  const [selectedGroup, setSelectedGroup] = useState('EARTH');
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [scanColumn, setScanColumn] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [error, setError] = useState('');
  const matrixRef = useRef<Record<string, MatrixCell>>({});
  const scanRunningRef = useRef(false);

  useEffect(() => {
    matrixRef.current = matrixCells;
  }, [matrixCells]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [factoryRows, cache] = await Promise.all([loadFactoryData(), loadMatrixCache().catch(() => ({ updatedAt: '', cells: {} }))]);
        setRows(factoryRows);
        setMatrixCells((cache.cells || {}) as Record<string, MatrixCell>);
        matrixRef.current = (cache.cells || {}) as Record<string, MatrixCell>;
        if (cache.selectedGroup) setSelectedGroup(cache.selectedGroup);
        setLastSavedAt(cache.updatedAt || '');
      } catch {
        setError('Unable to load matrix data.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const tokenGroups = useMemo(() => {
    const available = [...new Set(rows.map((row) => row.token))];
    return {
      EARTH: available.filter((token) => ['MUD', 'CLAY', 'SAND', 'COPPER', 'STEEL', 'SCREWS'].includes(token)),
      WATER: available.filter((token) => ['SEAWATER', 'ALGAE', 'OXYGEN', 'GAS', 'FUEL', 'OIL'].includes(token)),
      FIRE: available.filter((token) => ['HEAT', 'LAVA', 'GLASS', 'SULFUR', 'FIBERGLASS'].includes(token)),
      ADVANCED: available.filter((token) => !['MUD', 'CLAY', 'SAND', 'COPPER', 'STEEL', 'SCREWS', 'SEAWATER', 'ALGAE', 'OXYGEN', 'GAS', 'FUEL', 'OIL', 'HEAT', 'LAVA', 'GLASS', 'SULFUR', 'FIBERGLASS'].includes(token)),
    };
  }, [rows]);

  const selectedTokens = useMemo(() => {
    const groupTokens = tokenGroups[selectedGroup as keyof typeof tokenGroups] || [];
    return [...groupTokens].sort((a, b) => {
      const indexA = tokenOrder.indexOf(a);
      const indexB = tokenOrder.indexOf(b);
      const normalizedA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
      const normalizedB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
      if (normalizedA !== normalizedB) return normalizedA - normalizedB;
      return a.localeCompare(b);
    });
  }, [selectedGroup, tokenGroups]);

  const maxLevel = useMemo(() => {
    const levels = rows.filter((row) => selectedTokens.includes(row.token)).map((row) => row.level);
    return levels.length ? Math.max(...levels) : 0;
  }, [rows, selectedTokens]);

  const rowsByToken = useMemo(() => {
    return selectedTokens.reduce<Record<string, FactoryDataRow[]>>((acc, token) => {
      acc[token] = rows.filter((row) => row.token === token).sort((a, b) => a.level - b.level);
      return acc;
    }, {});
  }, [rows, selectedTokens]);

  async function getSellQuote(row: FactoryDataRow) {
    return enqueueQuoteRequest(() =>
      getCraftworldQuote({
        inputSymbol: row.output_token,
        outputSymbol: 'COIN',
        inputAmount: row.output_amount,
      }),
    );
  }

  async function getInputValueQuote(symbol: string, amount: number) {
    return enqueueQuoteRequest(() =>
      getCraftworldQuote({
        inputSymbol: symbol,
        outputSymbol: 'COIN',
        inputAmount: amount,
      }),
    );
  }

  async function scanMatrix() {
    if (scanRunningRef.current || !selectedTokens.length) return;
    scanRunningRef.current = true;
    setScanLoading(true);
    setError('');

    try {
      for (const token of selectedTokens) {
        setScanColumn(token);
        const columnRows = rowsByToken[token] || [];
        const columnUpdates: Record<string, MatrixCell> = {};

        for (const row of columnRows) {
          try {
            const outputQuote = await getSellQuote(row);
            const input1Quote = await getInputValueQuote(row.input_token_1, row.input_amount_1);
            const input2Quote = row.input_token_2 && row.input_amount_2 > 0 ? await getInputValueQuote(row.input_token_2, row.input_amount_2) : null;

            const outputSellValue = outputQuote.output.amount || 0;
            const inputBuyCost = (input1Quote.output.amount || 0) + (input2Quote?.output.amount || 0);
            const returnPercent = inputBuyCost > 0 ? ((outputSellValue - inputBuyCost) / inputBuyCost) * 100 : 0;
            const priceImpactPercentage = Math.max(
              outputQuote.details?.priceImpactPercentage || 0,
              input1Quote.details?.priceImpactPercentage || 0,
              input2Quote?.details?.priceImpactPercentage || 0,
            );

            columnUpdates[cellKey(row.token, row.level)] = {
              inputBuyCost,
              outputSellValue,
              returnPercent,
              priceImpactPercentage,
              isComplete: true,
              updatedAt: new Date().toISOString(),
            };
          } catch {
            const previous = matrixRef.current[cellKey(row.token, row.level)];
            if (previous) columnUpdates[cellKey(row.token, row.level)] = previous;
          }
        }

        const merged = { ...matrixRef.current, ...columnUpdates };
        matrixRef.current = merged;
        setMatrixCells(merged);
        try {
          const saved = await saveMatrixCache(selectedGroup, merged);
          setLastSavedAt(saved.updatedAt || new Date().toISOString());
        } catch {
          setError('Matrix updated in browser, but disk save failed.');
        }
      }
    } finally {
      setScanColumn('');
      setScanLoading(false);
      setCountdown(REFRESH_SECONDS);
      scanRunningRef.current = false;
    }
  }

  useEffect(() => {
    if (!loading && rows.length && selectedTokens.length) scanMatrix();
  }, [loading, rows.length, selectedGroup, selectedTokens.join('|')]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          scanMatrix();
          return REFRESH_SECONDS;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [rows.length, selectedGroup, selectedTokens.join('|')]);

  if (loading) {
    return (
      <Layout>
        <Card title="Matrix">Loading saved matrix data...</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Matrix">
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Instant matrix loads from the last disk save, then scans live updates from left to right. Green is profitable. Red is negative.
            </p>
            <p className="text-sm text-yellow-200">
              Quotes are limited to one call every 0.25 seconds. The matrix refreshes every 2.5 minutes and overwrites the previous disk cache to save space.
            </p>
            {error && <p className="text-sm text-red-300">{error}</p>}
            <div className="flex flex-wrap gap-2">
              {Object.keys(tokenGroups).map((group) => (
                <button
                  key={group}
                  onClick={() => {
                    setSelectedGroup(group);
                    setCountdown(REFRESH_SECONDS);
                  }}
                  className={`rounded border px-3 py-2 text-sm ${selectedGroup === group ? 'border-blue-400 bg-blue-500/20' : 'border-slate-700 bg-slate-950'}`}
                >
                  {group}
                </button>
              ))}
            </div>
            <div className="grid gap-2 text-xs text-slate-400 md:grid-cols-3">
              <p>Next auto scan: {countdown}s</p>
              <p>{scanLoading ? `Scanning column: ${scanColumn || 'starting'}` : 'Scan idle'}</p>
              <p>Last disk save: {lastSavedAt ? new Date(lastSavedAt).toLocaleString() : 'No save yet'}</p>
            </div>
          </div>
        </Card>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full border-collapse text-center text-sm">
            <thead className="sticky top-0 bg-slate-950">
              <tr>
                <th className="border border-slate-800 px-3 py-2 text-left text-slate-300">Lvl</th>
                {selectedTokens.map((token) => (
                  <th key={token} className={`border border-slate-800 px-3 py-2 text-slate-300 ${scanColumn === token ? 'bg-blue-500/20' : ''}`}>
                    {token}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxLevel }, (_, index) => index + 1).map((level) => (
                <tr key={level}>
                  <td className="border border-slate-800 bg-slate-950 px-3 py-2 text-left text-slate-300">{level}</td>
                  {selectedTokens.map((token) => {
                    const cell = matrixCells[cellKey(token, level)];
                    const hasFactoryLevel = Boolean(rows.find((row) => row.token === token && row.level === level));
                    if (!hasFactoryLevel) {
                      return (
                        <td key={`${token}-${level}`} className="border border-slate-800 bg-slate-950 px-3 py-2 text-slate-700">
                          ·
                        </td>
                      );
                    }

                    if (!cell?.isComplete) {
                      return (
                        <td key={`${token}-${level}`} className="border border-slate-800 bg-slate-950 px-3 py-2 text-slate-500" title="Waiting for saved or live data">
                          ...
                        </td>
                      );
                    }

                    return (
                      <td
                        key={`${token}-${level}`}
                        className={`border border-slate-800 px-3 py-2 font-mono ${getCellClass(cell.returnPercent)}`}
                        title={`Output sell value ${formatNumber(cell.outputSellValue, 6)} COIN • Input buy cost ${formatNumber(cell.inputBuyCost, 6)} COIN • Impact ${formatNumber(cell.priceImpactPercentage, 2)}% • Updated ${new Date(cell.updatedAt).toLocaleString()}`}
                      >
                        {cell.returnPercent >= 0 ? '+' : ''}{formatNumber(cell.returnPercent, 2)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
