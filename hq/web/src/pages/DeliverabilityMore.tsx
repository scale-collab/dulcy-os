// Deliverability, Batch 3 parts (Alex, 2026-11-27): email bounce analytics, verification performance,
// the inbox limit editor and the new-client ramp card. The limit editor is the one write: owner only
// (the server checks), an explicit "I confirm" tick, and a dry run until inbox.limits is switched live.
import { useCallback, useEffect, useState } from 'react';
import { api, type BouncesB3, type CodeRowR2, type LimitResultB3, type LimitsB3, type RampProposalB3, type StatsRowR2, type VerificationB3 } from '../api';
import { CodeList, StatsStrip } from './DeliverabilityR2';
import { Button, Card, cx, Empty, ErrorBox, PageSkeleton, Pill, showToast, timeAgo } from '../ui';
import { BarList, Conclusion, Select } from '../charts';

const PERIOD_LABEL: Record<number, string> = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days' };

/* ---------- Limits: who can edit, whether it is live, the ramp proposals, recent changes ---------- */
export function useLimits(client: string, refresh: number) {
  const [d, setD] = useState<LimitsB3 | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    api<LimitsB3>(`/deliverability/limits${client ? `?client=${encodeURIComponent(client)}` : ''}${refresh ? `${client ? '&' : '?'}refresh=1` : ''}`).then(setD).catch(() => setD(null));
  }, [client, refresh, n]);
  return { limits: d, reload: useCallback(() => setN((x) => x + 1), []) };
}

/** Cold daily limit + warm-up limit, for one inbox, a few, or all of a client's inboxes. */
export function LimitEditor({ label, accounts, client, cold, warmup, live, rampKey, onDone, onCancel }: {
  label: string; accounts?: string[]; client?: string; cold: number | null; warmup: number | null; live: boolean; rampKey?: string; onDone: () => void; onCancel: () => void;
}) {
  const [c, setC] = useState(cold === null ? '' : String(cold));
  const [w, setW] = useState(warmup === null ? '' : String(warmup));
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      const r = await api<LimitResultB3>('/deliverability/limits', { body: { ...(accounts?.length ? { accounts } : { client }), cold: c === '' ? null : Number(c), warmup: w === '' ? null : Number(w), confirm: true, ...(rampKey ? { rampKey } : {}) } });
      showToast({ tone: 'good', text: `${r.dryRun ? 'Dry run queued (nothing changes in EmailBison yet)' : 'Queued'}: ${r.summary}${r.skipped.length ? `. Left alone: ${r.skipped.length}` : ''}.`, ms: 7000 });
      onDone();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const field = (id: string, text: string, v: string, set: (x: string) => void) => (
    <label htmlFor={id} className="min-w-0">
      <span className="block text-xs font-medium text-muted">{text}</span>
      <input id={id} type="number" inputMode="numeric" min={0} max={50} value={v} onChange={(e) => set(e.target.value)} placeholder="keep"
        className="tabular mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-fg outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft" />
    </label>
  );
  return (
    <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3.5" role="group" aria-label={`Edit limits: ${label}`}>
      <div className="text-sm font-semibold text-fg">{label}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm">{field(`cold-${label}`, 'Cold emails per day', c, setC)}{field(`warm-${label}`, 'Warm-up per day', w, setW)}</div>
      <p className="mt-2 text-xs text-muted">Empty = keep. Resting inboxes keep 0 cold until their retest. New client ramp: 5/10 → 10/20 → 15/30.</p>
      <label className="mt-2 flex min-h-10 items-start gap-2 text-sm text-fg-2">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
        <span>I confirm: this changes {accounts?.length === 1 ? 'this inbox' : 'these inboxes'} in EmailBison.{!live && ' (Dry run for now: the engine reports only.)'}</span>
      </label>
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button tone="accent" disabled={!ok || busy || (c === '' && w === '')} onClick={() => void save()} className="min-h-10 px-4 text-sm">{busy ? 'Saving…' : 'Save'}</Button>
        <Button tone="ghost" disabled={busy} onClick={onCancel} className="min-h-10 px-3 text-sm">Cancel</Button>
      </div>
    </div>
  );
}

/** Atlas's ramp proposals: Problem → Decision → why, and Apply (owner) through the same write path. */
export function RampCard({ limits, onApplied }: { limits: LimitsB3; onApplied: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!limits.proposals.length) return null;
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="font-semibold text-fg">New client ramp</h2>
        <span className="text-xs text-muted">Atlas proposes · you approve</span>
      </div>
      <ul className="divide-y divide-line">
        {limits.proposals.map((p: RampProposalB3) => (
          <li key={p.key} className="px-4 py-3 sm:px-5">
            <div className="text-[15px] font-semibold text-fg">{p.client}: {p.emails.length} inbox{p.emails.length === 1 ? '' : 'es'} {p.from.cold}/{p.from.warmup} → {p.to.cold}/{p.to.warmup}</div>
            <div className="mt-0.5 text-sm text-fg-2">{p.why}</div>
            <details className="mt-1 text-xs text-muted"><summary className="min-h-8 cursor-pointer">Which inboxes</summary><div className="break-all">{p.emails.join(', ')}</div></details>
            {limits.canEdit && open !== p.key && <Button tone="accent" onClick={() => setOpen(p.key)} className="mt-2 min-h-10 px-3 text-sm">Apply {p.to.cold}/{p.to.warmup}</Button>}
            {!limits.canEdit && <p className="mt-1 text-xs text-muted">Alex applies it.</p>}
            {open === p.key && <div className="mt-2"><LimitEditor label={`${p.client} → ${p.to.cold}/${p.to.warmup}`} accounts={p.accounts} cold={p.to.cold} warmup={p.to.warmup} live={limits.live} rampKey={p.key} onDone={() => { setOpen(null); onApplied(); }} onCancel={() => setOpen(null)} /></div>}
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2 text-xs text-muted sm:px-5">{limits.rule}</p>
    </Card>
  );
}

/** Recent limit changes (the engine's jobs). */
export function LimitHistory({ limits }: { limits: LimitsB3 }) {
  if (!limits.history.length) return null;
  return (
    <details className="text-sm">
      <summary className="min-h-10 cursor-pointer font-semibold text-fg-2">Recent limit changes ({limits.history.length})</summary>
      <ul className="mt-2 space-y-2">
        {limits.history.map((h) => (
          <li key={h.id} className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5"><span className="font-medium text-fg">{h.client || 'Inboxes'}</span><Pill tone={h.status === 'succeeded' ? 'good' : h.status === 'failed' ? 'bad' : 'plain'}>{h.status}</Pill>{h.dryRun && <Pill>dry run</Pill>}{h.source === 'ramp' && <Pill tone="accent">ramp</Pill>}<span className="text-xs text-muted">{timeAgo(h.at)} · {h.by}</span></div>
            {h.message && <div className="mt-0.5 break-words text-xs text-muted">{h.message}</div>}
          </li>
        ))}
      </ul>
      {!limits.live && <p className="mt-2 text-xs text-muted">Limit changes are dry runs until Alex adds <code>inbox.limits</code> to LIVE_STAGES on the server.</p>}
    </details>
  );
}

/* ---------- Bounces ---------- */
export function BouncesTab({ client, refresh }: { client: string; refresh: number }) {
  const [days, setDays] = useState(30);
  const [campaign, setCampaign] = useState('');
  const [account, setAccount] = useState('');
  // Round 2: SMTP codes (codes) and the light stats row (stats) ride along.
  const [d, setD] = useState<(BouncesB3 & { codes?: CodeRowR2[]; stats?: StatsRowR2 }) | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setCampaign(''); setAccount(''); }, [client]);
  useEffect(() => {
    setError('');
    const qs = new URLSearchParams({ days: String(days), ...(client ? { client } : {}), ...(campaign ? { campaign } : {}), ...(account ? { account } : {}), ...(refresh ? { refresh: '1' } : {}) });
    api<BouncesB3>(`/deliverability/bounces?${qs}`).then(setD).catch((e) => setError(e.message));
  }, [client, days, campaign, account, refresh]);
  if (error && !d) return <ErrorBox error={error} />;
  if (!d) return <PageSkeleton kind="list" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Select label="Period" value={String(days)} onChange={(v) => setDays(Number(v))} options={d.periods.map((p) => ({ value: String(p), label: PERIOD_LABEL[p] ?? `${p} days` }))} />
        <Select label="Campaign" value={campaign} onChange={(v) => { setCampaign(v); setAccount(''); }} options={[{ value: '', label: 'All campaigns' }, ...d.options.campaigns.map((c) => ({ value: c.key, label: `${c.name} (${c.count})` }))]} />
        <Select label="Sending inbox" value={account} onChange={setAccount} options={[{ value: '', label: 'All sending inboxes' }, ...d.options.accounts.map((a) => ({ value: a.key, label: `${a.name} (${a.count})` }))]} />
      </div>
      <Conclusion c={d.conclusion} />
      {d.stats && <StatsStrip s={d.stats} days={days} />}
      <div className="text-sm text-muted"><span className="tabular font-semibold text-fg-2">{d.total.toLocaleString('en-US')}</span> bounces{d.capped ? ` (first ${d.maxRows.toLocaleString('en-US')} read)` : ''}</div>
      {!d.total ? <Card><Empty icon="check" tone="good" title="No bounces" sub="Nothing bounced in this view." /></Card> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {d.codes ? <CodeList rows={d.codes} /> : <BarList title="Bounce codes" rows={d.byCode} />}
          <BarList title="Where bounces land" rows={d.byLanding} />
          <BarList title="What kind" rows={d.byKind} />
          <BarList title="Hard vs soft" rows={d.byType} />
          {d.gateways.length > 0 && <BarList title="Security gateways" rows={d.gateways} tone="bad" />}
          {!campaign && <BarList title="By campaign (tap to filter)" rows={d.byCampaign} onPick={(k) => setCampaign(k)} />}
          {!account && <BarList title="By sending inbox (tap to filter)" rows={d.byAccount} onPick={(k) => setAccount(k)} />}
        </div>
      )}
      <p className="text-xs text-muted">From Airtable (Emails with Lead Status Bounced: the rows the Spam Center charts read), read {timeAgo(d.readAt) || 'just now'}; kept 10 minutes. Where it lands: the row's mail provider, or an MX lookup when that is empty. Codes are the SMTP reply codes (550, 452…); the 5.x.x / 4.x.x code under each is the detail. Soft = any 4xx. A bare 550 counts as "address not found" (approximate).</p>
    </div>
  );
}

/* ---------- Verification ---------- */
const VERDICT: Record<string, { label: string; tone: 'bad' | 'warn' | 'good' | 'plain' }> = { problem: { label: 'Verification problem', tone: 'bad' }, watch: { label: 'Watch', tone: 'warn' }, ok: { label: 'Fine', tone: 'good' }, few: { label: 'Too few to judge', tone: 'plain' } };
export function VerificationTab({ client, refresh }: { client: string; refresh: number }) {
  const [days, setDays] = useState(90);
  const [d, setD] = useState<VerificationB3 | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    const qs = new URLSearchParams({ days: String(days), ...(client ? { client } : {}), ...(refresh ? { refresh: '1' } : {}) });
    api<VerificationB3>(`/deliverability/verification?${qs}`).then(setD).catch((e) => setError(e.message));
  }, [client, days, refresh]);
  if (error && !d) return <ErrorBox error={error} />;
  if (!d) return <PageSkeleton kind="list" />;
  const pctOf = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);
  return (
    <div className="space-y-4">
      <Select label="Bounces from" value={String(days)} onChange={(v) => setDays(Number(v))} options={d.periods.map((p) => ({ value: String(p), label: `Bounces: ${PERIOD_LABEL[p]?.toLowerCase() ?? `${p} days`}` }))} />
      <Conclusion c={d.conclusion} />
      {d.totals.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">Per verifier</caption>
            <thead className="border-b border-line bg-sunken text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Verified by</th><th className="px-3 py-2 text-right font-medium">Emails</th><th className="px-3 py-2 text-right font-medium">Contacted</th><th className="px-3 py-2 text-right font-medium">Bounces</th><th className="px-3 py-2 text-right font-medium">Rate</th><th className="px-4 py-2 text-right font-medium">Not found</th></tr></thead>
            <tbody className="divide-y divide-line">
              {d.totals.map((t) => (
                <tr key={t.verifier}><td className="px-4 py-2 font-medium text-fg">{t.verifier}</td><td className="tabular px-3 py-2 text-right">{t.leads ? t.leads.toLocaleString('en-US') : '–'}</td><td className="tabular px-3 py-2 text-right">{t.contacted ? t.contacted.toLocaleString('en-US') : '–'}</td><td className="tabular px-3 py-2 text-right">{t.bounces}</td><td className="tabular px-3 py-2 text-right">{t.rate === null ? '–' : `${t.rate}%`}</td><td className={cx('tabular px-4 py-2 text-right font-semibold', (t.notFoundShare ?? 0) >= 0.5 && t.bounces >= 10 ? 'text-bad' : 'text-fg-2')}>{pctOf(t.notFoundShare)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {!d.campaigns.length ? <Card><Empty icon="check" tone="good" title="Nothing to show" sub="No campaigns with bounces or a verified list in this view." /></Card> : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {d.campaigns.map((c) => (
            <li key={c.id}>
              <Card className={cx('h-full p-4', c.verdict === 'problem' && 'border-bad-line')}>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="break-words text-[15px] font-semibold text-fg">{c.name}</div><div className="text-xs text-muted">{c.client} · {c.contacted.toLocaleString('en-US')} contacted · bounce {c.bounce}%</div></div><Pill tone={VERDICT[c.verdict].tone}>{VERDICT[c.verdict].label}</Pill></div>
                <p className="mt-2 text-sm text-fg-2">{c.line}</p>
                {c.cohorts.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {c.cohorts.map((k) => (
                      <li key={`${k.verifier}|${k.emailType}`} className="flex flex-wrap justify-between gap-x-3 rounded-lg bg-sunken px-2.5 py-1.5">
                        <span className="font-medium text-fg-2">{k.verifier} · {k.emailType}{k.source ? ` · ${k.source}` : ''}</span>
                        <span className="tabular text-muted">{k.leads ? `${k.leads.toLocaleString('en-US')} emails · ` : ''}{k.bounces} bounced{k.bounces ? ` (${k.notFound} not found)` : ''}{k.rate !== null ? ` · ${k.rate}%${k.contactedEstimated ? ' est.' : ''}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Dulcy verifies with MillionVerifier (LeadMagic as the fallback for direct emails). Client verified = a list the client verified themselves (its name says "client verified"). Not recorded = the list and the bounced row say nothing about who verified it. The verifier comes from each lead list (its verifier fields, the engine's route or its MillionVerifier job) or the bounced row's own tag. Rates use contacted from the old n8n cohorts when there ({d.oldCohorts} rows), else an estimate from the list mix ("est."). Read in the background when Deliverability opens; kept 10 minutes. Read {timeAgo(d.readAt) || 'just now'}.</p>
    </div>
  );
}
