// Deliverability, Round 2 (Alex, 2026-11-27): edit inbox limits IN BULK (per client, by status,
// ticked inboxes, or every inbox shown) → set cold/day and/or warm-up/day → preview → confirm → one
// engine job (inbox.limits: the same EmailBison bulk calls as the n8n Bulk Controls flow, a receipt
// per call). Owner only (the server checks). Live only when inbox.limits is in LIVE_STAGES.
import { useEffect, useState } from 'react';
import { api, type LimitPreviewR2, type LimitResultB3 } from '../api';
import { Button, cx, showToast } from '../ui';

export interface BulkScope { accounts?: string[]; filter?: { client: string; status: string; q: string } }

export function BulkLimits({ scope, label, live, onDone, onClear }: { scope: BulkScope; label: string; live: boolean; onDone: () => void; onClear: () => void }) {
  const [cold, setCold] = useState('');
  const [warm, setWarm] = useState('');
  const [preview, setPreview] = useState<LimitPreviewR2 | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = JSON.stringify(scope);
  useEffect(() => { setPreview(null); setOk(false); setError(''); }, [key, cold, warm]);
  const body = () => ({ ...(scope.accounts ? { accounts: scope.accounts } : { filter: scope.filter }), cold: cold === '' ? null : Number(cold), warmup: warm === '' ? null : Number(warm) });
  const empty = cold === '' && warm === '';
  const look = async () => {
    setBusy(true); setError('');
    try { setPreview(await api<LimitPreviewR2>('/deliverability/limits/preview', { body: body() })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setError('');
    try {
      const r = await api<LimitResultB3>('/deliverability/limits', { body: { ...body(), confirm: true, reason: `Bulk edit in HQ: ${label}` } });
      showToast({ tone: 'good', text: `${r.dryRun ? 'Dry run queued (nothing changes in EmailBison yet)' : 'Queued, one job'}: ${r.summary}${r.skipped.length ? `. Left alone: ${r.skipped.length}` : ''}.`, ms: 8000 });
      onDone();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const field = (id: string, text: string, v: string, set: (x: string) => void) => (
    <label htmlFor={id} className="min-w-0">
      <span className="block text-xs font-medium text-muted">{text}</span>
      <input id={id} type="number" inputMode="numeric" min={0} max={50} value={v} onChange={(e) => set(e.target.value)} placeholder="keep"
        className="tabular mt-1 min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-fg outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft sm:w-28" />
    </label>
  );
  return (
    <div className="sticky bottom-3 z-20 rounded-2xl border border-accent/40 bg-surface p-3.5 shadow-pop sm:p-4" role="region" aria-label="Bulk edit limits">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">Bulk edit limits: {label}</div>
          <p className="text-xs text-muted">Empty = keep. Resting inboxes keep 0 cold until their retest; inboxes being replaced are left alone. Ramp: 5/10 → 10/20 → 15/30.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {field('bulk-cold', 'Cold emails / day', cold, setCold)}
          {field('bulk-warm', 'Warm-up / day', warm, setWarm)}
          <Button tone="quiet" disabled={busy || empty} onClick={() => void look()} className="min-h-10 px-3 text-sm">{busy && !preview ? 'Checking…' : 'Preview'}</Button>
          <Button tone="ghost" disabled={busy} onClick={onClear} className="min-h-10 px-3 text-sm">Cancel</Button>
        </div>
      </div>
      {preview && (
        <div className="mt-3 rounded-xl bg-sunken px-3.5 py-2.5 text-sm">
          <div className="font-semibold text-fg">{preview.changes ? `${preview.changes.toLocaleString('en-US')} inbox${preview.changes === 1 ? '' : 'es'} will change` : 'Nothing would change'}{preview.clients.length > 1 ? ` across ${preview.clients.length} clients` : preview.clients[0] ? ` (${preview.clients[0]})` : ''}</div>
          {preview.changes > 0 && <div className="text-fg-2">{preview.summary}</div>}
          {preview.skipped > 0 && <div className="mt-0.5 text-xs text-muted">Left alone: {preview.skippedWhy.map((s) => `${s.n} ${s.why}`).join(' · ')}</div>}
          {preview.sample.length > 0 && <details className="mt-1 text-xs text-muted"><summary className="min-h-8 cursor-pointer">Examples</summary><ul className="mt-1 space-y-0.5">{preview.sample.map((s) => <li key={s.email} className="break-all">{s.email}: {s.what}</li>)}</ul></details>}
          {preview.changes > preview.max && <p className="mt-1 text-sm text-bad">More than {preview.max} at once: narrow the filter.</p>}
          {preview.changes > 0 && preview.changes <= preview.max && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex min-h-10 items-start gap-2 text-sm text-fg">
                <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                <span>I confirm: change these {preview.changes.toLocaleString('en-US')} inboxes in EmailBison.{!live && ' (Dry run for now: the engine reports only.)'}</span>
              </label>
              <Button tone="accent" disabled={!ok || busy} onClick={() => void apply()} className={cx('min-h-10 px-4 text-sm')}>{busy ? 'Saving…' : `Apply to ${preview.changes.toLocaleString('en-US')}`}</Button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
