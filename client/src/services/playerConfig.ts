export type PlayerFactoryConfig = {
  enabled: boolean;
  factoryCount: number;
  factoryLevel: number;
  individualLevels: number[];
  masteryPercent: number;
  workersPercent: number;
  workshopPercent: number;
  boostMultiplier: number;
  notes: string;
  timerStartedAt?: string;
  timerPausedAt?: string;
};

export type PlayerConfig = {
  version: 1;
  factories: Record<string, PlayerFactoryConfig>;
  updatedAt: string;
};

const STORAGE_KEY = 'craftworld.playerConfig.v1';

export const DEFAULT_FACTORY_CONFIG: PlayerFactoryConfig = {
  enabled: false,
  factoryCount: 1,
  factoryLevel: 1,
  individualLevels: [],
  masteryPercent: 0,
  workersPercent: 0,
  workshopPercent: 0,
  boostMultiplier: 1,
  notes: '',
};

function finiteNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeFactoryConfig(value: Partial<PlayerFactoryConfig> | undefined): PlayerFactoryConfig {
  return {
    enabled: Boolean(value?.enabled),
    factoryCount: Math.max(1, Math.floor(finiteNumber(value?.factoryCount, DEFAULT_FACTORY_CONFIG.factoryCount))),
    factoryLevel: Math.max(1, Math.floor(finiteNumber(value?.factoryLevel, DEFAULT_FACTORY_CONFIG.factoryLevel))),
    individualLevels: Array.isArray(value?.individualLevels)
      ? value.individualLevels.map((level) => Math.max(1, Math.floor(finiteNumber(level, 1)))).slice(0, 100)
      : [],
    masteryPercent: Math.max(0, finiteNumber(value?.masteryPercent, 0)),
    workersPercent: Math.max(0, finiteNumber(value?.workersPercent, 0)),
    workshopPercent: Math.max(0, finiteNumber(value?.workshopPercent, 0)),
    boostMultiplier: Math.max(1, finiteNumber(value?.boostMultiplier, 1)),
    notes: String(value?.notes || ''),
    timerStartedAt: value?.timerStartedAt ? String(value.timerStartedAt) : undefined,
    timerPausedAt: value?.timerPausedAt ? String(value.timerPausedAt) : undefined,
  };
}

export function createDefaultPlayerConfig(): PlayerConfig {
  return { version: 1, factories: {}, updatedAt: new Date().toISOString() };
}

export function loadPlayerConfig(storage: Storage = window.localStorage): PlayerConfig {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultPlayerConfig();
    const parsed = JSON.parse(raw) as Partial<PlayerConfig>;
    const factories = Object.entries(parsed.factories || {}).reduce<Record<string, PlayerFactoryConfig>>((acc, [key, value]) => {
      acc[key.toUpperCase()] = normalizeFactoryConfig(value);
      return acc;
    }, {});
    return { version: 1, factories, updatedAt: String(parsed.updatedAt || new Date().toISOString()) };
  } catch {
    return createDefaultPlayerConfig();
  }
}

export function savePlayerConfig(config: PlayerConfig, storage: Storage = window.localStorage) {
  const normalized: PlayerConfig = {
    version: 1,
    factories: Object.entries(config.factories || {}).reduce<Record<string, PlayerFactoryConfig>>((acc, [key, value]) => {
      acc[key.toUpperCase()] = normalizeFactoryConfig(value);
      return acc;
    }, {}),
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function resetPlayerConfig(storage: Storage = window.localStorage) {
  storage.removeItem(STORAGE_KEY);
  return createDefaultPlayerConfig();
}

export function exportPlayerConfig(config: PlayerConfig) {
  return JSON.stringify(config, null, 2);
}

export function importPlayerConfig(raw: string, storage: Storage = window.localStorage) {
  const parsed = JSON.parse(raw) as PlayerConfig;
  return savePlayerConfig(parsed, storage);
}

export function getFactoryConfig(config: PlayerConfig, symbol: string) {
  return config.factories[symbol.trim().toUpperCase()] || DEFAULT_FACTORY_CONFIG;
}
