// Round 5 bug (Alex 2026-11-28): "from a client contact, clicking Sales goes back to Create a contract:
// an endless loop". Cause: the deal page's "Sales" link did history.back(), and the contract page's
// "Deal" link pushed a NEW deal entry. Deal → Draft contract → Deal → "Sales" went back one step, to the
// contract; "Deal" pushed the deal again; "Sales" went back to the contract again, for ever.
// Fix + guard: Sales back links never use the browser history. Each one goes UP to a fixed parent
// (contract → its deal → the Sales list), which is always a shorter path, so no chain of back links can
// come round to where it started. Leaving the contract page replaces its history entry (no new step),
// so the browser's own Back button cannot bounce between the two either.

/** The parent of a Sales path: strictly shorter, ending at "sales". Pure. */
export function salesUp(path: string): string {
  const parts = path.replace(/^#?\/?/, '').split('?')[0].split('/').filter(Boolean);
  if (parts[0] !== 'sales' || parts.length <= 1) return 'sales';
  if (/^rec[A-Za-z0-9]{14}$/.test(parts[1]) && parts.length > 2) return `sales/${parts[1]}`; // contract (or deeper) → its deal
  return 'sales'; // a deal or a Sales tab → the Sales list
}

/** Go up from a Sales page without a new history step when leaving a page that should not be returned to. */
export function goUp(from: string, opts: { replace?: boolean } = {}): void {
  let to = salesUp(from);
  // Guard: a parent must be shorter than where we are; anything else goes to the Sales list.
  if (to.length >= from.replace(/^#?\/?/, '').length) to = 'sales';
  if (opts.replace) window.location.replace(`#/${to}`);
  else window.location.hash = `#/${to}`;
}
