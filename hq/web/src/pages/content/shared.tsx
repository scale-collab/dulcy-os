// Content (Batch 5, 2026-11-27): small pieces shared by the Content screens. Everything is rendered as
// escaped text. The only write is the idea decision (POST /content/ideas/<rec>), the same fields the
// Content Center's "Approve & schedule" / "Reject idea" write.
import { useState, type ReactNode } from 'react';
import { api, type ContentNote } from '../../api';
import { Button, cx, ErrorBox, Icon } from '../../ui';

export const day = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
export const dateOnly = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
export const shortLabel = (ch: string) => (ch === 'Alex Woung Raw' ? 'Raw' : ch === 'Alex Woung' ? 'Main' : ch || 'No channel');
export const todayEt = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
export const HOW: Record<string, string> = { hq: 'In HQ', engine: 'Automatic', field: 'Button in the Content Center', button: 'Button in the Content Center', manual: 'By hand' };

/** The channel filter, remembered on this device (a per-viewer convenience; never required). */
export type ChannelKey = '' | 'main' | 'raw';
const CH_KEY = 'hq.content.channel';
export function readChannel(): ChannelKey { try { const x = localStorage.getItem(CH_KEY); return x === 'main' || x === 'raw' ? x : ''; } catch { return ''; } }
export function saveChannel(x: ChannelKey) { try { if (x) localStorage.setItem(CH_KEY, x); else localStorage.removeItem(CH_KEY); } catch { /* private window */ } }

/** A labelled dropdown (filters are dropdowns, not rows of buttons: RULES 2026-11-27). */
export function Select<T extends string>({ label, value, options, onChange, className }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <label className={cx('relative inline-flex min-h-11 min-w-0 items-center', className)}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}
        className="min-h-11 w-full min-w-0 appearance-none truncate rounded-xl border border-line bg-surface py-2 pl-3 pr-9 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-accent">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3 text-muted" />
    </label>
  );
}

export const CHANNEL_OPTIONS: { value: ChannelKey; label: string }[] = [{ value: '', label: 'Both channels' }, { value: 'main', label: 'Main channel' }, { value: 'raw', label: 'Alex Woung Raw' }];

/** Approve / Reject an idea (the Content Center's "Approve & schedule" / "Reject idea"). */
export function DecideButtons({ id, onDone, className }: { id: string; onDone: (msg: string) => void; className?: string }) {
  const [busy, setBusy] = useState<'' | 'approve' | 'reject'>('');
  const [error, setError] = useState('');
  const decide = async (verdict: 'approve' | 'reject') => {
    setBusy(verdict); setError('');
    try {
      const r = await api<{ decision: string; recording: string; publish: string }>(`/content/ideas/${id}`, { body: { verdict } });
      onDone(verdict === 'approve' ? `Approved. Record ${day(r.recording)}, publish ${day(r.publish)}. Sienna writes the script within 30 minutes.` : 'Rejected. It stays in the history.');
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };
  return (
    <div className={className}>
      {error && <div className="mb-3"><ErrorBox error={error} /></div>}
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button tone="accent" icon="check" disabled={!!busy} onClick={() => decide('approve')}>{busy === 'approve' ? 'Approving…' : 'Approve'}</Button>
        <Button tone="danger" icon="x" disabled={!!busy} onClick={() => decide('reject')}>{busy === 'reject' ? 'Rejecting…' : 'Reject'}</Button>
      </div>
    </div>
  );
}

/** One data problem as Problem → Decision → what supports it (RULES 2026-11-27: insights are short). */
export function Notes({ notes }: { notes: ContentNote[] }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <li key={n.problem} className="rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm leading-snug">
          <div className="flex gap-2.5">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warn" />
            <div className="min-w-0 break-words">
              <div className="font-semibold text-fg">{n.problem}</div>
              <div className="mt-1 text-fg-2"><span className="font-medium text-fg">Decision · {n.owner}:</span> {n.fix}</div>
              <div className="mt-1 text-xs text-muted">{n.data}</div>
              {n.why && <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer select-none">Why it matters</summary><p className="mt-1">{n.why}</p></details>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A Content Center status line: done (check) or not yet (empty circle). */
export function StatusLine({ label, done, children }: { label: string; done: boolean; children?: ReactNode }) {
  return (
    <li className="flex min-h-7 items-start gap-2.5 text-sm">
      <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border', done ? 'border-good bg-good-soft text-good' : 'border-line-strong text-transparent')} aria-hidden="true">
        <Icon name="check" size={12} strokeWidth={2.6} />
      </span>
      <span className={cx('min-w-0 break-words', done ? 'text-fg' : 'text-muted')}>{label}{children}</span>
      <span className="sr-only">{done ? 'done' : 'not yet'}</span>
    </li>
  );
}

/** Heading + one plain line, for each section of the Content screens. */
export function Head({ title, sub, icon, right }: { title: string; sub?: string; icon?: string; right?: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-fg">{icon && <Icon name={icon} size={17} className="shrink-0 text-muted" />}<span className="truncate">{title}</span></h2>
        {right}
      </div>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}
