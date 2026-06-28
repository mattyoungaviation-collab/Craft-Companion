import { getDurationMinutesFromRunsPerHour } from './durationFormat';
import {
  applyFactoryBoostsToDuration,
  getActiveFactoryBoostPercent,
  getTotalFactoryBoostMultiplier,
  type FactoryBoost,
} from './factoryBoostModifiers';
import {
  applyMasteryInputReduction,
  getMasteryInputReductionPercent,
  getMasteryLevel,
  type ProficiencyItem,
} from './masteryModifiers';
import {
  applyWorkshopSpeedToDuration,
  getWorkshopSpeedBoostPercent,
  type WorkshopItem,
} from './workshopModifiers';

export type FactoryDataRow = {
  token: string;
  level: number;
  duration_min: number;
  output_token: string;
  output_amount: number;
  input_token_1: string;
  input_amount_1: number;
  input_token_2: string;
  input_amount_2: number;
  upgrade_token: string;
  upgrade_amount: number;
};

export type PriceMap = Record<string, number>;

export type QuoteLike = {
  input?: { symbol?: string; amount?: number };
  output?: { symbol?: string; amount?: number };
  details?: { priceImpactPercentage?: number };
} | null;

export type RuntimeContext = {
  factoryCount?: number;
  activeBoosts?: FactoryBoost[];
  workshop?: WorkshopItem[];
  proficiencies?: ProficiencyItem[];
  manualBoostMultiplier?: number;
  workersPercent?: number;
};

export type RecipeNode = {
  token: string;
  amount: number;
  row?: FactoryDataRow;
  children: RecipeNode[];
  circular?: boolean;
  missingRecipe?: boolean;
};

export type FactoryCycleResult = {
  row: FactoryDataRow;
  factoryCount: number;
  runtimeMinutes: number;
  runsPerHour: number;
  runsPerDay: number;
  outputPerCycle: number;
  outputPerHour: number;
  outputPerDay: number;
  input1PerCycle: number;
  input2PerCycle: number;
  inputCostPerCycle: number;
  revenuePerCycle: number;
  profitPerCycle: number;
  profitPerHour: number;
  profitPerDay: number;
  marginPercent: number | null;
  xpPerCycle: number;
  xpPerHour: number;
  xpPerDay: number;
  xpPerCoin: number | null;
  powerCostPerCycle: number;
  powerCostPerHour: number;
  workshopBoostPercent: number;
  activeBoostPercent: number;
  activeBoostMultiplier: number;
  masteryLevel: number;
  masteryReductionPercent: number;
  missingPrices: string[];
};

export type UpgradeRecommendation = {
  row: FactoryDataRow;
  nextRow?: FactoryDataRow;
  label: 'Best ROI' | 'Best profit gain' | 'Best XP gain' | 'Bottleneck fix' | 'Not enough data';
  reason: string;
  addedProfitPerDay: number;
  addedProductionPerDay: number;
  addedXpPerDay: number;
  upgradeCost: number | null;
  paybackDays: number | null;
  warning?: string;
};

export type CycleTimerInput = {
  runtimeMinutes: number;
  startedAt?: string | null;
  pausedAt?: string | null;
  now?: string | Date;
};

export type CycleTimerStatus = {
  runtimeSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  completedCycles: number;
  progressPercent: number;
  requiresStartTime: boolean;
  paused: boolean;
};

export type CycleWindow = {
  startedAt?: string;
  endsAt?: string;
  durationSeconds: number;
  secondsUntilEnd: number;
  hasWindow: boolean;
  ended: boolean;
};

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSymbol(symbol?: string) {
  return String(symbol || '').trim().toUpperCase();
}

function clampPositive(value: number, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getFactoryCount(context: RuntimeContext = {}) {
  const count = Math.floor(finiteNumber(context.factoryCount, 1));
  return count > 0 ? count : 1;
}

function getManualBoostMultiplier(context: RuntimeContext = {}) {
  const multiplier = finiteNumber(context.manualBoostMultiplier, 1);
  return multiplier > 0 ? multiplier : 1;
}

function getWorkerMultiplier(context: RuntimeContext = {}) {
  const percent = finiteNumber(context.workersPercent, 0);
  return percent > 0 ? 1 + percent / 100 : 1;
}

export function calculateFactoryRuntime(row: FactoryDataRow, context: RuntimeContext = {}) {
  const workshopDuration = applyWorkshopSpeedToDuration(row.duration_min, row.token, context.workshop || []);
  const boostedDuration = applyFactoryBoostsToDuration(workshopDuration, context.activeBoosts || []);
  const manualDuration = boostedDuration / getManualBoostMultiplier(context);
  const workerDuration = manualDuration / getWorkerMultiplier(context);
  return clampPositive(workerDuration, 0);
}

export function calculateFactoryOutput(row: FactoryDataRow, context: RuntimeContext = {}) {
  return row.output_amount * getFactoryCount(context);
}

export function calculateProductionPerHour(row: FactoryDataRow, context: RuntimeContext = {}) {
  const runtimeMinutes = calculateFactoryRuntime(row, context);
  return runtimeMinutes > 0 ? calculateFactoryOutput(row, context) * (MINUTES_PER_HOUR / runtimeMinutes) : 0;
}

export function calculateProductionPerDay(row: FactoryDataRow, context: RuntimeContext = {}) {
  return calculateProductionPerHour(row, context) * HOURS_PER_DAY;
}

export function calculateAdjustedInputAmount(row: FactoryDataRow, amount: number, context: RuntimeContext = {}) {
  return applyMasteryInputReduction(amount, row.token, context.proficiencies || []);
}

export function calculateInputCost(row: FactoryDataRow, prices: PriceMap, context: RuntimeContext = {}) {
  const input1Amount = calculateAdjustedInputAmount(row, row.input_amount_1, context);
  const input2Amount = row.input_token_2 ? calculateAdjustedInputAmount(row, row.input_amount_2, context) : 0;
  const input1Price = finiteNumber(prices[normalizeSymbol(row.input_token_1)], 0);
  const input2Price = row.input_token_2 ? finiteNumber(prices[normalizeSymbol(row.input_token_2)], 0) : 0;
  return (input1Amount * input1Price + input2Amount * input2Price) * getFactoryCount(context);
}

export function calculateRevenue(row: FactoryDataRow, prices: PriceMap, context: RuntimeContext = {}) {
  return calculateFactoryOutput(row, context) * finiteNumber(prices[normalizeSymbol(row.output_token)], 0);
}

export function calculateProfitPerCycle(row: FactoryDataRow, prices: PriceMap, context: RuntimeContext = {}) {
  return calculateRevenue(row, prices, context) - calculateInputCost(row, prices, context);
}

export function calculateProfitPerHour(row: FactoryDataRow, prices: PriceMap, context: RuntimeContext = {}) {
  const runtimeMinutes = calculateFactoryRuntime(row, context);
  return runtimeMinutes > 0 ? calculateProfitPerCycle(row, prices, context) * (MINUTES_PER_HOUR / runtimeMinutes) : 0;
}

export function calculateProfitPerDay(row: FactoryDataRow, prices: PriceMap, context: RuntimeContext = {}) {
  return calculateProfitPerHour(row, prices, context) * HOURS_PER_DAY;
}

export function calculatePowerCostPerHour(row: FactoryDataRow, context: RuntimeContext = {}) {
  const powerCost = finiteNumber((row as FactoryDataRow & { power_cost?: number }).power_cost, 0) * getFactoryCount(context);
  const runtimeMinutes = calculateFactoryRuntime(row, context);
  return runtimeMinutes > 0 ? powerCost * (MINUTES_PER_HOUR / runtimeMinutes) : 0;
}

export function calculateXpPerHour(row: FactoryDataRow, context: RuntimeContext = {}) {
  const xpPerCycle = finiteNumber((row as FactoryDataRow & { xp_per_output?: number }).xp_per_output, 0) * calculateFactoryOutput(row, context);
  const runtimeMinutes = calculateFactoryRuntime(row, context);
  return runtimeMinutes > 0 ? xpPerCycle * (MINUTES_PER_HOUR / runtimeMinutes) : 0;
}

export function calculateXpPerCoin(row: FactoryDataRow, prices: PriceMap, context: RuntimeContext = {}) {
  const cost = calculateInputCost(row, prices, context);
  const xp = finiteNumber((row as FactoryDataRow & { xp_per_output?: number }).xp_per_output, 0) * calculateFactoryOutput(row, context);
  return cost > 0 ? xp / cost : null;
}

export function buildPriceMapFromCycleQuotes(row: FactoryDataRow, quotes: Record<string, QuoteLike>, context: RuntimeContext = {}) {
  const prices: PriceMap = {};
  const outputQuote = quotes[sellQuoteKey(row.output_token, row.output_amount)];
  if (outputQuote?.output?.amount && row.output_amount > 0) {
    prices[normalizeSymbol(row.output_token)] = finiteNumber(outputQuote.output.amount) / row.output_amount;
  }

  const input1Amount = calculateAdjustedInputAmount(row, row.input_amount_1, context);
  const input1Quote = quotes[buyQuoteKey(row.input_token_1, input1Amount)];
  if (input1Quote?.input?.amount && input1Amount > 0) {
    prices[normalizeSymbol(row.input_token_1)] = finiteNumber(input1Quote.input.amount) / input1Amount;
  }

  if (row.input_token_2 && row.input_amount_2 > 0) {
    const input2Amount = calculateAdjustedInputAmount(row, row.input_amount_2, context);
    const input2Quote = quotes[buyQuoteKey(row.input_token_2, input2Amount)];
    if (input2Quote?.input?.amount && input2Amount > 0) {
      prices[normalizeSymbol(row.input_token_2)] = finiteNumber(input2Quote.input.amount) / input2Amount;
    }
  }

  return prices;
}

export function calculateFactoryCycle(row: FactoryDataRow, prices: PriceMap, context: RuntimeContext = {}): FactoryCycleResult {
  const factoryCount = getFactoryCount(context);
  const runtimeMinutes = calculateFactoryRuntime(row, context);
  const runsPerHour = runtimeMinutes > 0 ? MINUTES_PER_HOUR / runtimeMinutes : 0;
  const runsPerDay = runsPerHour * HOURS_PER_DAY;
  const input1PerCycle = calculateAdjustedInputAmount(row, row.input_amount_1, context) * factoryCount;
  const input2PerCycle = row.input_token_2 ? calculateAdjustedInputAmount(row, row.input_amount_2, context) * factoryCount : 0;
  const inputCostPerCycle = calculateInputCost(row, prices, context);
  const revenuePerCycle = calculateRevenue(row, prices, context);
  const profitPerCycle = revenuePerCycle - inputCostPerCycle;
  const xpPerCycle = finiteNumber((row as FactoryDataRow & { xp_per_output?: number }).xp_per_output, 0) * calculateFactoryOutput(row, context);
  const powerCostPerCycle = finiteNumber((row as FactoryDataRow & { power_cost?: number }).power_cost, 0) * factoryCount;
  const missingPrices = [row.output_token, row.input_token_1, row.input_token_2]
    .filter((symbol): symbol is string => Boolean(symbol))
    .map(normalizeSymbol)
    .filter((symbol) => prices[symbol] === undefined);

  return {
    row,
    factoryCount,
    runtimeMinutes,
    runsPerHour,
    runsPerDay,
    outputPerCycle: calculateFactoryOutput(row, context),
    outputPerHour: calculateProductionPerHour(row, context),
    outputPerDay: calculateProductionPerDay(row, context),
    input1PerCycle,
    input2PerCycle,
    inputCostPerCycle,
    revenuePerCycle,
    profitPerCycle,
    profitPerHour: profitPerCycle * runsPerHour,
    profitPerDay: profitPerCycle * runsPerDay,
    marginPercent: revenuePerCycle > 0 ? (profitPerCycle / revenuePerCycle) * 100 : null,
    xpPerCycle,
    xpPerHour: xpPerCycle * runsPerHour,
    xpPerDay: xpPerCycle * runsPerDay,
    xpPerCoin: inputCostPerCycle > 0 ? xpPerCycle / inputCostPerCycle : null,
    powerCostPerCycle,
    powerCostPerHour: powerCostPerCycle * runsPerHour,
    workshopBoostPercent: getWorkshopSpeedBoostPercent(row.token, context.workshop || []),
    activeBoostPercent: getActiveFactoryBoostPercent(context.activeBoosts || []),
    activeBoostMultiplier: getTotalFactoryBoostMultiplier(context.activeBoosts || []) * getManualBoostMultiplier(context) * getWorkerMultiplier(context),
    masteryLevel: getMasteryLevel(row.token, context.proficiencies || []),
    masteryReductionPercent: getMasteryInputReductionPercent(row.token, context.proficiencies || []),
    missingPrices,
  };
}

export function calculateFactoryROI(current: FactoryDataRow, next: FactoryDataRow | undefined, prices: PriceMap, context: RuntimeContext = {}) {
  if (!next) return { upgradeCost: null, extraProfitPerDay: 0, paybackDays: null, warning: 'upgrade cost missing' };
  if (!next.upgrade_token || next.upgrade_amount <= 0) return { upgradeCost: null, extraProfitPerDay: 0, paybackDays: null, warning: 'upgrade cost missing' };

  const upgradeCost = next.upgrade_amount * finiteNumber(prices[normalizeSymbol(next.upgrade_token)], 0) * getFactoryCount(context);
  const currentProfit = calculateProfitPerDay(current, prices, context);
  const nextProfit = calculateProfitPerDay(next, prices, context);
  const extraProfitPerDay = nextProfit - currentProfit;
  const paybackDays = upgradeCost > 0 && extraProfitPerDay > 0 ? upgradeCost / extraProfitPerDay : null;
  return {
    upgradeCost: upgradeCost > 0 ? upgradeCost : null,
    extraProfitPerDay,
    paybackDays,
    warning: upgradeCost > 0 ? undefined : 'upgrade price missing',
  };
}

export function calculateUpgradeRecommendation(rows: FactoryDataRow[], prices: PriceMap, context: RuntimeContext = {}): UpgradeRecommendation[] {
  const byKey = new Map(rows.map((row) => [`${row.token}:${row.level}`, row]));
  return rows
    .map((row) => {
      const nextRow = byKey.get(`${row.token}:${row.level + 1}`);
      const roi = calculateFactoryROI(row, nextRow, prices, context);
      const current = calculateFactoryCycle(row, prices, context);
      const next = nextRow ? calculateFactoryCycle(nextRow, prices, context) : null;
      const addedProfitPerDay = next ? next.profitPerDay - current.profitPerDay : 0;
      const addedProductionPerDay = next ? next.outputPerDay - current.outputPerDay : 0;
      const addedXpPerDay = next ? next.xpPerDay - current.xpPerDay : 0;
      const label: UpgradeRecommendation['label'] = roi.paybackDays !== null ? 'Best ROI' : 'Not enough data';
      const reason = nextRow
        ? `Upgrade ${row.token} from level ${row.level} to ${nextRow.level}: adds ${addedProductionPerDay.toLocaleString(undefined, { maximumFractionDigits: 3 })}/day and ${addedProfitPerDay.toLocaleString(undefined, { maximumFractionDigits: 3 })} COIN/day.`
        : `No next level data for ${row.token} level ${row.level}.`;
      return {
        row,
        nextRow,
        label,
        reason,
        addedProfitPerDay,
        addedProductionPerDay,
        addedXpPerDay,
        upgradeCost: roi.upgradeCost,
        paybackDays: roi.paybackDays,
        warning: roi.warning,
      };
    })
    .sort((a, b) => {
      if (a.paybackDays !== null && b.paybackDays !== null) return a.paybackDays - b.paybackDays;
      if (a.paybackDays !== null) return -1;
      if (b.paybackDays !== null) return 1;
      return b.addedProfitPerDay - a.addedProfitPerDay;
    });
}

export function calculateTimeUntilResources(targetAmount: number, currentAmount: number, productionPerHour: number) {
  const missingAmount = Math.max(finiteNumber(targetAmount) - finiteNumber(currentAmount), 0);
  if (missingAmount <= 0) return { missingAmount: 0, hours: 0, ready: true };
  const rate = finiteNumber(productionPerHour, 0);
  return { missingAmount, hours: rate > 0 ? missingAmount / rate : Number.POSITIVE_INFINITY, ready: false };
}

export function calculateCycleWindow(runtimeMinutes: number, startedAt?: string | null, now?: string | Date): CycleWindow {
  const durationSeconds = Math.max(0, Math.round(finiteNumber(runtimeMinutes, 0) * 60));
  const startedMs = startedAt ? new Date(startedAt).getTime() : 0;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now || new Date()).getTime();

  if (!durationSeconds || !startedAt || !Number.isFinite(startedMs) || startedMs <= 0) {
    return {
      startedAt: startedAt || undefined,
      durationSeconds,
      secondsUntilEnd: durationSeconds,
      hasWindow: false,
      ended: false,
    };
  }

  const endsMs = startedMs + durationSeconds * 1000;
  const secondsUntilEnd = Number.isFinite(nowMs) ? Math.ceil((endsMs - nowMs) / 1000) : durationSeconds;

  return {
    startedAt,
    endsAt: new Date(endsMs).toISOString(),
    durationSeconds,
    secondsUntilEnd: Math.max(secondsUntilEnd, 0),
    hasWindow: true,
    ended: secondsUntilEnd <= 0,
  };
}

export function calculateCycleTimerStatus(input: CycleTimerInput): CycleTimerStatus {
  const runtimeSeconds = Math.max(0, Math.round(finiteNumber(input.runtimeMinutes, 0) * 60));
  const nowMs = input.now instanceof Date ? input.now.getTime() : new Date(input.now || new Date()).getTime();
  const startedMs = input.startedAt ? new Date(input.startedAt).getTime() : 0;
  const pausedMs = input.pausedAt ? new Date(input.pausedAt).getTime() : 0;
  const effectiveNow = Number.isFinite(pausedMs) && pausedMs > 0 ? pausedMs : nowMs;

  if (!runtimeSeconds || !Number.isFinite(startedMs) || startedMs <= 0) {
    return {
      runtimeSeconds,
      elapsedSeconds: 0,
      remainingSeconds: runtimeSeconds,
      completedCycles: 0,
      progressPercent: 0,
      requiresStartTime: true,
      paused: Boolean(input.pausedAt),
    };
  }

  const elapsedSeconds = Math.max(0, Math.floor((effectiveNow - startedMs) / 1000));
  const completedCycles = runtimeSeconds > 0 ? Math.floor(elapsedSeconds / runtimeSeconds) : 0;
  const secondsIntoCycle = runtimeSeconds > 0 ? elapsedSeconds % runtimeSeconds : 0;
  const remainingSeconds = runtimeSeconds > 0 ? Math.max(runtimeSeconds - secondsIntoCycle, 0) : 0;
  const progressPercent = runtimeSeconds > 0 ? (secondsIntoCycle / runtimeSeconds) * 100 : 0;

  return {
    runtimeSeconds,
    elapsedSeconds,
    remainingSeconds,
    completedCycles,
    progressPercent,
    requiresStartTime: false,
    paused: Boolean(input.pausedAt),
  };
}

export function buildRecipeTree(rows: FactoryDataRow[], token: string, amount = 1, level?: number, seen = new Set<string>()): RecipeNode {
  const normalized = normalizeSymbol(token);
  const key = `${normalized}:${level || 'best'}`;
  if (seen.has(key)) return { token: normalized, amount, children: [], circular: true };

  const candidates = rows.filter((row) => normalizeSymbol(row.output_token) === normalized);
  const row = typeof level === 'number'
    ? candidates.find((item) => item.level === level)
    : [...candidates].sort((a, b) => b.level - a.level)[0];

  if (!row || row.output_amount <= 0) return { token: normalized, amount, children: [], missingRecipe: true };

  const nextSeen = new Set(seen);
  nextSeen.add(key);
  const scale = amount / row.output_amount;
  const children = [
    row.input_token_1 ? buildRecipeTree(rows, row.input_token_1, row.input_amount_1 * scale, undefined, nextSeen) : null,
    row.input_token_2 ? buildRecipeTree(rows, row.input_token_2, row.input_amount_2 * scale, undefined, nextSeen) : null,
  ].filter((child): child is RecipeNode => Boolean(child));

  return { token: normalized, amount, row, children };
}

export function flattenRecipeToBaseResources(node: RecipeNode, out: Record<string, number> = {}) {
  if (!node.children.length || node.circular || node.missingRecipe) {
    out[node.token] = (out[node.token] || 0) + node.amount;
    return out;
  }

  node.children.forEach((child) => flattenRecipeToBaseResources(child, out));
  return out;
}

export function validateFactoryData(rows: FactoryDataRow[]) {
  const warnings: string[] = [];
  const knownOutputs = new Set(rows.map((row) => normalizeSymbol(row.output_token)).filter(Boolean));

  rows.forEach((row) => {
    if (!row.token) warnings.push(`Factory row level ${row.level} is missing token.`);
    if (!row.output_token) warnings.push(`${row.token} level ${row.level} is missing output token.`);
    if (row.duration_min <= 0) warnings.push(`${row.token} level ${row.level} has no runtime.`);
    if (row.output_amount <= 0) warnings.push(`${row.token} level ${row.level} has no output amount.`);
    [row.input_token_1, row.input_token_2].filter(Boolean).forEach((input) => {
      const normalized = normalizeSymbol(input);
      if (!knownOutputs.has(normalized) && !['COIN', 'EARTH', 'WATER', 'FIRE'].includes(normalized)) {
        warnings.push(`${row.token} level ${row.level} references unknown input ${normalized}.`);
      }
    });
  });

  return warnings;
}

export function sellQuoteKey(symbol: string, amount: number) {
  return `SELL:${normalizeSymbol(symbol)}:${Number(finiteNumber(amount).toFixed(8))}`;
}

export function buyQuoteKey(symbol: string, amount: number) {
  return `BUY:COIN:${normalizeSymbol(symbol)}:${Number(finiteNumber(amount).toFixed(8))}`;
}

export function runtimeTextFromCycle(cycle: FactoryCycleResult) {
  return getDurationMinutesFromRunsPerHour(cycle.runsPerHour);
}
