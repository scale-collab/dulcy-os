// Small pieces of the Campaign Center shared by the list and the campaign page.
import { type CampaignStep, type NeedKind, type SendingSummaryB3 } from '../../api';
import { cx, Pill } from '../../ui';

export const NEED: Record<NeedKind, { label: string; tone: 'bad' | 'warn' | 'info' | 'accent' }> = {
  pause: { label: 'Pause', tone: 'bad' }, failed: { label: 'Failed', tone: 'bad' }, stuck: { label: 'Stuck', tone: 'warn' }, watch: { label: 'Bounce watch', tone: 'warn' },
  next: { label: 'Plan next', tone: 'accent' }, review: { label: 'Client review', tone: 'info' }, low: { label: 'Low interest', tone: 'warn' },
};
export function StatusPill({ r }: { r: { group: string; status: string } }) {
  return <Pill tone={r.group === 'live' ? 'good' : r.group === 'building' ? 'info' : 'plain'}>{r.group === 'live' ? 'Active' : r.status || (r.group === 'building' ? 'Draft' : 'Done')}</Pill>;
}
export function Bar({ v }: { v: number }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label="Leads used"><div className={cx('h-full rounded-full', v >= 0.6 ? 'bg-accent' : 'bg-line-strong')} style={{ width: `${Math.min(100, Math.round(v * 100))}%` }} /></div>;
}
/** "6 inboxes · 1 spam": the campaign's sending inboxes in one line. */
export function Sending({ n, s, compact }: { n: number; s: SendingSummaryB3 | null; compact?: boolean }) {
  if (!n) return <span className="text-warn">No inboxes</span>;
  const bad = s ? [s.warmupOff ? { t: `${s.warmupOff} warm-up off`, c: 'text-bad' } : null, s.spam ? { t: `${s.spam} spam`, c: 'text-bad' } : null, s.resting ? { t: `${s.resting} resting`, c: 'text-info' } : null, s.risk ? { t: `${s.risk} at risk`, c: 'text-warn' } : null].filter(Boolean) as { t: string; c: string }[] : [];
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-x-1.5', compact && 'text-xs')}>
      <span className="tabular font-semibold text-fg-2">{n}</span><span className="text-muted">inbox{n === 1 ? '' : 'es'}</span>
      {bad.map((x) => <span key={x.t} className={cx('font-medium', x.c)}>· {x.t}</span>)}
    </span>
  );
}

const SHORT: Record<string, string> = { list: 'List', copy: 'Copy', review: 'Review', launch: 'Launch', live: 'Live', sixty: '60%', next: 'Next' };
const STATE_WORD: Record<string, string> = { done: 'done', now: 'now', todo: 'not yet', bad: 'failed' };
/** One row of steps: list → copy → client review → launch → live → 60% → next. */
export function Steps({ steps, small, className }: { steps: CampaignStep[]; small?: boolean; className?: string }) {
  return (
    <ol aria-label="Steps" className={cx('grid grid-cols-7 gap-1', className)}>
      {steps.map((x) => (
        <li key={x.key} title={`${x.label}: ${STATE_WORD[x.state]}${x.note ? ` (${x.note})` : ''}`} className="min-w-0">
          <span className={cx('block rounded-full', small ? 'h-1.5' : 'h-2', x.state === 'done' ? 'bg-accent' : x.state === 'now' ? 'bg-accent/35 ring-1 ring-inset ring-accent' : x.state === 'bad' ? 'bg-bad' : 'bg-line')} />
          <span className={cx('mt-1 block truncate text-center', small ? 'text-[10px]' : 'text-xs', x.state === 'now' || x.state === 'bad' ? 'font-semibold text-fg' : 'text-muted')}>{SHORT[x.key]}</span>
          <span className="sr-only">{STATE_WORD[x.state]}</span>
        </li>
      ))}
    </ol>
  );
}
