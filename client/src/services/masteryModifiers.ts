export type ProficiencyItem = {
  symbol?: string;
  token?: string;
  resourceSymbol?: string;
  claimedLevel?: number;
  level?: number;
  collectedAmount?: number;
};

const YIELD_BONUS_BY_LEVEL: Record<number, number> = {
  1: 102.0,
  2: 102.7,
  3: 103.3,
  4: 103.7,
  5: 104.2,
  6: 104.4,
  7: 104.6,
  8: 104.8,
  9: 105.0,
  10: 105.3,
};

function normalizeSymbol(symbol?: string) {
  return String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/^TOKEN_/, '')
    .replace(/^RESOURCE_/, '')
    .replace(/[^A-Z0-9]/g, '');
}

function getProficiencySymbol(item: ProficiencyItem) {
  return normalizeSymbol(item.symbol || item.token || item.resourceSymbol);
}

function getProficiencyClaimedLevel(item?: ProficiencyItem) {
  const rawLevel = Number(item?.claimedLevel ?? item?.level ?? 0);
  const level = Math.floor(rawLevel);
  if (!Number.isFinite(level) || level <= 0) return 0;
  return Math.min(level, 10);
}

export function getMasteryLevel(symbol: string, proficiencies: ProficiencyItem[]) {
  const normalized = normalizeSymbol(symbol);
  const item = proficiencies.find((entry) => getProficiencySymbol(entry) === normalized);
  return getProficiencyClaimedLevel(item);
}

export function getMasteryYieldBonusPercent(symbol: string, proficiencies: ProficiencyItem[]) {
  const level = getMasteryLevel(symbol, proficiencies);
  if (!level) return 100;
  return YIELD_BONUS_BY_LEVEL[level] || 100;
}

export function getMasteryInputReductionPercent(symbol: string, proficiencies: ProficiencyItem[]) {
  return Math.max(0, getMasteryYieldBonusPercent(symbol, proficiencies) - 100);
}

export function applyMasteryInputReduction(amount: number, symbol: string, proficiencies: ProficiencyItem[]) {
  const inputAmount = Number(amount || 0);
  if (!Number.isFinite(inputAmount) || inputAmount <= 0) return 0;

  const reductionPercent = getMasteryInputReductionPercent(symbol, proficiencies);
  return inputAmount * (1 - reductionPercent / 100);
}
