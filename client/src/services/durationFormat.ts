export function formatDurationFromMinutes(minutes: number) {
  const duration = Number(minutes || 0);
  if (!Number.isFinite(duration) || duration <= 0) return 'N/A';

  const totalSeconds = Math.max(0, Math.round(duration * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function getDurationMinutesFromRunsPerHour(runsPerHour: number) {
  const runs = Number(runsPerHour || 0);
  if (!Number.isFinite(runs) || runs <= 0) return 0;
  return 60 / runs;
}

export function getEffectiveSpeedPercent(baseDurationMinutes: number, boostedDurationMinutes: number) {
  const base = Number(baseDurationMinutes || 0);
  const boosted = Number(boostedDurationMinutes || 0);
  if (!Number.isFinite(base) || !Number.isFinite(boosted) || base <= 0 || boosted <= 0) return 0;
  return (base / boosted) * 100;
}
