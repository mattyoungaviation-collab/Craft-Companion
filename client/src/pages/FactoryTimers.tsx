import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import Layout from '../components/Layout';
import { getCraftworldHome } from '../services/api';
import {
  calculateCycleWindow,
  calculateCycleTimerStatus,
  calculateFactoryCycle,
  type FactoryDataRow,
} from '../services/craftworldCalculations';
import { formatDurationFromMinutes } from '../services/durationFormat';
import { type FactoryBoost } from '../services/factoryBoostModifiers';
import { loadFactoryData } from '../services/factoryData';
import { type WorkshopItem } from '../services/workshopModifiers';

type OwnedFactory = {
  id?: string;
  areaSymbol?: string;
  level?: number;
  landPlotName?: string;
  currentRunLevel?: number;
  startedAt?: string;
  claimedAt?: string;
  unclaimedUnitsBeforeCurrentRun?: number;
  activeBoosts?: FactoryBoost[];
};

type HomeData = {
  factories?: OwnedFactory[];
  workshop?: WorkshopItem[];
  lastSyncedAt?: string;
};

type StoredTimer = {
  startedAt?: string;
  pausedAt?: string;
  manual?: boolean;
};

const STORAGE_KEY = 'craftworld.factoryTimers.v1';

function fmt(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
}

function formatSeconds(seconds: number) {
  return formatDurationFromMinutes(Math.max(seconds, 0) / 60);
}

function formatTimeToEnd(seconds: number, ended: boolean) {
  return ended ? 'Ready' : formatSeconds(seconds);
}

function formatTimestamp(value?: string) {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function timerSource(factory: OwnedFactory, timer?: StoredTimer) {
  if (timer?.manual && timer.startedAt) return 'Manual override';
  if (factory.startedAt) return 'Craft World API';
  return 'Missing start time';
}

function timerStartedAt(factory: OwnedFactory, timer?: StoredTimer) {
  if (timer?.manual && timer.startedAt) return timer.startedAt;
  return factory.startedAt;
}

function timerPausedAt(timer?: StoredTimer) {
  return timer?.manual ? timer.pausedAt : undefined;
}

function getDisplayLevel(factory: OwnedFactory) {
  return typeof factory.currentRunLevel === 'number'
    ? factory.currentRunLevel + 1
    : typeof factory.level === 'number'
      ? factory.level + 1
      : 0;
}

function loadTimers(): Record<string, StoredTimer> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, StoredTimer>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveTimers(timers: Record<string, StoredTimer>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
}

export default function FactoryTimers() {
  const [rows, setRows] = useState<FactoryDataRow[]>([]);
  const [home, setHome] = useState<HomeData | null>(null);
  const [timers, setTimers] = useState<Record<string, StoredTimer>>({});
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setTimers(loadTimers());
    const interval = window.setInterval(() => setNow(new Date()), 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [factoryRows, homeData] = await Promise.all([loadFactoryData(), getCraftworldHome()]);
        setRows(factoryRows);
        setHome(homeData || {});
      } catch {
        setError('Unable to load factory timer data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const timerRows = useMemo(() => {
    return (home?.factories || [])
      .map((factory, index) => {
        const symbol = String(factory.areaSymbol || '').trim().toUpperCase();
        const level = getDisplayLevel(factory);
        const row = rows.find((item) => item.token === symbol && item.level === level) || null;
        if (!symbol || !row) return null;
        const key = factory.id || `${factory.landPlotName || 'plot'}-${symbol}-${level}-${index}`;
        const cycle = calculateFactoryCycle(row, {}, { workshop: home?.workshop || [], activeBoosts: factory.activeBoosts || [] });
        const storedTimer = timers[key];
        const startedAt = timerStartedAt(factory, storedTimer);
        const cycleWindow = calculateCycleWindow(cycle.runtimeMinutes, startedAt, now);
        const status = calculateCycleTimerStatus({
          runtimeMinutes: cycle.runtimeMinutes,
          startedAt,
          pausedAt: timerPausedAt(storedTimer),
          now,
        });
        return {
          key,
          factory,
          row,
          cycle,
          status,
          cycleWindow,
          source: timerSource(factory, storedTimer),
          startedAt,
          estimatedCompleted: Math.max(0, Number(factory.unclaimedUnitsBeforeCurrentRun || 0)) + status.completedCycles,
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
  }, [home, now, rows, timers]);

  function updateTimer(key: string, timer: StoredTimer) {
    const next = { ...timers, [key]: timer };
    setTimers(next);
    saveTimers(next);
  }

  function resetTimer(key: string) {
    const next = { ...timers };
    delete next[key];
    setTimers(next);
    saveTimers(next);
  }

  if (loading) {
    return (
      <Layout>
        <Card title="Factory Timers">Loading timers...</Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <Card title="Factory Timers">
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              Timers use Craft World API startedAt timestamps when available. Manual starts are still available as a local override.
            </p>
            <p className="text-slate-400">Last synced: {home?.lastSyncedAt ? new Date(home.lastSyncedAt).toLocaleString() : 'Not connected'}</p>
            {error && <p className="text-red-300">{error}</p>}
          </div>
        </Card>

        <Card title="Active Factories">
          {timerRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1220px] text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="p-2">Factory</th>
                    <th className="p-2">Runtime</th>
                    <th className="p-2">Source</th>
                    <th className="p-2">Started</th>
                    <th className="p-2">Ends</th>
                    <th className="p-2">Time to End</th>
                    <th className="p-2">Cycles / Hr</th>
                    <th className="p-2">Cycles / Day</th>
                    <th className="p-2">Remaining</th>
                    <th className="p-2">Progress</th>
                    <th className="p-2">Est. Complete</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {timerRows.map(({ key, factory, row, cycle, status, cycleWindow, source, startedAt, estimatedCompleted }) => (
                    <tr key={key} className="border-t border-slate-800">
                      <td className="p-2 font-semibold">{factory.landPlotName || 'Unknown plot'} • {row.token} Lv {row.level}</td>
                      <td className="p-2">{formatDurationFromMinutes(cycle.runtimeMinutes)}</td>
                      <td className="p-2">{source}</td>
                      <td className="p-2">{formatTimestamp(startedAt)}</td>
                      <td className="p-2">{formatTimestamp(cycleWindow.endsAt)}</td>
                      <td className="p-2">{cycleWindow.hasWindow ? formatTimeToEnd(cycleWindow.secondsUntilEnd, cycleWindow.ended) : 'Waiting for start time'}</td>
                      <td className="p-2">{fmt(cycle.runsPerHour, 3)}</td>
                      <td className="p-2">{fmt(cycle.runsPerDay, 2)}</td>
                      <td className="p-2">
                        {status.requiresStartTime ? 'Cycle countdown requires start time sync' : formatSeconds(status.remainingSeconds)}
                        {status.paused ? ' (paused)' : ''}
                      </td>
                      <td className="p-2">
                        <div className="h-2 w-32 rounded bg-slate-800">
                          <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(status.progressPercent, 100)}%` }} />
                        </div>
                        <span className="text-xs text-slate-400">{fmt(status.progressPercent, 1)}%</span>
                      </td>
                      <td className="p-2">
                        {estimatedCompleted}
                        {factory.unclaimedUnitsBeforeCurrentRun ? (
                          <span className="ml-1 text-xs text-slate-400">({factory.unclaimedUnitsBeforeCurrentRun} unclaimed before current)</span>
                        ) : null}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => updateTimer(key, { startedAt: new Date().toISOString(), manual: true })} className="rounded bg-blue-600 px-3 py-1 font-semibold">Manual start</button>
                          <button
                            onClick={() => {
                              const existing = timers[key];
                              if (!existing?.manual || !existing.startedAt) return;
                              updateTimer(key, existing.pausedAt ? { startedAt: existing.startedAt, manual: true } : { ...existing, pausedAt: new Date().toISOString(), manual: true });
                            }}
                            className="rounded bg-slate-700 px-3 py-1 font-semibold"
                            disabled={!timers[key]?.manual}
                          >
                            {timers[key]?.pausedAt ? 'Resume' : 'Pause'}
                          </button>
                          <button onClick={() => resetTimer(key)} className="rounded bg-red-700 px-3 py-1 font-semibold">Use API</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No matched live factories were found yet.</p>
          )}
        </Card>
      </div>
    </Layout>
  );
}
