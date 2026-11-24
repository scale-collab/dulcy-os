// Live timing text for long steps (Alex, 2026-11-24): "3 min so far · about 1 min left".
// The time left uses the pace so far; it is left out when there is no progress to measure yet.
export function timing(startedAt: number, done: number, total: number, now = Date.now()): string {
  if (!Number.isFinite(startedAt)) return 'just started';
  const mins = Math.max(0, (now - startedAt) / 60_000);
  const run = `${Math.round(mins)} min so far`;
  if (!(done > 0) || !(total > done)) return run;
  return `${run} · about ${Math.max(1, Math.round(((total - done) / done) * mins))} min left`;
}

/** A status block: a title line, then one "• Label: value" line per item (the page shows line breaks). */
export function statusBlock(title: string, items: Array<[string, string] | null | undefined | false>): string {
  return [title, ...items.filter((x): x is [string, string] => Array.isArray(x)).map(([k, v]) => `• ${k}: ${v}`)].join('\n');
}

export const n = (x: number) => Math.round(x).toLocaleString('en-US');
