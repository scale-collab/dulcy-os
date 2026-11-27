// Dates in HQ use slashes (Alex, 2026-11-27: "11/27"). The year only when it is not this year.
const parse = (x: string): Date | null => {
  if (!x) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(x) ? `${x}T12:00:00` : x);
  return Number.isFinite(d.getTime()) ? d : null;
};
/** "2026-11-27" or an ISO time → "11/27" (this year) or "11/27/2025". */
export function slashDate(x: string, opts: { year?: boolean } = {}): string {
  const d = parse(x);
  if (!d) return '';
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return opts.year || d.getFullYear() !== new Date().getFullYear() ? `${md}/${d.getFullYear()}` : md;
}
/** "Friday 11/27". */
export const dayAndDate = (d = new Date()) => `${d.toLocaleDateString(undefined, { weekday: 'long' })} ${slashDate(d.toISOString())}`;
/** "11/27, 3:05 PM". */
export function slashDateTime(x: string): string {
  const d = parse(x);
  return d ? `${slashDate(x)}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
}
