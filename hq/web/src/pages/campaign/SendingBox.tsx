// The "Sending accounts" box at the top of the Campaign Center (Alex 2026-11-27: "I need to know what
// accounts are sending; we need to be sending at all times, and the stats"). Counts per bucket (tap
// one for its inboxes), daily capacity vs used, and an alert when nothing is sending. All clients:
// one line per client, the ones with nothing sending first.
import { useEffect, useState } from 'react';
import { api, type BucketR2, type SendingBoxR2 } from '../../api';
import { Card, cx, ErrorBox, Icon, Skeleton } from '../../ui';
import { num } from './shared';

const TONE: Record<BucketR2, string> = {
  sending: 'text-good', ready: 'text-info', free: 'text-accent-ink', warming: 'text-warn', risk: 'text-warn', resting: 'text-muted', spam: 'text-bad', disconnected: 'text-bad',
};
const MAIN: BucketR2[] = ['sending', 'ready', 'free', 'warming', 'resting', 'spam'];

export function SendingBox({ client, refresh, onPick }: { client: string; refresh: number; onPick: (key: string) => void }) {
  const [d, setD] = useState<SendingBoxR2 | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<BucketR2 | 'all' | null>(null);
  useEffect(() => {
    setError(''); setOpen(null);
    const qs = new URLSearchParams({ ...(client ? { client } : {}), ...(refresh ? { refresh: '1' } : {}) });
    api<SendingBoxR2>(`/campaigns/accounts?${qs}`).then(setD).catch((e) => setError(e.message));
  }, [client, refresh]);
  if (error && !d) return <div className="mt-4"><ErrorBox error={`Sending accounts: ${error}`} /></div>;
  if (!d) return <Card className="mt-4"><Skeleton className="h-5 w-48" /><Skeleton className="mt-4 h-16 w-full" /></Card>;
  const label = (k: BucketR2) => d.buckets.find((b) => b.key === k)?.label ?? k;
  const help = (k: BucketR2) => d.buckets.find((b) => b.key === k)?.help ?? '';
  const shown = [...MAIN, ...(['risk', 'disconnected'] as BucketR2[]).filter((k) => d.counts[k] > 0)];
  const usedPct = d.capacity.total ? Math.round((d.capacity.used / d.capacity.total) * 100) : 0;
  const rows = open === null ? [] : d.accounts.filter((a) => open === 'all' || a.bucket === open);
  return (
    <Card className="mt-4 p-0">
      <div className="flex flex-col gap-1 px-4 pt-4 sm:flex-row sm:items-baseline sm:justify-between sm:px-5">
        <h2 className="text-[15px] font-semibold text-fg">Sending accounts{d.client ? ` · ${d.client}` : ' · all active clients'}</h2>
        <button onClick={() => setOpen(open === 'all' ? null : 'all')} className="min-h-9 self-start text-sm font-semibold text-accent-ink hover:underline">{open === 'all' ? 'Hide inboxes' : `Show all ${d.total} inboxes`}</button>
      </div>
      {d.alert && <div role="status" className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm font-medium text-warn sm:mx-5"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />{d.alert}</div>}
      <div className="grid grid-cols-3 gap-px border-y border-line bg-line mt-3 sm:grid-cols-4 lg:grid-cols-[repeat(9,minmax(0,1fr))]">
        <Tile label="Total" n={d.total} active={open === 'all'} onClick={() => setOpen(open === 'all' ? null : 'all')} help="Every inbox of these clients." />
        {shown.map((k) => <Tile key={k} label={label(k)} n={d.counts[k]} tone={TONE[k]} active={open === k} onClick={() => setOpen(open === k ? null : k)} help={help(k)} />)}
      </div>
      <div className="px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-fg-2">
          <span><span className="font-semibold text-fg">Daily capacity</span> <span className="tabular">{num(d.capacity.total)}</span> cold emails</span>
          <span>· <span className="tabular font-semibold text-good">{num(d.capacity.used)}</span> used by live campaigns ({usedPct}%)</span>
          <span>· <span className="tabular font-semibold text-accent-ink">{num(d.capacity.free)}</span> free</span>
          {d.capacity.ready > 0 && <span>· <span className="tabular font-semibold text-info">{num(d.capacity.ready)}</span> ready next</span>}
        </div>
        <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-line" role="img" aria-label={`${usedPct}% of the daily capacity is used`}>
          <div className="h-full bg-good" style={{ width: `${usedPct}%` }} />
          <div className="h-full bg-info/60" style={{ width: `${d.capacity.total ? Math.round((d.capacity.ready / d.capacity.total) * 100) : 0}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">Capacity = cold daily limits of every inbox that can send (not spam, resting or disconnected). Free = healthy, connected, warm-up {d.warmMin}+, in no live or built campaign (Atlas uses these for a new campaign).</p>
      </div>
      {open !== null && <AccountTable rows={rows} label={label} />}
      {!d.clientKey && d.byClient.length > 0 && open === null && (
        <div className="border-t border-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-sunken text-xs text-muted"><tr>
                <th className="px-5 py-2 font-medium">Client</th><th className="px-3 py-2 text-right font-medium">Inboxes</th><th className="px-3 py-2 text-right font-medium">Sending</th><th className="px-3 py-2 text-right font-medium">Ready next</th>
                <th className="px-3 py-2 text-right font-medium">Free</th><th className="px-3 py-2 text-right font-medium">Warming</th><th className="px-3 py-2 text-right font-medium">Resting</th><th className="px-3 py-2 text-right font-medium">Spam</th><th className="px-5 py-2 text-right font-medium">Used / capacity a day</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {d.byClient.map((c) => (
                  <tr key={c.key} onClick={() => onPick(c.key)} className="cursor-pointer hover:bg-hover">
                    <td className="px-5 py-2.5 font-medium text-fg">{c.name}{!c.sending && <span className="ml-2 text-xs font-semibold text-warn">nothing sending</span>}</td>
                    <td className="tabular px-3 py-2.5 text-right">{c.total}</td><td className="tabular px-3 py-2.5 text-right font-semibold text-good">{c.sending}</td><td className="tabular px-3 py-2.5 text-right">{c.ready}</td>
                    <td className="tabular px-3 py-2.5 text-right text-accent-ink">{c.free}</td><td className="tabular px-3 py-2.5 text-right">{c.warming}</td><td className="tabular px-3 py-2.5 text-right">{c.resting}</td>
                    <td className={cx('tabular px-3 py-2.5 text-right', c.spam ? 'text-bad' : '')}>{c.spam}</td><td className="tabular px-5 py-2.5 text-right">{num(c.used)} / {num(c.capacity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function Tile({ label, n, tone, active, onClick, help }: { label: string; n: number; tone?: string; active: boolean; onClick: () => void; help: string }) {
  return (
    <button onClick={onClick} title={help} aria-pressed={active} className={cx('min-w-0 bg-surface px-3 py-3 text-left transition hover:bg-hover sm:px-4', active && 'bg-accent-soft')}>
      <div className={cx('tabular text-[22px] font-bold leading-none', n ? tone ?? 'text-fg' : 'text-faint')}>{n}</div>
      <div className="mt-1 truncate text-xs font-medium text-muted">{label}</div>
    </button>
  );
}

function AccountTable({ rows, label }: { rows: SendingBoxR2['accounts']; label: (k: BucketR2) => string }) {
  const [limit, setLimit] = useState(100);
  if (!rows.length) return <div className="border-t border-line px-5 py-4 text-sm text-muted">No inboxes here.</div>;
  return (
    <div className="border-t border-line">
      <ul className="divide-y divide-line md:hidden">
        {rows.slice(0, limit).map((a) => (
          <li key={a.id} className="px-4 py-2.5">
            <div className="break-all text-sm font-medium text-fg">{a.email}</div>
            <div className="text-xs text-muted">{[label(a.bucket), a.campaigns[0], a.dailyLimit !== null ? `${a.dailyLimit} cold/day` : '', a.warmup !== null ? `warm-up ${a.warmup}` : '', a.note].filter(Boolean).join(' · ')}</div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-sunken text-xs text-muted"><tr>
            <th className="px-5 py-2 font-medium">Inbox</th><th className="px-3 py-2 font-medium">Now</th><th className="px-3 py-2 font-medium">Campaign</th><th className="px-3 py-2 text-right font-medium">Cold / day</th>
            <th className="px-3 py-2 text-right font-medium">Warm-up / day</th><th className="px-3 py-2 text-right font-medium">Warm-up score</th><th className="px-3 py-2 text-right font-medium">Placement</th><th className="px-3 py-2 text-right font-medium">Sent</th><th className="px-5 py-2 text-right font-medium">Bounce</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, limit).map((a) => (
              <tr key={a.id} className="align-top">
                <td className="px-5 py-2 font-medium text-fg">{a.email}{a.note && <div className={cx('text-xs font-normal', /OFF|still in|nothing/.test(a.note) ? 'text-bad' : 'text-muted')}>{a.note}</div>}</td>
                <td className={cx('px-3 py-2', TONE[a.bucket])}>{label(a.bucket)}</td>
                <td className="px-3 py-2 text-fg-2">{a.campaigns.join(', ') || '–'}</td>
                <td className="tabular px-3 py-2 text-right">{a.dailyLimit ?? '–'}</td><td className="tabular px-3 py-2 text-right">{a.warmupLimit ?? '–'}</td>
                <td className="tabular px-3 py-2 text-right">{a.warmup ?? '–'}</td><td className="tabular px-3 py-2 text-right">{a.score !== null ? `${a.score}%` : '–'}</td>
                <td className="tabular px-3 py-2 text-right">{a.contacted ? num(a.contacted) : '–'}</td><td className="tabular px-5 py-2 text-right">{a.bounce !== null ? `${a.bounce}%` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <button onClick={() => setLimit(limit + 200)} className="min-h-11 w-full border-t border-line text-sm font-semibold text-fg-2 hover:bg-hover">Show {Math.min(200, rows.length - limit)} more</button>}
    </div>
  );
}
