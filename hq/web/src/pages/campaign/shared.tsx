// Round 2 campaigns (2026-11-27): the pieces the Campaign Center and Lead List Center pages share.
// Buttons: every press opens a sheet that says what it does and what it spends, then needs a confirm;
// a button that cannot be pressed says why; a button with no engine path yet says "comes next".
// The server decides who may press (owner only) and checks everything again.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, type ActionR2, type AutomationR2, type PressR2 } from '../../api';
import { Button, cx, Icon, IconButton, Pill, showToast } from '../../ui';

/** Dates in HQ use slashes (Round 2 rule): 11/27. */
export const slash = (iso: string) => { if (!iso) return ''; const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`; };
export const slashTime = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${slash(iso)} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`; };
export const num = (x: number) => x.toLocaleString('en-US');
export const rate = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : '–');

/** A panel: from the bottom on the phone, from the right on a computer. Esc or ✕ closes. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const was = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = was; window.removeEventListener('keydown', key); before?.focus?.(); };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-40">
      <button aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/40 anim-fade" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className="sheet-panel absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl border border-line bg-bg shadow-pop outline-none md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[min(560px,100%)] md:rounded-none md:rounded-l-3xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2 sm:px-6">
          <span className="flex-1 truncate pt-1 text-sm font-semibold text-muted">{label}</span>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-5 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** The confirm sheet: what the button does, what it spends, dry run, optional notes; then Confirm. */
export function ConfirmSheet({ a, what, endpoint, extra, onClose, onDone }: { a: ActionR2; what: string; endpoint: string; extra?: Record<string, unknown>; onClose: () => void; onDone: (r: PressR2) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const press = async () => {
    setBusy(true); setError('');
    try {
      const r = await api<PressR2>(endpoint, { body: { action: a.key, confirm: true, ...(a.needsNotes ? { notes } : {}), ...extra } });
      showToast({ text: r.message, tone: 'good', ms: 7000 });
      onDone(r); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet label={a.label} onClose={onClose}>
      <h2 className="text-[20px] font-bold leading-tight text-fg">{a.label}</h2>
      <div className="mt-1 text-sm text-muted">{what}</div>
      <dl className="mt-5 space-y-4 text-[15px] leading-6">
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">What it does</dt><dd className="mt-1 text-fg-2">{a.does}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Spends or changes</dt><dd className="mt-1 text-fg-2">{a.spends || 'Nothing: free, no outside change.'}</dd></div>
        {a.dryRun && <div className="rounded-xl bg-info-soft px-3.5 py-2.5 text-sm text-info">Dry run on the server: the engine runs every check but spends nothing and changes nothing outside until this stage is switched on (LIVE_STAGES).</div>}
      </dl>
      {a.needsNotes && (
        <label className="mt-5 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">What to change</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} maxLength={4000} placeholder="e.g. Shorter Email 1; lead with the missed-calls number"
            className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft" />
        </label>
      )}
      {error && <div role="alert" className="mt-4 rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">{error}</div>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Cancel</Button>
        <Button tone={a.tone === 'danger' ? 'danger' : 'primary'} disabled={busy || (a.needsNotes && notes.trim().length < 3)} onClick={press} icon="check">{busy ? 'Sending…' : `Confirm: ${a.label}`}</Button>
      </div>
    </Sheet>
  );
}

/** A row of buttons. Disabled buttons show why underneath (on a computer, also on hover). */
export function ActionBar({ actions, what, endpoint, onDone, className, extra }: { actions: ActionR2[]; what: string; endpoint: string; onDone: () => void; className?: string; extra?: Record<string, unknown> }) {
  const [open, setOpen] = useState<ActionR2 | null>(null);
  const live = actions.filter((a) => !a.comesNext);
  const next = actions.filter((a) => a.comesNext);
  if (!actions.length) return null;
  return (
    <div className={className}>
      {live.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {live.map((a) => (
            <li key={a.key} className="min-w-0">
              <Button tone={!a.enabled ? 'quiet' : a.tone === 'primary' ? 'primary' : a.tone === 'danger' ? 'danger' : 'quiet'} disabled={!a.enabled} onClick={() => setOpen(a)} title={a.enabled ? a.does : a.why} className="w-full">{a.label}</Button>
              <div className={cx('mt-1 px-1 text-xs leading-snug', a.enabled ? 'text-muted' : 'text-faint')}>{a.enabled ? (a.spends ? `Spends: ${a.spends}${a.dryRun ? ' (dry run)' : ''}` : 'Free') : a.why}</div>
            </li>
          ))}
        </ul>
      )}
      {next.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>Comes next in HQ:</span>
          {next.map((a) => <span key={a.key} title={a.does}><Pill>{a.label}</Pill></span>)}
        </div>
      )}
      {open && <ConfirmSheet a={open} what={what} endpoint={endpoint} extra={extra} onClose={() => setOpen(null)} onDone={onDone} />}
    </div>
  );
}

/** "Automation status": what the engine is doing on this record (Engine Status / Message). */
export function AutomationStatus({ a, className }: { a: AutomationR2; className?: string }) {
  const st = a.engineAction ? 'Pressed' : a.engineStatus || a.processing || 'Not started';
  const tone = /fail|needs review/i.test(st) ? 'bad' : /done|completed/i.test(st) ? 'good' : /queued|running|waiting|pressed/i.test(st) ? 'info' : 'plain';
  const msg = a.engineAction ? `${a.engineAction}: sent to the engine, it starts within about 30 seconds.` : a.engineMessage || a.workflowMessage || '';
  return (
    <div className={cx('rounded-2xl border px-4 py-3', tone === 'bad' ? 'border-bad-line bg-bad-soft' : tone === 'info' ? 'border-line bg-info-soft' : 'border-line bg-sunken', className)}>
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
        <Icon name={tone === 'info' ? 'refresh' : tone === 'bad' ? 'alert' : 'activity'} size={16} className={cx(tone === 'info' && 'animate-spin')} />
        Automation status <Pill tone={tone as 'bad' | 'good' | 'info' | 'plain'}>{st}</Pill>
      </div>
      {msg && <div className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-fg-2">{msg}</div>}
      {a.error && <div className="mt-1.5 whitespace-pre-wrap break-words text-sm text-bad">{a.error}</div>}
      {a.topupStatus && <div className="mt-1.5 text-sm text-fg-2">Top-up: {a.topupStatus}{a.topupMessage ? ` · ${a.topupMessage}` : ''}</div>}
    </div>
  );
}

export function Stat({ label, v, sub, tone }: { label: string; v: string; sub?: string; tone?: 'bad' | 'warn' | 'good' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="truncate text-xs font-medium text-muted">{label}</div>
      <div className={cx('tabular mt-1 text-[22px] font-bold leading-none tracking-tight', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-good' : 'text-fg')}>{v}</div>
      {sub && <div className="mt-1.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Tabs as a segmented control (phone: scrolls inside itself, never the page). */
export function Tabs<K extends string>({ tabs, value, onChange, label }: { tabs: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-sunken p-1">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={cx('min-h-9 shrink-0 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition', value === t.key ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
          {t.label}{typeof t.count === 'number' && <span className="tabular ml-1.5 text-xs text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
