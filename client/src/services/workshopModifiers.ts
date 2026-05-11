export type WorkshopItem = {
  symbol?: string;
  level?: number;
};

const TIER_ONE = ['MUD', 'CLAY', 'SAND'];
const TIER_TWO = ['COPPER', 'SEAWATER', 'HEAT', 'ALGAE', 'LAVA', 'CERAMICS', 'STEEL', 'OXYGEN', 'GLASS'];
const TIER_THREE = ['GAS', 'STONE', 'STEAM', 'SCREWS', 'FUEL', 'CEMENT', 'OIL', 'ACID', 'SULFUR'];
const TIER_FOUR = ['PLASTICS', 'PLASTIC', 'FIBERGLASS', 'ENERGY', 'HYDROGEN', 'DYNAMITE'];

const WORKSHOP_BOOSTS_BY_TIER: Record<number, number[]> = {
  1: [0, 11, 23, 35, 47, 59, 69, 79, 85, 92, 100],
  2: [0, 10, 20, 30, 39, 47, 54, 61, 69, 75, 82],
  3: [0, 9, 18, 25, 32, 39, 45, 52, 56, 61, 67],
  4: [0, 8, 15, 22, 28, 33, 37, 41, 45, 49, 54],
};

function normalizeSymbol(symbol?: string) {
  return String(symbol || '').trim().toUpperCase();
}

export function getWorkshopTier(symbol?: string) {
  const normalized = normalizeSymbol(symbol);
  if (TIER_ONE.includes(normalized)) return 1;
  if (TIER_TWO.includes(normalized)) return 2;
  if (TIER_THREE.includes(normalized)) return 3;
  if (TIER_FOUR.includes(normalized)) return 4;
  return 0;
}

export function getWorkshopUpgradeLevel(symbol: string, workshop: WorkshopItem[]) {
  const normalized = normalizeSymbol(symbol);
  const item = workshop.find((entry) => normalizeSymbol(entry.symbol) === normalized);
  const level = Math.floor(Number(item?.level || 0));
  if (!Number.isFinite(level) || level <= 0) return 0;
  return Math.min(level, 10);
}

export function getWorkshopSpeedBoostPercent(symbol: string, workshop: WorkshopItem[]) {
  const tier = getWorkshopTier(symbol);
  const level = getWorkshopUpgradeLevel(symbol, workshop);
  if (!tier || !level) return 0;
  return WORKSHOP_BOOSTS_BY_TIER[tier]?.[level] || 0;
}

export function applyWorkshopSpeedToDuration(durationMinutes: number, symbol: string, workshop: WorkshopItem[]) {
  const boostPercent = getWorkshopSpeedBoostPercent(symbol, workshop);
  const duration = Number(durationMinutes || 0);
  if (!Number.isFinite(duration) || duration <= 0) return duration;
  if (boostPercent >= 100) return 0;
  return duration * (1 - boostPercent / 100);
}

export function getRunsPerHourWithWorkshop(durationMinutes: number, symbol: string, workshop: WorkshopItem[]) {
  const adjustedDuration = applyWorkshopSpeedToDuration(durationMinutes, symbol, workshop);
  if (adjustedDuration === 0) return Number.POSITIVE_INFINITY;
  return adjustedDuration > 0 ? 60 / adjustedDuration : 0;
}
