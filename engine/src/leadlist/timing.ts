// Live timing text for long steps (Alex, 2026-11-24): "running 12 min, about 30 min left".
// The time left uses the pace so far; it is left out when there is no progress to measure yet.
export function timing(startedAt: number, done: number, total: number, now = Date.now()): string {
  if (!Number.isFinite(startedAt)) return 'running';
  const mins = Math.max(0, (now - startedAt) / 60_000);
  const run = `running ${Math.round(mins)} min`;
  if (!(done > 0) || !(total > done)) return run;
  return `${run}, about ${Math.max(1, Math.round(((total - done) / done) * mins))} min left`;
}
