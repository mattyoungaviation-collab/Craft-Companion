import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldHome } from '../services/api';
import { formatDurationFromMinutes, getDurationMinutesFromRunsPerHour } from '../services/durationFormat';
import { getActiveFactoryBoostPercent, getRunsPerHourWithFactoryBoosts, type FactoryBoost } from '../services/factoryBoostModifiers';
import { loadFactoryData, type FactoryDataRow } from '../services/factoryData';
import { applyWorkshopSpeedToDuration, getWorkshopSpeedBoostPercent, type WorkshopItem } from '../services/workshopModifiers';

type OwnedFactory = {
  id?: string;
  areaSymbol?: string;
  level?: number;
  landPlotName?: string;
  currentRunLevel?: number;
  activeBoosts?: FactoryBoost[];
};

type HomeData = {
  lastSyncedAt?: string;
  factories?: OwnedFactory[];
  workshop?: WorkshopItem[];
};

type FactoryProductionRow = {
  key: string;
  symbol: string;
  plotName: string;
  level: number;
  outputToken: string;
  outputAmount: number;
  baseDurationMinutes: number;
  effectiveDurationMinutes: number;
  runsPerHour: number;
  outputPerHour: number;
  outputPerDay: number;
  workshopBoostPercent: number;
  activeBoostPercent: number;
};

type TokenTotal = {
  token: string;
  perHour: number;
  perDay: number;
  factoryCount: number;
};

function fmt(value: number, digits = 3) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function getDisplayLevel(factory: OwnedFactory) {
  return typeof factory.currentRunLevel === 'number'
    ? factory.currentRunLevel + 1
    : typeof factory.level === 'number'
      ? factory.level + 1
      : 0;
}

function getFactoryRow(factoryRows: FactoryDataRow[], factory: OwnedFactory) {
  const symbol = String(factory.areaSymbol || '').trim().toUpperCase();
  const level = getDisplayLevel(factory);
  return factoryRows.find((row) => row.token === symbol && row.level === level) || null;
}

function productionPerHour(outputAmount: number, runsPerHour: number) {
  const amount = Number(outputAmount || 0);
  const runs = Number(runsPerHour || 0);
  if (!Number.isFinite(amount) || !Number.isFinite(runs) || amount <= 0 || runs <= 0) return 0;
  return amount * runs;
}

function buildProductionRows(factories: OwnedFactory[], factoryRows: FactoryDataRow[], workshop: WorkshopItem[]) {
  return factories
    .map((factory, index): FactoryProductionRow | null => {
      const row = getFactoryRow(factoryRows, factory);
      const symbol = String(factory.areaSymbol || '').trim().toUpperCase();
      if (!row || !symbol) return null;

      const workshopDuration = applyWorkshopSpeedToDuration(row.duration_min, row.token, workshop);
      const runsPerHour = getRunsPerHourWithFactoryBoosts(workshopDuration, factory.activeBoosts || []);
      const effectiveDurationMinutes = getDurationMinutesFromRunsPerHour(runsPerHour);
      const perHour = productionPerHour(row.output_amount, runsPerHour);

      return {
        key: factory.id || `${factory.landPlotName || 'plot'}-${symbol}-${row.level}-${index}`,
        symbol,
        plotName: factory.landPlotName || 'Unknown plot',
        level: row.level,
        outputToken: row.output_token,
        outputAmount: row.output_amount,
        baseDurationMinutes: row.duration_min,
        effectiveDurationMinutes,
        runsPerHour,
        outputPerHour: perHour,
        outputPerDay: perHour * 24,
        workshopBoostPercent: getWorkshopSpeedBoostPercent(row.token, workshop),
        activeBoostPercent: getActiveFactoryBoostPercent(factory.activeBoosts || []),
      };
    })
    .filter((value): value is FactoryProductionRow => Boolean(value))
    .sort((a, b) => b.outputPerDay - a.outputPerDay);
}

function buildTokenTotals(rows: FactoryProductionRow[]) {
  const totals = new Map<string, TokenTotal>();

  rows.forEach((row) => {
    const current = totals.get(row.outputToken) || { token: row.outputToken, perHour: 0, perDay: 0, factoryCount: 0 };
    current.perHour += row.outputPerHour;
    current.perDay += row.outputPerDay;
    current.factoryCount += 1;
    totals.set(row.outputToken, current);
  });

  return Array.from(totals.values()).sort((a, b) => b.perDay - a.perDay);
}

function getBestBoostPlacement(rows: FactoryProductionRow[]) {
  const candidates = rows.filter((row) => row.outputPerHour > 0);
  if (!candidates.length) return null;

  return [...candidates].sort((a, b) => {
    const aBaseRunsPerHour = a.baseDurationMinutes > 0 ? 60 / a.baseDurationMinutes : 0;
    const bBaseRunsPerHour = b.baseDurationMinutes > 0 ? 60 / b.baseDurationMinutes : 0;
    const aNaturalOutput = productionPerHour(a.outputAmount, aBaseRunsPerHour);
    const bNaturalOutput = productionPerHour(b.outputAmount, bBaseRunsPerHour);
    return bNaturalOutput - aNaturalOutput;
  })[0];
}

export default function EmpireDashboard() {
  const [home, setHome] = useState<HomeData | null>(null);
  const [factoryRows, setFactoryRows] = useState<FactoryDataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [homeData, rows] = await Promise.all([getCraftworldHome(), loadFactoryData()]);
      setHome(homeData || {});
      setFactoryRows(rows);
    } catch {
      setError('Unable to load empire dashboard data. Refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const productionRows = useMemo(() => {
    return buildProductionRows(home?.factories || [], factoryRows, home?.workshop || []);
  }, [factoryRows, home]);

  const tokenTotals = useMemo(() => buildTokenTotals(productionRows), [productionRows]);
  const bestFactory = productionRows[0] || null;
  const bestBoostPlacement = useMemo(() => getBestBoostPlacement(productionRows), [productionRows]);
  const activeBoostedFactories = productionRows.filter((row) => row.activeBoostPercent > 100).length;
  const totalRunsPerHour = productionRows.reduce((total, row) => total + row.runsPerHour, 0);
  const lastSynced = home?.lastSyncedAt ? new Date(home.lastSyncedAt).toLocaleString() : 'Not connected';

  if (loading) {
    return (
      <Layout>
        <Card title="Empire Dashboard">Loading empire data...</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Empire Dashboard">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1 text-sm text-slate-300">
              <p>
                Live production math using the same trusted runtime path as the factory cards: CSV base duration,
                workshop speed, and active factory boosts.
              </p>
              <p className="text-slate-400">Last synced: {lastSynced}</p>
              {error && <p className="text-red-300">{error}</p>}
            </div>
            <button onClick={load} className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold">
              Refresh Data
            </button>
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-4">
          <Card title="Tracked Factories">{fmt(productionRows.length, 0)}</Card>
          <Card title="Total Runs / Hour">{fmt(totalRunsPerHour, 2)}</Card>
          <Card title="Boosted Factories">{fmt(activeBoostedFactories, 0)}</Card>
          <Card title="Output Tokens">{fmt(tokenTotals.length, 0)}</Card>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="Next Best Action">
            {bestBoostPlacement ? (
              <div className="space-y-2 text-sm">
                <p className="text-lg font-semibold text-emerald-200">
                  Put your strongest boost on {bestBoostPlacement.symbol}.
                </p>
                <p className="text-slate-300">
                  Best target: {bestBoostPlacement.plotName} • Lv {bestBoostPlacement.level} • makes {bestBoostPlacement.outputToken}
                </p>
                <p className="text-slate-400">
                  Current output: {fmt(bestBoostPlacement.outputPerHour)} {bestBoostPlacement.outputToken}/hr,
                  {` ${fmt(bestBoostPlacement.outputPerDay)} ${bestBoostPlacement.outputToken}/day`}.
                </p>
                <p className="text-slate-400">
                  Runtime now: {formatDurationFromMinutes(bestBoostPlacement.effectiveDurationMinutes)}.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No factory production rows are ready yet.</p>
            )}
          </Card>

          <Card title="Top Producer">
            {bestFactory ? (
              <div className="space-y-2 text-sm">
                <p className="text-lg font-semibold">{bestFactory.symbol} on {bestFactory.plotName}</p>
                <p>Lv {bestFactory.level} • Output: {bestFactory.outputToken}</p>
                <p>{fmt(bestFactory.outputPerHour)} / hr</p>
                <p>{fmt(bestFactory.outputPerDay)} / day</p>
                <p className="text-slate-400">Active boost: {fmt(bestFactory.activeBoostPercent, 2)}%</p>
                <p className="text-slate-400">Workshop boost: {fmt(bestFactory.workshopBoostPercent, 2)}%</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No factory production rows are ready yet.</p>
            )}
          </Card>
        </div>

        <Card title="Live Production Per Hour / Day">
          {tokenTotals.length ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {tokenTotals.map((total) => (
                <div key={total.token} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm">
                  <p className="text-lg font-semibold">{total.token}</p>
                  <p>{fmt(total.perHour)} / hr</p>
                  <p>{fmt(total.perDay)} / day</p>
                  <p className="text-xs text-slate-500">{total.factoryCount} producing factory{total.factoryCount === 1 ? '' : 'ies'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No production totals available yet.</p>
          )}
        </Card>

        <Card title="Factory Comparison">
          {productionRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="p-2">Rank</th>
                    <th className="p-2">Factory</th>
                    <th className="p-2">Output</th>
                    <th className="p-2">Runtime</th>
                    <th className="p-2">Runs/Hr</th>
                    <th className="p-2">Output/Hr</th>
                    <th className="p-2">Output/Day</th>
                    <th className="p-2">Workshop</th>
                    <th className="p-2">Active Boost</th>
                  </tr>
                </thead>
                <tbody>
                  {productionRows.map((row, index) => (
                    <tr key={row.key} className="border-t border-slate-800">
                      <td className="p-2">{index + 1}</td>
                      <td className="p-2 font-semibold">{row.plotName} • {row.symbol} • Lv {row.level}</td>
                      <td className="p-2">{fmt(row.outputAmount)} {row.outputToken}</td>
                      <td className="p-2">{formatDurationFromMinutes(row.effectiveDurationMinutes)}</td>
                      <td className="p-2">{fmt(row.runsPerHour, 3)}</td>
                      <td className="p-2">{fmt(row.outputPerHour)} {row.outputToken}</td>
                      <td className="p-2">{fmt(row.outputPerDay)} {row.outputToken}</td>
                      <td className="p-2">{fmt(row.workshopBoostPercent, 2)}%</td>
                      <td className="p-2">{fmt(row.activeBoostPercent, 2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No factory rows matched the CSV yet.</p>
          )}
        </Card>
      </div>
    </Layout>
  );
}
