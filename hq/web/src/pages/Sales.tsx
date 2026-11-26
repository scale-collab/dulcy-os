// Sales (owner only): Dulcy's own deals from booked call to signed and paid. What needs action
// first; the pipeline and each deal one tap deeper. Read only: the buttons only open Close, the
// Airtable record or the signing tool. Money comes from the server for the owner only.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type SalesAction, type SalesActionKind, type SalesDealLite, type SalesDetail, type SalesMonth, type SalesNote, type SalesStage, type SalesView, type User } from '../api';
import { Avatar, BackLink, Card, cx, Empty, ErrorBox, ExtLink, go, Icon, IconButton, Label, PageSkeleton, PageTitle, Pill, SectionHeader, setCount, timeAgo, usd } from '../ui';

const ACTION: Record<SalesActionKind, { label: string; tone: 'bad' | 'warn' | 'info' | 'accent' | 'good' }> = {
  call_today: { label: 'Call today', tone: 'accent' }, call_tomorrow: { label: 'Tomorrow', tone: 'info' }, no_outcome: { label: 'No outcome', tone: 'warn' },
  sign: { label: 'Your signature', tone: 'bad' }, unsigned: { label: 'Not signed', tone: 'warn' }, draft: { label: 'Not sent', tone: 'info' },
  unpaid: { label: 'Not paid', tone: 'bad' }, onboard: { label: 'Onboard', tone: 'accent' }, rebook: { label: 'Re-book', tone: 'warn' },
};
const STATE_LABEL: Record<string, string> = { draft: 'Draft', sent: 'Sent', viewed: 'Viewed', signed: 'Signed', declined: 'Declined', expired: 'Expired', error: 'Error', none: 'No status' };
const STATE_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'plain'> = { signed: 'good', viewed: 'info', sent: 'info', draft: 'plain', declined: 'bad', expired: 'bad', error: 'bad', none: 'plain' };
const day = (d: string) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' }) : '');
const when = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const VIEWS = [{ key: 'action', label: 'Needs action' }, { key: 'pipeline', label: 'Pipeline' }] as const;

/** #/sales[/pipeline[/90]] or #/sales/<record id>. */
export default function Sales({ user, a, b }: { user: User; a?: string; b?: string }) {
  if (user.role !== 'owner') return <><PageTitle title="Sales" /><Card><Empty icon="lock" title="Owner only" sub="Sales has money in it, so only the owner sees it." /></Card></>;
  if (a && /^rec[A-Za-z0-9]{14}$/.test(a)) return <DealPage id={a} />;
  return <SalesHome view={a === 'pipeline' ? 'pipeline' : 'action'} days={b === '90' ? 90 : 30} />;
}

function SalesHome({ view, days }: { view: 'action' | 'pipeline'; days: 30 | 90 }) {
  const [d, setD] = useState<SalesView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback((refresh = false) => {
    setBusy(true); setError('');
    api<SalesView>(`/sales?days=${days}${refresh ? '&refresh=1' : ''}`).then((x) => { setD(x); setCount('sales', x.counts.action); })
      .catch((e) => setError(e instanceof ApiError && e.status === 403 ? 'Only the owner sees Sales.' : e.message)).finally(() => setBusy(false));
  }, [days]);
  useEffect(() => load(), [load]);
  const title = (
    <PageTitle title="Sales" kicker={d ? `Dulcy's own deals · ${d.counts.action} need action` : "Dulcy's own deals"} sub="Booked call to signed and paid. What needs action first."
      right={<IconButton icon="refresh" label="Refresh" onClick={() => load(true)} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />} />
  );
  if (error && !d) return <>{title}<ErrorBox error={error} retry={() => load()} /></>;
  if (!d) return <>{title}<PageSkeleton kind="list" /></>;
  return (
    <div>
      {title}
      <TopNumbers now={d.top.thisMonth} last={d.top.lastMonth} />
      <div role="tablist" aria-label="Sales views" className="mt-5 grid grid-cols-2 gap-1 sm:flex">
        {VIEWS.map((x) => {
          const on = x.key === view;
          return (
            <button key={x.key} role="tab" aria-selected={on} onClick={() => go(x.key === 'action' ? 'sales' : `sales/pipeline${days === 90 ? '/90' : ''}`)}
              className={cx('flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition', on ? 'bg-ink text-ink-fg shadow-card' : 'text-muted hover:bg-hover hover:text-fg')}>
              {x.label}
              {x.key === 'action' && <span className={cx('tabular rounded-full px-1.5 text-xs', on ? 'bg-ink-fg/15' : d.counts.action ? 'bg-accent text-accent-fg' : 'border border-line bg-sunken text-fg-2')}>{d.counts.action}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        {view === 'action' ? <ActionList rows={d.action} /> : <Pipeline p={d.pipeline} days={days} />}
      </div>
      {d.notes.length > 0 && <div className="mt-6"><SectionHeader title="Data notes" icon="alert" right={<span className="text-xs text-muted">read only</span>} /><Notes notes={d.notes} fold={2} /></div>}
      <p className="mt-5 text-xs text-muted">
        From Airtable (Sales Data, New Client Intake, Contracts, Call Feedback, Workspace IDs, Client Invoices) and Cole's reports, read {timeAgo(d.readAt) || 'just now'}; kept for 1 minute.
        Not signed = sent {d.limits.unsignedDays}+ days ago. Calls and no-shows: the last {d.limits.callDays} days. HQ changes nothing here.
      </p>
    </div>
  );
}

function TopNumbers({ now, last }: { now: SalesMonth; last: SalesMonth }) {
  const tiles: { label: string; v: number | undefined; prev: number | undefined; money?: boolean; sub?: string }[] = [
    { label: 'Booked', v: now.booked, prev: last.booked },
    { label: 'Showed', v: now.showed, prev: last.showed },
    { label: 'Closed', v: now.closed, prev: last.closed, sub: 'signed' },
    ...(now.mrr !== undefined ? [{ label: 'New MRR', v: now.mrr, prev: last.mrr, money: true, sub: now.mrrUnknown ? `${now.mrrUnknown} with no amount` : undefined }] : []),
  ];
  return (
    <section aria-label={`${now.label} vs ${last.label}`}>
      <div className="mb-2 text-xs font-medium text-muted">{now.label} so far vs {last.label}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => {
          const up = (t.v ?? 0) > (t.prev ?? 0), down = (t.v ?? 0) < (t.prev ?? 0);
          return (
            <div key={t.label} className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="truncate text-xs font-medium text-muted">{t.label}</div>
              <div className="tabular mt-1 text-[26px] font-bold leading-none tracking-tight text-fg">{t.money ? usd(t.v) : t.v}</div>
              <div className="mt-1.5 flex items-center gap-1 truncate text-xs text-muted">
                {(up || down) && <Icon name={up ? 'trendUp' : 'trendDown'} size={13} className={up ? 'text-good' : 'text-bad'} />}
                <span className="truncate">{last.label.slice(0, 3)}: {t.money ? usd(t.prev) : t.prev}{t.sub ? ` · ${t.sub}` : ''}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActionPill({ kind }: { kind: SalesActionKind }) { return <Pill tone={ACTION[kind].tone}>{ACTION[kind].label}</Pill>; }
const flat = (x: string) => x.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\.[a-z]+\/?.*$/, '').replace(/[^a-z0-9]/g, '');
const who = (d: SalesDealLite) => {
  const company = d.company.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, '');
  const fc = flat(company), fl = flat(d.client);
  const client = d.client && (!fc || (!fl.includes(fc) && !fc.includes(fl))) ? d.client : '';
  return [company, client].filter(Boolean).join(' · ');
};

function ActionList({ rows }: { rows: SalesDealLite[] }) {
  if (!rows.length) return <Card><Empty icon="check" tone="good" title="Nothing needs action" sub="No call today, nothing unsigned, unpaid or waiting to onboard." /></Card>;
  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const top = r.needs[0];
          return (
            <li key={r.id}>
              <button onClick={() => go(`sales/${r.id}`)} className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-hover sm:px-5">
                <Avatar name={top.owner} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 break-words text-[15px] font-semibold leading-snug text-fg">{r.name}{who(r) && <span className="font-normal text-muted"> · {who(r)}</span>}</div>
                    <span className="shrink-0"><ActionPill kind={top.kind} /></span>
                  </div>
                  <div className="mt-0.5 text-sm leading-snug text-fg-2">{top.text}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="font-medium text-fg-2">{top.owner}</span>
                    <span>· {r.stageLabel}</span>
                    {r.monthly ? <span className="tabular">· {usd(r.monthly)}/mo</span> : null}
                    {r.needs.slice(1).map((x) => <ActionPill key={x.kind} kind={x.kind} />)}
                  </div>
                </div>
                <Icon name="chevronRight" size={18} className="mt-1 text-faint group-hover:text-muted" />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Pipeline({ p, days }: { p: SalesView['pipeline']; days: 30 | 90 }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const max = Math.max(1, p.stages[0]?.count ?? 1);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Period" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-sunken p-1">
          {([30, 90] as const).map((x) => (
            <button key={x} role="radio" aria-checked={days === x} onClick={() => go(`sales/pipeline${x === 90 ? '/90' : ''}`)}
              className={cx('min-h-9 rounded-lg px-4 text-sm font-semibold transition', days === x ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>{x} days</button>
          ))}
        </div>
        <div className="text-xs text-muted">{p.deals} deals since {day(p.from)}{p.canceled ? ` · ${p.canceled} canceled` : ''}{p.upcoming ? ` · ${p.upcoming} upcoming` : ''}</div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Rate label="Show rate" r={p.showRate} note="past calls, canceled left out" />
        <Rate label="Qualified" r={p.qualifiedRate} note="of the calls that showed" />
        <Rate label="Close rate" r={p.closeRate} note="of the calls that showed" />
      </div>
      <Card className="mt-3 overflow-hidden p-0">
        <ol className="divide-y divide-line">
          {p.stages.map((s) => {
            const isOpen = open[s.key] ?? (s.deals.length > 0 && s.deals.length <= 5);
            return (
              <li key={s.key}>
                <button onClick={() => setOpen({ ...open, [s.key]: !isOpen })} aria-expanded={isOpen} disabled={!s.deals.length}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition enabled:hover:bg-hover sm:px-5">
                  <span className="w-28 shrink-0 text-sm font-semibold text-fg sm:w-32">{s.label}</span>
                  <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true"><span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.round((s.count / max) * 100)}%` }} /></span>
                  <span className="tabular w-8 shrink-0 text-right text-[15px] font-bold text-fg">{s.count}</span>
                  <span className="w-20 shrink-0 text-right text-xs text-muted">{s.deals.length ? `${s.deals.length} here` : ''}</span>
                  <Icon name="chevronDown" size={16} className={cx('shrink-0 text-faint transition', !s.deals.length && 'invisible', isOpen && 'rotate-180')} />
                </button>
                {isOpen && s.deals.length > 0 && (
                  <ul className="mx-4 mb-3 space-y-1 sm:mx-5">
                    {s.deals.map((d) => (
                      <li key={d.id}>
                        <button onClick={() => go(`sales/${d.id}`)} className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-sunken px-3 py-2 text-left transition hover:bg-hover">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-fg">{d.name}{who(d) && <span className="font-normal text-muted"> · {who(d)}</span>}</div>
                            <div className="truncate text-xs text-muted">{[d.callDate ? `call ${day(d.callDate)}` : 'no call in Sales Data', d.airtableStage, d.lost ? 'lost' : ''].filter(Boolean).join(' · ')}</div>
                          </div>
                          {d.needs[0] && <ActionPill kind={d.needs[0].kind} />}
                          <Icon name="chevronRight" size={16} className="shrink-0 text-faint" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
      <p className="mt-2 text-xs text-muted">Each stage counts every deal that reached it. "Here" = deals whose furthest stage it is (tap to see them).</p>
    </div>
  );
}

function Rate({ label, r, note }: { label: string; r: { n: number; of: number; text: string }; note: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <div className="flex items-baseline justify-between gap-2"><span className="text-xs font-medium text-muted">{label}</span><span className="tabular text-lg font-bold text-fg">{r.n} of {r.of}</span></div>
      <div className="truncate text-xs text-muted">{r.text} · {note}</div>
    </div>
  );
}

/** Problem → Data → Fix → Why, one card each; folded after `fold`. */
function Notes({ notes, fold }: { notes: SalesNote[]; fold?: number }) {
  const [all, setAll] = useState(false);
  const shown = fold && !all ? notes.slice(0, fold) : notes;
  return (
    <>
      <ul className="space-y-2">
        {shown.map((n) => (
          <li key={n.problem} className="rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm leading-snug">
            <div className="flex items-start gap-2.5">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warn" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-semibold text-fg">{n.problem}</div>
                <div className="break-words text-fg-2"><span className="text-muted">Data: </span>{n.data}</div>
                <div className="break-words text-fg-2"><span className="text-muted">Fix: </span>{n.fix}</div>
                <div className="break-words text-muted">Why: {n.why}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {fold !== undefined && notes.length > fold && <button onClick={() => setAll(!all)} className="mt-1.5 min-h-9 text-sm font-semibold text-accent-ink hover:underline">{all ? 'Show fewer notes' : `Show ${notes.length - fold} more data note${notes.length - fold === 1 ? '' : 's'}`}</button>}
    </>
  );
}

// ---------- One deal ----------
function DealPage({ id }: { id: string }) {
  const [d, setD] = useState<SalesDetail | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<SalesDetail>(`/sales/${encodeURIComponent(id)}`).then(setD).catch((e) => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  const back = <BackLink label="Sales" onClick={() => (window.history.length > 1 ? window.history.back() : go('sales'))} />;
  if (error) return <>{back}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{back}<PageSkeleton kind="list" /></>;
  const x = d.deal;
  const company = x.company.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  const sign = d.links.agreements.find((a) => a.url);
  return (
    <div>
      {back}
      <Card className="sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-[24px] font-bold leading-tight tracking-tight sm:text-[26px]">{x.name}</h1>
            <div className="mt-1 break-words text-[15px] text-fg-2">{[company, x.email].filter(Boolean).join(' · ')}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <Pill tone={x.stage === 'onboarded' || x.stage === 'paid' || x.stage === 'signed' ? 'good' : 'info'}>{x.stageLabel}</Pill>
              {x.airtableStage && <Pill>Close: {x.airtableStage}</Pill>}
              {x.lost && <Pill tone="bad">Lost</Pill>}
              {x.inactiveClient && <Pill>Client inactive</Pill>}
              {x.money?.monthly ? <Pill tone="accent">{usd(x.money.monthly)}/mo{x.money.perCall ? ` + ${usd(x.money.perCall)}/call` : ''}</Pill> : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-wrap">
            <LinkButton href={d.links.close} icon="external">Close</LinkButton>
            <LinkButton href={d.links.airtable || d.links.agreements[0]?.airtable || ''} icon="database">Airtable</LinkButton>
            {sign && <LinkButton href={sign.url} icon="pen">{sign.tool}</LinkButton>}
            <LinkButton href={d.links.client} icon="briefcase">Client record</LinkButton>
          </div>
        </div>
        {x.needs.length > 0 && <ul className="mt-5 space-y-2">{x.needs.map((n) => <NeedLine key={n.kind} n={n} />)}</ul>}
        <div className="mt-6">
          <Label className="mb-2">Stages</Label>
          <ol aria-label="Stages" className="grid grid-cols-7 gap-1">
            {x.stageList.map((s) => (
              <li key={s.key} className="min-w-0" title={`${s.label}: ${s.done ? 'done' : 'not yet'}`}>
                <span className={cx('block h-2 rounded-full', s.done ? 'bg-accent' : s.key === nextStage(x.stageList) ? 'bg-accent/35 ring-1 ring-inset ring-accent' : 'bg-line')} />
                <span className={cx('mt-1 block truncate text-center text-[10px] sm:text-xs', s.done ? 'text-fg-2' : 'text-muted')}>{SHORT[s.key]}</span>
                <span className="sr-only">{s.done ? 'done' : 'not yet'}</span>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Calls" icon="clock">
          {d.calls.length ? (
            <ul className="divide-y divide-line">
              {d.calls.map((c, i) => (
                <li key={`${c.day}-${i}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="tabular w-16 shrink-0 text-xs text-muted">{day(c.day)}</span>
                  <span className="min-w-0 flex-1 text-[15px] text-fg">{c.what}</span>
                  {c.link && <ExtLink href={c.link} className="shrink-0 text-sm">Recording</ExtLink>}
                </li>
              ))}
            </ul>
          ) : <Quiet>No call stored in Sales Data for this deal.</Quiet>}
          <div className="border-t border-line px-5 py-3 text-xs text-muted">{[x.source && `Source: ${x.source}`, x.rep && `Rep: ${x.rep}`, x.campaign && `Campaign: ${x.campaign}`, x.bookedAt && `booked ${when(x.bookedAt)}`].filter(Boolean).join(' · ') || 'No booking details stored.'}</div>
        </Section>

        <Section title="Cole's review" icon="sparkles">
          {x.reviews.length ? (
            <ul className="divide-y divide-line">
              {x.reviews.map((r) => (
                <li key={r.id}>
                  <button onClick={() => go(`report/${r.id}`)} className="flex w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-hover">
                    <span className="tabular grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-[15px] font-bold text-accent-ink">{r.score ?? '?'}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium text-fg">{r.title}</span><span className="block text-sm text-fg-2">{r.summary}</span><span className="text-xs text-muted">{when(r.created)} · score and 3 fixes</span></span>
                    <Icon name="chevronRight" size={16} className="mt-1 text-faint" />
                  </button>
                </li>
              ))}
            </ul>
          ) : <Quiet>No call review from Cole for this deal yet{x.prep ? '' : ' (and no prep)'}.</Quiet>}
          {x.prep && <button onClick={() => go(`report/${x.prep!.id}`)} className="flex min-h-11 w-full items-center gap-2 border-t border-line px-5 text-sm font-semibold text-accent-ink hover:bg-hover">Cole's prep for the call<Icon name="chevronRight" size={15} /></button>}
        </Section>

        <Section title="Contract" icon="file">
          {x.agreements.length ? (
            <ul className="divide-y divide-line">
              {x.agreements.map((g) => {
                const link = d.links.agreements.find((l) => l.id === g.id);
                return (
                  <li key={g.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5"><span className="min-w-0 break-words text-[15px] font-medium text-fg">{g.title}</span><Pill tone={STATE_TONE[g.state]}>{STATE_LABEL[g.state]}</Pill><Pill>{g.tool}</Pill></div>
                    <div className="mt-1 text-xs text-muted">{[g.signer, g.review, g.sentAt && `sent ${when(g.sentAt)}`, g.viewedAt && `viewed ${when(g.viewedAt)}`, g.clientSignedAt && `client signed ${when(g.clientSignedAt)}`, g.signedAt && `signed ${when(g.signedAt)}`, g.monthly ? `${usd(g.monthly)}/mo` : ''].filter(Boolean).join(' · ')}</div>
                    {g.error && <div className="mt-1 break-words text-xs text-bad">{g.error}</div>}
                    <div className="mt-1.5 flex flex-wrap gap-3 text-sm">
                      {link?.url && <ExtLink href={link.url}>Open in {g.tool}</ExtLink>}
                      {link?.reviewDoc && <ExtLink href={link.reviewDoc}>Review document</ExtLink>}
                      {link?.airtable && <ExtLink href={link.airtable}>Airtable</ExtLink>}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <Quiet>No agreement yet (New Client Intake or Dulcy Sign).</Quiet>}
        </Section>

        <Section title="Payment and onboarding" icon="check">
          <ol className="divide-y divide-line">
            {d.onboarding.map((s) => (
              <li key={s.step} className="flex items-start gap-3 px-5 py-3">
                <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', s.done ? 'bg-good text-surface' : 'border border-line-strong')} aria-hidden="true">{s.done && <Icon name="check" size={12} strokeWidth={3} />}</span>
                <span className="min-w-0 flex-1"><span className="block text-[15px] text-fg">{s.step}<span className="sr-only">{s.done ? ': done' : ': not yet'}</span></span>{s.note && <span className="block break-words text-xs text-muted">{s.note}</span>}</span>
              </li>
            ))}
          </ol>
          {x.money?.paidTotal ? <div className="border-t border-line px-5 py-3 text-xs text-muted">Paid invoices since signing: <span className="tabular font-semibold text-fg-2">{usd(x.money.paidTotal)}</span></div> : null}
          {d.tasks.length > 0 && (
            <details className="border-t border-line">
              <summary className="flex min-h-11 cursor-pointer items-center px-5 text-sm font-semibold text-fg-2 hover:bg-hover">Client tasks ({d.tasks.length})</summary>
              <ul className="space-y-1 px-5 pb-3">{d.tasks.map((t) => <li key={t.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate text-fg-2">{t.task}</span><Pill tone={t.stage === 'Done' ? 'good' : t.stage === 'Blocked' ? 'bad' : 'plain'}>{t.stage}</Pill></li>)}</ul>
            </details>
          )}
        </Section>
      </div>

      <section className="mt-6">
        <SectionHeader title="Call feedback" icon="message" />
        <Card className="p-0">
          {x.feedback.length ? (
            <ul className="divide-y divide-line">
              {x.feedback.map((f, i) => (
                <li key={f.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm"><span className="tabular text-xs text-muted">{day(f.created)}</span>{f.status ? <Pill tone={/^qualified/i.test(f.status) ? 'good' : /no show|unqualified/i.test(f.status) ? 'warn' : 'plain'}>{f.status}</Pill> : <Pill tone="bad">No status</Pill>}{f.rating !== null && <span className="text-xs text-muted">rated {f.rating}/5</span>}{f.newDate && <span className="text-xs text-muted">new date {day(f.newDate)}</span>}<ExtLink href={d.links.feedback[i] ?? ''} className="ml-auto text-xs">Airtable</ExtLink></div>
                  {f.notes && <div className="mt-1 whitespace-pre-wrap break-words text-sm text-fg-2">{f.notes}</div>}
                </li>
              ))}
            </ul>
          ) : <Quiet>No Call Feedback row for this deal.</Quiet>}
        </Card>
      </section>

      {x.notes && <section className="mt-6"><SectionHeader title="Notes (Sales Data)" icon="pen" /><Card><div className="whitespace-pre-wrap break-words text-sm text-fg-2">{x.notes}</div></Card></section>}
      {d.notes.length > 0 && <section className="mt-6"><SectionHeader title="Data notes" icon="alert" /><Notes notes={d.notes} /></section>}
      <p className="mt-6 text-xs text-muted">Read {timeAgo(d.readAt) || 'just now'} from Airtable and Cole's reports; kept for 1 minute. Links only: send, sign and charge stay in Close, the signing tool and Fanbasis.</p>
    </div>
  );
}

const SHORT: Record<SalesStage, string> = { booked: 'Booked', showed: 'Showed', qualified: 'Qualified', sent: 'Sent', signed: 'Signed', paid: 'Paid', onboarded: 'Onboard' };
const nextStage = (xs: { key: SalesStage; done: boolean }[]) => xs.find((s) => !s.done)?.key;

function NeedLine({ n }: { n: SalesAction }) {
  const t = ACTION[n.kind].tone;
  return (
    <li className={cx('flex items-start gap-3 rounded-xl px-3.5 py-3 text-sm leading-snug', t === 'bad' ? 'bg-bad-soft' : t === 'warn' ? 'bg-warn-soft' : t === 'info' ? 'bg-info-soft' : 'bg-accent-soft')}>
      <Avatar name={n.owner} size="sm" />
      <div className="min-w-0 flex-1"><div className="font-semibold text-fg">{ACTION[n.kind].label} · {n.owner}</div><div className="text-fg-2">{n.text}</div></div>
      {n.link && <button onClick={() => go(n.link!)} className="shrink-0 self-center text-sm font-semibold text-accent-ink hover:underline">Open</button>}
    </li>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return <section className="min-w-0"><SectionHeader title={title} icon={icon} /><Card className="p-0">{children}</Card></section>;
}
const Quiet = ({ children }: { children: ReactNode }) => <div className="px-5 py-4 text-sm text-muted">{children}</div>;
function LinkButton({ href, icon, children }: { href: string; icon: string; children: ReactNode }) {
  if (!/^https:\/\//i.test(href)) return null;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg transition hover:bg-hover"><Icon name={icon} size={17} strokeWidth={2.1} /><span className="truncate">{children}</span></a>;
}
