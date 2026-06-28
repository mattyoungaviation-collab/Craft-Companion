import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRecipeTree,
  calculateCycleWindow,
  calculateFactoryCycle,
  calculateFactoryRuntime,
  calculateCycleTimerStatus,
  calculateProfitPerCycle,
  calculateTimeUntilResources,
  calculateUpgradeRecommendation,
  flattenRecipeToBaseResources,
  type FactoryDataRow,
  type PriceMap,
} from './craftworldCalculations';
import { computePriceDelta, savePriceSnapshots } from './priceHistory';
import { exportPlayerConfig, importPlayerConfig, loadPlayerConfig, savePlayerConfig } from './playerConfig';

const baseRow: FactoryDataRow = {
  token: 'MUD',
  level: 1,
  duration_min: 10,
  output_token: 'MUD',
  output_amount: 10,
  input_token_1: 'EARTH',
  input_amount_1: 5,
  input_token_2: '',
  input_amount_2: 0,
  upgrade_token: 'MUD',
  upgrade_amount: 20,
};

const nextRow: FactoryDataRow = {
  ...baseRow,
  level: 2,
  output_amount: 20,
  input_amount_1: 8,
  upgrade_amount: 30,
};

const prices: PriceMap = { MUD: 2, EARTH: 1 };

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test('base factory with no modifiers', () => {
  const cycle = calculateFactoryCycle(baseRow, prices);
  assert.equal(cycle.runtimeMinutes, 10);
  assert.equal(cycle.outputPerCycle, 10);
  assert.equal(cycle.outputPerHour, 60);
  assert.equal(cycle.inputCostPerCycle, 5);
  assert.equal(cycle.revenuePerCycle, 20);
  assert.equal(cycle.profitPerCycle, 15);
});

test('same factory with 2x boost applied', () => {
  const runtime = calculateFactoryRuntime(baseRow, {
    activeBoosts: [{ source: 'consumable', boostValue: 0.5, startTime: '2020-01-01T00:00:00.000Z' }],
  });
  assert.equal(runtime, 5);
});

test('same factory with workers applied', () => {
  assert.equal(calculateFactoryRuntime(baseRow, { workersPercent: 100 }), 5);
});

test('same factory with workshop applied', () => {
  const runtime = calculateFactoryRuntime(baseRow, { workshop: [{ symbol: 'MUD', level: 2 }] });
  assert.equal(Number(runtime.toFixed(4)), Number((10 / 1.35).toFixed(4)));
});

test('same factory with mastery applied', () => {
  const cycle = calculateFactoryCycle(baseRow, prices, { proficiencies: [{ symbol: 'MUD', claimedLevel: 10 }] });
  assert.equal(Number(cycle.input1PerCycle.toFixed(3)), 4.735);
});

test('multiple factories multiply cycle output and profit', () => {
  const cycle = calculateFactoryCycle(baseRow, prices, { factoryCount: 3 });
  assert.equal(cycle.outputPerCycle, 30);
  assert.equal(cycle.profitPerCycle, 45);
});

test('profit changes when input price changes', () => {
  assert.equal(calculateProfitPerCycle(baseRow, { MUD: 2, EARTH: 1 }), 15);
  assert.equal(calculateProfitPerCycle(baseRow, { MUD: 2, EARTH: 3 }), 5);
});

test('profit changes when output price changes', () => {
  assert.equal(calculateProfitPerCycle(baseRow, { MUD: 2, EARTH: 1 }), 15);
  assert.equal(calculateProfitPerCycle(baseRow, { MUD: 3, EARTH: 1 }), 25);
});

test('negative profit case', () => {
  assert.equal(calculateProfitPerCycle(baseRow, { MUD: 0.25, EARTH: 2 }), -7.5);
});

test('time-until-resources with enough resources already', () => {
  assert.deepEqual(calculateTimeUntilResources(10, 10, 5), { missingAmount: 0, hours: 0, ready: true });
});

test('time-until-resources with missing inputs', () => {
  assert.deepEqual(calculateTimeUntilResources(20, 5, 5), { missingAmount: 15, hours: 3, ready: false });
});

test('recipe tree with nested ingredients', () => {
  const rows: FactoryDataRow[] = [
    baseRow,
    { ...baseRow, token: 'BRICK', output_token: 'BRICK', input_token_1: 'MUD', input_amount_1: 2, output_amount: 1 },
  ];
  const tree = buildRecipeTree(rows, 'BRICK', 1);
  const flat = flattenRecipeToBaseResources(tree);
  assert.equal(flat.EARTH, 1);
});

test('price delta snapshots', () => {
  const storage = new MemoryStorage();
  const now = new Date();
  const history = savePriceSnapshots([
    { symbol: 'MUD', sellPriceCoin: 1, timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), source: 'test', stale: false },
    { symbol: 'MUD', sellPriceCoin: 2, timestamp: now.toISOString(), source: 'test', stale: false },
  ], storage);
  const delta = computePriceDelta(history, 'MUD', now.toISOString());
  assert.equal(delta.twentyFourHourPercent, 100);
  assert.equal(delta.state, 'up');
});

test('localStorage config survives export/import and malformed storage', () => {
  const storage = new MemoryStorage();
  storage.setItem('craftworld.playerConfig.v1', '{bad json');
  assert.deepEqual(loadPlayerConfig(storage).factories, {});
  const saved = savePlayerConfig({ version: 1, updatedAt: '', factories: { MUD: { enabled: true, factoryCount: 2 } as any } }, storage);
  const imported = importPlayerConfig(exportPlayerConfig(saved), storage);
  assert.equal(imported.factories.MUD.factoryCount, 2);
  assert.equal(imported.factories.MUD.enabled, true);
});

test('recommendation ranking prefers fastest ROI when data exists', () => {
  const [best] = calculateUpgradeRecommendation([baseRow, nextRow], prices);
  assert.equal(best.row.token, 'MUD');
  assert.equal(best.row.level, 1);
  assert.equal(best.label, 'Best ROI');
  assert.ok(best.paybackDays !== null);
});

test('cycle timer requires a start time when none is known', () => {
  const status = calculateCycleTimerStatus({ runtimeMinutes: 10, now: '2026-06-28T12:00:00.000Z' });
  assert.equal(status.requiresStartTime, true);
  assert.equal(status.remainingSeconds, 600);
  assert.equal(status.completedCycles, 0);
});

test('cycle timer reports remaining time and completed cycles from persisted start', () => {
  const status = calculateCycleTimerStatus({
    runtimeMinutes: 10,
    startedAt: '2026-06-28T12:00:00.000Z',
    now: '2026-06-28T12:25:30.000Z',
  });
  assert.equal(status.requiresStartTime, false);
  assert.equal(status.completedCycles, 2);
  assert.equal(status.elapsedSeconds, 1530);
  assert.equal(status.remainingSeconds, 270);
  assert.equal(Number(status.progressPercent.toFixed(0)), 55);
});

test('cycle window calculates end time and live difference from start and runtime', () => {
  const window = calculateCycleWindow(10, '2026-06-28T12:00:00.000Z', '2026-06-28T12:04:55.000Z');
  assert.equal(window.hasWindow, true);
  assert.equal(window.startedAt, '2026-06-28T12:00:00.000Z');
  assert.equal(window.endsAt, '2026-06-28T12:10:00.000Z');
  assert.equal(window.durationSeconds, 600);
  assert.equal(window.secondsUntilEnd, 305);
  assert.equal(window.ended, false);
});

test('cycle window marks missing start time as incomplete', () => {
  const window = calculateCycleWindow(10);
  assert.equal(window.hasWindow, false);
  assert.equal(window.endsAt, undefined);
  assert.equal(window.durationSeconds, 600);
  assert.equal(window.secondsUntilEnd, 600);
  assert.equal(window.ended, false);
});

test('cycle window marks elapsed end times as ended', () => {
  const window = calculateCycleWindow(10, '2026-06-28T12:00:00.000Z', '2026-06-28T12:10:05.000Z');
  assert.equal(window.hasWindow, true);
  assert.equal(window.secondsUntilEnd, 0);
  assert.equal(window.ended, true);
});
