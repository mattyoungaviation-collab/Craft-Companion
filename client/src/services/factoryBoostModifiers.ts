export type FactoryBoost = {
  source?: 'factory' | 'consumable' | 'worker' | 'landPlot' | string;
  startTime?: string;
  endTime?: string;
  boostValue?: number;
};

function isBoostActive(boost: FactoryBoost, now = Date.now()) {
  const start = boost.startTime ? new Date(boost.startTime).getTime() : 0;
  const end = boost.endTime ? new Date(boost.endTime).getTime() : Number.POSITIVE_INFINITY;

  if (Number.isFinite(start) && start > now) return false;
  if (Number.isFinite(end) && end < now) return false;
  return true;
}

export function getActiveFactoryBoostPercent(boosts: FactoryBoost[] = []) {
  return boosts
    .filter((boost) => isBoostActive(boost))
    .reduce((total, boost) => {
      const value = Number(boost.boostValue || 0);
      if (!Number.isFinite(value) || value <= 0) return total;

      // Craft World worker data can arrive as 0.58 for 58 percent.
      // Larger event or consumable boosts can arrive as whole percentages.
      const percent = value <= 1 ? value * 100 : value;
      return total + percent;
    }, 0);
}

export function applyFactoryBoostsToDuration(durationMinutes: number, boosts: FactoryBoost[] = []) {
  const duration = Number(durationMinutes || 0);
  if (!Number.isFinite(duration) || duration <= 0) return duration;

  const boostPercent = getActiveFactoryBoostPercent(boosts);
  if (boostPercent <= 0) return duration;

  return duration / (1 + boostPercent / 100);
}

export function getRunsPerHourWithFactoryBoosts(durationMinutes: number, boosts: FactoryBoost[] = []) {
  const adjustedDuration = applyFactoryBoostsToDuration(durationMinutes, boosts);
  return adjustedDuration > 0 && Number.isFinite(adjustedDuration) ? 60 / adjustedDuration : 0;
}
