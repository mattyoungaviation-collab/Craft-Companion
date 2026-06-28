export function formatDurationFromMinutes(minutes: number) {
  const duration = Number(minutes || 0);
  if (!Number.isFinite(duration) || duration < 0) return '0h 0m 0s';

  const totalSeconds = Math.round(duration * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutesPart = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${minutesPart}m ${seconds}s`;
}

export function getDurationMinutesFromRunsPerHour(runsPerHour: number) {
  const runs = Number(runsPerHour || 0);
  if (!Number.isFinite(runs) || runs <= 0) return 0;
  return 60 / runs;
}

export function getEffectiveSpeedPercent(baseDurationMinutes: number, calculatedDurationMinutes: number) {
  const baseDuration = Number(baseDurationMinutes || 0);
  const calculatedDuration = Number(calculatedDurationMinutes || 0);
  if (!Number.isFinite(baseDuration) || !Number.isFinite(calculatedDuration) || baseDuration <= 0 || calculatedDuration <= 0) return 0;
  return (baseDuration / calculatedDuration) * 100;
}
