import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { loadFactoryData, type FactoryDataRow } from '../services/factoryData';

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
  scanStatus?: 'idle' | 'scanning';
  scanColumn?: string;
  scanStartedAt?: string;
  nextScanAt?: string;
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

const API = import.meta.env.VITE_API_BASE_URL || (
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : ''
);
const POLL_MS = 1000;
const EMPTY_MATRIX_CACHE: MatrixCachePayload = { updatedAt: '', scanStatus: 'idle', scanColumn: '', nextScanAt: '', cells: {} };

function formatNumber(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function cellKey(token: string, level: number) {
  return `${token}-${level}`;
}

function getCellClass(value: number) {
  if (!Number.isFinite(value)) return 'bg-slate-950 text-slate-500';
  if (value >= 0) return 'bg-emerald-950/70 text-emerald-300';
  return 'bg-red-950/70 text-red-300';
}

function secondsUntil(dateString?: string) {
  if (!dateString) return 0;
  return Math.max(0, Math.ceil((new Date(dateString).getTime() - Date.now()) / 1000));
}

async function loadMatrixCache(): Promise<MatrixCachePayload> {
  const authToken = localStorage.getItem('token');
  const response = await fetch(`${API}/api/craftworld/matrix-cache?_=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  if (!response.ok) throw new Error('Matrix cache request failed.');
  return response.json();
}

export default function Matrix() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [cache, setCache] = useState<MatrixCachePayload>(EMPTY_MATRIX_CACHE);
  const [selectedGroup, setSelectedGroup] = useState('EARTH');
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const [lastPolledAt, setLastPolledAt] = useState('');
  const [error, setError] = useState('');

  async function refreshCache() {
    try {
      const nextCache = await loadMatrixCache();
      setCache({ ...EMPTY_MATRIX_CACHE, ...nextCache, cells: (nextCache.cells || {}) as Record<string, MatrixCell> });
      setCountdown(secondsUntil(nextCache.nextScanAt));
      setLastPolledAt(new Date().toISOString());
      setError('');
    } catch {
      setError('Unable to load global matrix cache.');
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [factoryRows, matrixCache] = await Promise.all([loadFactoryData(), loadMatrixCache().catch(() => EMPTY_MATRIX_CACHE)]);
        setRows(factoryRows);
        setCache({ ...EMPTY_MATRIX_CACHE, ...matrixCache, cells: (matrixCache.cells || {}) as Record<string, MatrixCell> });
        setCountdown(secondsUntil(matrixCache.nextScanAt));
        setLastPolledAt(new Date().toISOString());
      } catch {
        setError('Unable to load matrix data.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    refreshCache();
    const poll = window.setInterval(refreshCache, POLL_MS);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
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

  if (loading) {
    return (
      <Layout>
        <Card title="Matrix">Loading saved global matrix...</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Matrix">
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              This page reads from the global server matrix cache and forces a fresh poll every second.
            </p>
            <p className="text-sm text-yellow-200">
              The browser no longer scans. It only reloads the saved cache as the server writes new matrix cells.
            </p>
            {error && <p className="text-sm text-red-300">{error}</p>}
            <div className="flex flex-wrap gap-2">
              {Object.keys(tokenGroups).map((group) => (
                <button
                  key={group}
                  onClick={() => setSelectedGroup(group)}
                  className={`rounded border px-3 py-2 text-sm ${selectedGroup === group ? 'border-blue-400 bg-blue-500/20' : 'border-slate-700 bg-slate-950'}`}
                >
                  {group}
                </button>
              ))}
            </div>
            <div className="grid gap-2 text-xs text-slate-400 md:grid-cols-5">
              <p>Next global scan: {countdown}s</p>
              <p>Status: {cache.scanStatus || 'idle'}</p>
              <p>Column: {cache.scanColumn || 'None'}</p>
              <p>Last save: {cache.updatedAt ? new Date(cache.updatedAt).toLocaleString() : 'No save yet'}</p>
              <p>Last poll: {lastPolledAt ? new Date(lastPolledAt).toLocaleTimeString() : 'Never'}</p>
            </div>
          </div>
        </Card>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full border-collapse text-center text-sm">
            <thead className="sticky top-0 bg-slate-950">
              <tr>
                <th className="border border-slate-800 px-3 py-2 text-left text-slate-300">Lvl</th>
                {selectedTokens.map((token) => (
                  <th key={token} className={`border border-slate-800 px-3 py-2 text-slate-300 ${cache.scanColumn === token ? 'bg-blue-500/20' : ''}`}>
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
                    const cell = cache.cells[cellKey(token, level)];
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
                        <td key={`${token}-${level}`} className="border border-slate-800 bg-slate-950 px-3 py-2 text-slate-500" title="Waiting for global cache data">
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
