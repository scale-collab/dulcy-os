// Deliverability, Round 2/3 parts (Alex, 2026-11-27): Atlas's warm-up line (resting = expected),
// placement test bands per date (like the old Airtable screen), bounce codes as SMTP codes, the light
// stats row, the renewal-date gap (Atlas task), the monthly inbox cost (owner) and the Buy flow
// (Draft → quote → approve; nothing buys by itself). Dates use slashes (11/27). Text is escaped.
import { useState } from 'react';
import { api, type BuyResultR2, type ClientCostR2, type CodeRowR2, type PurchaseR2, type RenewalGapR2, type StatsRowR2, type TestRunR2, type WarmupSummaryR2 } from '../api';
import { Avatar, Button, Card, cx, go, Icon, Pill, showToast, timeAgo } from '../ui';
import { FixItButton } from '../fixIt';
import { Select } from '../charts';

/** "11/27" from YYYY-MM-DD (Round 2: slashes, no leading zeros). */
export const sd = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');
const usd = (x: number) => `$${x.toLocaleString('en-US', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const nf = (x: number) => x.toLocaleString('en-US');

/* ---------- Warm-up off: Atlas's one line ---------- */
const WHY_SHORT: Record<string, string> = { resting: 'resting', replacing: 'replacing', spam: 'spam review', bounces: 'paused by EmailBison' };
export function WarmupLine({ w, client }: { w: WarmupSummaryR2; client?: string }) {
  if (!w.off) return null;
  return (
    <div className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm leading-snug', w.unexpected ? 'border-bad-line bg-bad-soft' : 'border-line bg-sunken')}>
      <Avatar name="Atlas" size="xs" className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="font-semibold text-fg"><span className="text-muted">Atlas: </span>{w.line}</div>
        <div className="flex flex-wrap gap-1.5" aria-label="Warm-up off by reason">
          {(['resting', 'replacing', 'spam', 'bounces'] as const).filter((k) => w.byWhy[k]).map((k) => <Pill key={k}>warm-up off ({WHY_SHORT[k]}) {nf(w.byWhy[k])}</Pill>)}
          {w.unexpected > 0 && <Pill tone="bad">unexpected {nf(w.unexpected)}</Pill>}
        </div>
        {w.unexpected > 0 && <FixItButton agent="Atlas" title={`Turn warm-up back on for ${w.unexpected} inbox${w.unexpected === 1 ? '' : 'es'}`} detail={w.line} client={client} className="pt-0.5" />}
      </div>
    </div>
  );
}

/* ---------- Placement: bands per test date ---------- */
const BAND_TONE = ['bg-bad', 'bg-warn', 'bg-[color-mix(in_oklab,var(--warn)_35%,var(--good))]', 'bg-good'];
const BAND_TEXT = ['text-bad', 'text-warn', 'text-fg-2', 'text-good'];
export function PlacementRuns({ runs, bands }: { runs: TestRunR2[]; bands: string[] }) {
  if (!runs.length) return null;
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="font-semibold text-fg">Inbox placement tests</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted" aria-hidden="true">
          {bands.map((b, i) => <span key={b} className="inline-flex items-center gap-1.5"><span className={cx('h-2.5 w-2.5 rounded-sm', BAND_TONE[i])} />{b}</span>)}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Accounts tested per test date and how many scored in each band</caption>
          <thead className="border-b border-line bg-sunken text-xs text-muted">
            <tr><th className="px-4 py-2 font-medium sm:px-5">Test date</th><th className="px-2 py-2 text-right font-medium">Tested</th>{bands.map((b) => <th key={b} className="w-16 px-2 py-2 text-right font-medium">{b}</th>)}<th className="w-[34%] px-4 py-2 font-medium"><span className="sr-only">Share</span></th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {runs.map((r) => (
              <tr key={r.date}>
                <td className="tabular px-4 py-2.5 font-semibold text-fg sm:px-5">{sd(r.date)}</td>
                <td className="tabular px-2 py-2.5 text-right font-semibold text-fg">{nf(r.tested)}</td>
                {r.bands.map((n, i) => <td key={i} className={cx('tabular px-2 py-2.5 text-right', n ? cx('font-semibold', BAND_TEXT[i]) : 'text-faint')}>{nf(n)}</td>)}
                <td className="px-4 py-2.5">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-sunken" role="img" aria-label={r.bands.map((n, i) => `${bands[i]}: ${n}`).join(', ')}>
                    {r.bands.map((n, i) => n ? <div key={i} className={cx('h-3', BAND_TONE[i], i > 0 && 'border-l-2 border-surface')} style={{ width: `${(n / Math.max(1, r.tested)) * 100}%` }} title={`${bands[i]}: ${n} of ${r.tested}`} /> : null)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-muted sm:px-5">One row per Friday test: each inbox's score that day (overall placement %). Under 60% = rested 7 days.</p>
    </Card>
  );
}

/* ---------- Bounces: SMTP codes ---------- */
export function CodeList({ rows }: { rows: CodeRowR2[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <h3 className="text-sm font-semibold text-fg">Bounce codes</h3>
      <p className="text-xs text-muted">Soft = any 4xx (temporary) · hard = 5xx.</p>
      {!rows.length ? <p className="mt-2 text-sm text-muted">Nothing here.</p> : (
        <ul className="mt-3 space-y-3" aria-label="Bounce codes">
          {rows.map((r) => (
            <li key={r.key} title={`${r.label}: ${r.n} bounces (${Math.round(r.share * 100)}%)`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="tabular text-base font-bold text-fg">{r.key === 'rest' ? r.label : r.code === 'Unknown' ? 'No code' : r.code}</span>
                  {r.soft !== null && <span className={cx('ml-1.5 rounded px-1 text-[11px] font-semibold', r.soft ? 'bg-sunken text-muted' : 'bg-bad-soft text-bad')}>{r.soft ? 'soft' : 'hard'}</span>}
                  <span className="ml-2 text-sm text-fg-2">{r.detail || r.meaning}</span>
                </span>
                <span className="tabular shrink-0 text-xs text-muted"><span className="font-semibold text-fg">{nf(r.n)}</span> · {Math.round(r.share * 100)}%</span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-sunken" aria-hidden="true"><div className={cx('h-2 rounded-full', r.soft ? 'bg-warn' : 'bg-accent')} style={{ width: `${Math.max(2, Math.round((r.n / max) * 100))}%` }} /></div>
              {r.enhanced.length > 0 && <div className="tabular mt-0.5 text-[11px] text-muted">{r.enhanced.map((e) => `${e.code} ×${e.n}${e.meaning ? ` (${e.meaning.toLowerCase()})` : ''}`).join(' · ')}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The light stats row next to the bounces (not the focus). */
export function StatsStrip({ s, days }: { s: StatsRowR2; days: number }) {
  const cell = (label: string, v: string, sub?: string) => (
    <div className="min-w-0"><div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</div><div className="tabular text-base font-semibold text-fg">{v}</div>{sub && <div className="text-[11px] text-muted">{sub}</div>}</div>
  );
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-2.5" aria-label="Other stats">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {cell('Sent', s.sent === null ? '–' : nf(s.sent), s.campaigns ? `${s.campaigns} campaign${s.campaigns === 1 ? '' : 's'}` : undefined)}
        {cell('Replies', nf(s.replies), `${days} days`)}
        {cell('Interested', nf(s.interested), s.replies ? `${Math.round((s.interested / s.replies) * 100)}% of replies` : undefined)}
        {cell('Meetings', nf(s.meetings), `${days} days`)}
        {cell('Bounces', nf(s.bounces), `${days} days`)}
        {cell('Bounce rate', s.bounceRate === null ? '–' : `${s.bounceRate}%`, s.bounceRate === null ? 'pick a campaign' : 'campaign')}
      </div>
      <p className="mt-1 text-[11px] text-muted">{s.note}</p>
    </div>
  );
}

/* ---------- Domains: renewal gap, cost, buying ---------- */
export function RenewalCard({ gap, task, cheap }: { gap: RenewalGapR2; task: { status: string; title: string; updated: string; note: string } | null; cheap: { connected: boolean; error: string } }) {
  if (!gap.missing && !gap.fromCheapInboxes) return null;
  const open = task && task.status !== 'done';
  return (
    <div className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm leading-snug', gap.missing ? 'border-warn/25 bg-warn-soft' : 'border-line bg-sunken')}>
      <Icon name="calendar" size={16} className={cx('mt-0.5', gap.missing ? 'text-warn' : 'text-muted')} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="font-semibold text-fg">{gap.missing ? `${nf(gap.missing)} of ${nf(gap.total)} domains have no real renewal date` : `Every domain has a real renewal date`}</div>
        <div className="text-fg-2">
          {cheap.connected ? `${nf(gap.fromCheapInboxes)} dates come from Cheap Inboxes.${cheap.error ? ` Cheap Inboxes could not be read: ${cheap.error}.` : ''}` : 'Cheap Inboxes is not connected (CHEAPINBOXES_API_KEY on the server), so HQ shows 1 year from the date added, marked "estimated".'}
          {gap.missing > 0 && ' Atlas fills the rest from the domain provider.'}
        </div>
        {open ? (
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs font-medium text-fg-2"><Avatar name="Atlas" size="xs" />Atlas task: {task!.title} <Pill tone={task!.status === 'in_progress' ? 'info' : 'plain'}>{task!.status.replace('_', ' ')}</Pill><span className="text-muted">updated {timeAgo(task!.updated)}</span>
            <button onClick={() => go('agents/Atlas')} className="min-h-9 font-semibold text-accent-ink hover:underline">See Atlas's tasks</button></div>
        ) : gap.missing > 0 && <FixItButton agent="Atlas" title={`Fill the renewal date on ${gap.missing} domains`} detail="Domains with no Renewal Date in Airtable and none from Cheap Inboxes. Fill it from the domain provider." className="pt-1" />}
      </div>
    </div>
  );
}

export function CostLine({ c, rule }: { c: ClientCostR2 | undefined; rule: string }) {
  if (!c) return null;
  return <span title={rule} className="tabular text-xs font-semibold text-fg-2"> · {usd(c.monthly)}/month{c.source !== 'cheapinboxes' ? <span className="font-normal text-muted"> ({c.source === 'default' ? `est. ${usd(c.perInbox)}/inbox` : 'part estimated'})</span> : ''}</span>;
}

export function CostTotal({ costs, rule }: { costs: ClientCostR2[]; rule: string }) {
  if (!costs.length) return null;
  const t = costs.reduce((a, c) => ({ d: a.d + c.domains, i: a.i + c.inboxes, m: a.m + c.monthly }), { d: 0, i: 0, m: 0 });
  const est = costs.some((c) => c.source !== 'cheapinboxes');
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
      <div><div className="text-xs font-medium text-muted">Domains</div><div className="tabular text-xl font-bold text-fg">{nf(t.d)}</div></div>
      <div><div className="text-xs font-medium text-muted">Inboxes</div><div className="tabular text-xl font-bold text-fg">{nf(t.i)}</div></div>
      <div><div className="text-xs font-medium text-muted">Monthly cost{est ? ' (estimated)' : ''}</div><div className="tabular text-xl font-bold text-fg">{usd(Math.round(t.m * 100) / 100)}</div></div>
      <p className="text-xs text-muted sm:ml-auto sm:max-w-xs">{rule} Owner only.</p>
    </Card>
  );
}

const NEXT_LABEL: Record<PurchaseR2['next'], { label: string; tone: 'warn' | 'info' | 'good' | 'bad' | 'plain' }> = {
  quote: { label: 'Draft: get a quote', tone: 'plain' }, wait: { label: 'n8n is quoting', tone: 'info' }, approve: { label: 'Waiting for your OK', tone: 'warn' },
  buying: { label: 'Buying (n8n)', tone: 'info' }, done: { label: 'Done', tone: 'good' }, fix: { label: 'Failed', tone: 'bad' },
};
/** The Buy button + form and the open purchase requests with their one next step. Owner only for actions. */
export function BuyPanel({ purchases, clients, canBuy, client, onDone }: { purchases: PurchaseR2[]; clients: { key: string; name: string }[]; canBuy: boolean; client: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 font-semibold text-fg"><Icon name="briefcase" size={16} className="text-muted" />Buy domains + inboxes</h2>
        {canBuy && !open && <Button tone="accent" icon="plus" onClick={() => setOpen(true)} className="min-h-10 px-3 text-sm">Buy</Button>}
      </div>
      {open && <BuyForm clients={clients} client={client} onCancel={() => setOpen(false)} onDone={() => { setOpen(false); onDone(); }} />}
      {purchases.length ? (
        <ul className="divide-y divide-line">{purchases.map((p) => <PurchaseRow key={p.id} p={p} canBuy={canBuy} onDone={onDone} />)}</ul>
      ) : !open && <p className="px-4 py-3 text-sm text-muted sm:px-5">No open purchase requests.{canBuy ? ' Buy makes one (a draft: nothing is bought until you approve the quote).' : ''}</p>}
      <p className="border-t border-line px-4 py-2 text-xs text-muted sm:px-5">Same request as the Airtable Buy Domains & Inboxes screen: Draft → quote (n8n asks Cheap Inboxes, no charge) → your OK on the exact price → n8n buys. 2 inboxes per domain.</p>
    </Card>
  );
}

function BuyForm({ clients, client, onCancel, onDone }: { clients: { key: string; name: string }[]; client: string; onCancel: () => void; onDone: () => void }) {
  const [c, setC] = useState(client || clients[0]?.key || '');
  const [n, setN] = useState('5');
  const [provider, setProvider] = useState('Google');
  const [tld, setTld] = useState('.com');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const count = Number(n);
  const valid = !!c && Number.isInteger(count) && count >= 1 && count <= 100;
  const save = async () => {
    setBusy(true); setError('');
    try {
      const r = await api<BuyResultR2>('/deliverability/buy', { body: { action: 'create', client: c, domains: count, provider, tlds: [tld], confirm: true } });
      showToast({ tone: 'good', text: r.summary, ms: 7000 });
      onDone();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="border-b border-line bg-accent-soft/40 px-4 py-3.5 sm:px-5" role="group" aria-label="New purchase request">
      <div className="grid gap-2 sm:grid-cols-4">
        <Select label="Client" value={c} onChange={setC} options={clients.map((x) => ({ value: x.key, label: x.name }))} />
        <label className="min-w-0"><span className="sr-only">Domains</span>
          <input type="number" inputMode="numeric" min={1} max={100} value={n} onChange={(e) => setN(e.target.value)} aria-label="Domains"
            className="tabular min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft" /></label>
        <Select label="Inbox provider" value={provider} onChange={setProvider} options={[{ value: 'Google', label: 'Google inboxes' }, { value: 'Microsoft', label: 'Microsoft inboxes' }]} />
        <Select label="Domain ending" value={tld} onChange={setTld} options={['.com', '.co', '.net', '.info'].map((t) => ({ value: t, label: t }))} />
      </div>
      <p className="mt-2 text-sm text-fg-2"><span className="tabular font-semibold">{valid ? count : '–'}</span> domains = <span className="tabular font-semibold">{valid ? count * 2 : '–'}</span> inboxes{valid ? ` · about ${usd(count * 2 * 2.5)}/month for the inboxes` : ''}. Names, sender and password come from the client's onboarding (n8n).</p>
      <label className="mt-2 flex min-h-10 items-start gap-2 text-sm text-fg">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
        <span>Save a purchase request. Nothing is bought: you approve the exact quote next.</span>
      </label>
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button tone="accent" disabled={!ok || !valid || busy} onClick={() => void save()} className="min-h-10 px-4 text-sm">{busy ? 'Saving…' : 'Save request'}</Button>
        <Button tone="ghost" disabled={busy} onClick={onCancel} className="min-h-10 px-3 text-sm">Cancel</Button>
      </div>
    </div>
  );
}

function PurchaseRow({ p, canBuy, onDone }: { p: PurchaseR2; canBuy: boolean; onDone: () => void }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const step = NEXT_LABEL[p.next];
  const act = async (action: 'quote' | 'approve') => {
    setBusy(true); setError('');
    try {
      const r = await api<BuyResultR2>('/deliverability/buy', { body: { action, id: p.id, confirm: true, ...(action === 'approve' ? { total: p.quoteToday } : {}) } });
      showToast({ tone: 'good', text: r.summary, ms: 7000 });
      setOk(false); onDone();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const canAct = canBuy && (p.next === 'quote' || (p.next === 'approve' && p.quoteToday !== null));
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-words text-sm font-semibold text-fg">{p.request}</span>{p.client && <Pill>{p.client}</Pill>}<Pill tone={step.tone}>{step.label}</Pill></div>
      <div className="mt-1 text-sm text-fg-2">
        {[p.domains !== null ? `${p.domains} domain${p.domains === 1 ? '' : 's'}` : '', p.mailboxes !== null ? `${p.mailboxes} inboxes` : '', p.provider, p.tlds.join(' '), p.selected ? `${p.selected} names picked` : ''].filter(Boolean).join(' · ') || 'No details yet'}
        {p.quoteToday !== null && <span className="tabular font-semibold text-fg"> · {usd(p.quoteToday)} today{p.monthly !== null ? `, ${usd(p.monthly)}/month` : ''}</span>}
        {p.quoteAt && <span className="text-muted"> · quoted {timeAgo(p.quoteAt)}</span>}
      </div>
      {p.error && <div className="mt-1 text-xs text-bad">{p.error}</div>}
      {canAct && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex min-h-10 items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            {p.next === 'quote' ? 'Get a quote (no charge)' : `I approve buying this for ${usd(p.quoteToday ?? 0)} today`}
          </label>
          <Button tone={p.next === 'approve' ? 'accent' : 'quiet'} disabled={!ok || busy} onClick={() => void act(p.next === 'quote' ? 'quote' : 'approve')} className="min-h-10 px-3 text-sm">
            {busy ? 'Saving…' : p.next === 'quote' ? 'Get quote' : `Approve ${usd(p.quoteToday ?? 0)}`}
          </Button>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
    </li>
  );
}
