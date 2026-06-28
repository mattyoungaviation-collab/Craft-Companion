export type FactoryBoost = {
  source?: 'factory' | 'consumable' | 'worker' | 'landPlot' | string;
  startTime?: string;
  endTime?: string | null;
  boostValue?: number;
};

function isBoostActive(boost: FactoryBoost, now = Date.now()) {
  const start = boost.startTime ? new Date(boost.startTime).getTime() : 0;
  const end = boost.endTime ? new Date(boost.endTime).getTime() : Number.POSITIVE_INFINITY;

  if (Number.isFinite(start) && start > now) return false;
  if (Number.isFinite(end) && end <= now) return false;
  return true;
}

function normalizeSource(source?: string) {
  return String(source || '').trim().toLowerCase();
}

export function getFactoryBoostMultiplier(boost: FactoryBoost) {
  const value = Number(boost.boostValue || 0);
  if (!Number.isFinite(value) || value <= 0) return 1;

  // Craft World returns fractional values as remaining-time factors.
  // 0.5 = 2x speed, 0.2 = 5x speed, 0.277777... = 3.6x speed.
  if (value > 0 && value < 1) return 1 / value;

  // If Craft World ever returns a whole multiplier directly, preserve it.
  return value;
}

export function getActiveFactoryBoosts(boosts: FactoryBoost[] = []) {
  return boosts
    .filter((boost) => isBoostActive(boost))
    .filter((boost) => {
      // The API returns source="factory" boosts that do not appear to affect the visible timer.
      // Counting this source makes KEY, CERAMICKEY, and BOLTS finish exactly 2x too fast.
      return normalizeSource(boost.source) !== 'factory';
    });
}

export function getTotalFactoryBoostMultiplier(boosts: FactoryBoost[] = []) {
  return getActiveFactoryBoosts(boosts).reduce((total, boost) => total * getFactoryBoostMultiplier(boost), 1);
}

export function getActiveFactoryBoostPercent(boosts: FactoryBoost[] = []) {
  return (getTotalFactoryBoostMultiplier(boosts) - 1) * 100;
}

export function applyFactoryBoostsToDuration(durationMinutes: number, boosts: FactoryBoost[] = []) {
  const duration = Number(durationMinutes || 0);
  if (!Number.isFinite(duration) || duration <= 0) return duration;

  const multiplier = getTotalFactoryBoostMultiplier(boosts);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return duration;

  return duration / multiplier;
}

export function getRunsPerHourWithFactoryBoosts(durationMinutes: number, boosts: FactoryBoost[] = []) {
  const adjustedDuration = applyFactoryBoostsToDuration(durationMinutes, boosts);
  return adjustedDuration > 0 && Number.isFinite(adjustedDuration) ? 60 / adjustedDuration : 0;
}
