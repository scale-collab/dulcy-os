// One campaign, as the Airtable Campaign Center's record panel. Round 4 (Alex 2026-11-28: "it could look
// easier, it's so elongated and spaced out"): one header, then a few tabs:
// Overview · Copy · Lead list · Senders · Plan · History.
// Round 5 (Alex 2026-11-28: "the campaign name and status look too small, too congested"): the header
// is big and clear: the name as a large title, client and status as clear pills, the key numbers in
// large tiles with room to breathe, the buttons in one tidy row under a line. Overview opens with
// Atlas's take (2-3 sentences from the numbers, his plan and his newest note; never invented).
// Pause acts at once; Launch (and every other press) asks one last time (RULES 2026-11-27).
// Copy: each email shown like an email (subject, body, then the signature the build adds), every
// version of it, and what EmailBison gets (the spintax sequence fields) behind a toggle.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type AtlasTakeR5, type CampaignAccountB3, type CampaignCenterR2, type CampaignDetailB3, type CopyR2 } from '../../api';
import { Avatar, BackLink, Card, cx, ErrorBox, go, Icon, PageSkeleton, Pill, StatusDot, timeAgo } from '../../ui';
import { Bar, NEED, Steps } from './bits';
import { PlanCard } from './Plans';
import { CampaignCenterSection } from './CenterParity';
import { CompactActions, num, rate, slash, slashTime, Tabs } from './shared';
import type { AutomationR2 } from '../../api';

type Tab = 'overview' | 'copy' | 'sequence' | 'settings' | 'list' | 'senders' | 'variants' | 'plan' | 'history' | 'more';
// Center parity (2026-11-28): Sequence, Settings, Variants and More are the Airtable Campaign Center's
// remaining tabs; Copy, Senders and Plan get the screen's edits and buttons below what they showed.
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'copy', label: 'Copy' }, { key: 'sequence', label: 'Sequence' }, { key: 'settings', label: 'Settings' }, { key: 'list', label: 'Lead list' },
  { key: 'senders', label: 'Senders' }, { key: 'variants', label: 'Variants' }, { key: 'plan', label: 'Plan' }, { key: 'history', label: 'History' }, { key: 'more', label: 'More' },
];
/** Old links (#/campaigns/<id>/strategy) open the Plan tab, where the strategy now lives. */
const tabOf = (t?: string): Tab => (t === 'strategy' ? 'plan' : TABS.some((x) => x.key === t) ? (t as Tab) : 'overview');
const ACC: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'idle' }> = { healthy: { label: 'Healthy', tone: 'good' }, risk: { label: 'At risk', tone: 'warn' }, spam: { label: 'Spam', tone: 'bad' }, resting: { label: 'Resting', tone: 'idle' } };

export function CampaignPage({ id, tab }: { id: string; tab?: string }) {
  const [d, setD] = useState<CampaignDetailB3 | null>(null);
  const [center, setCenter] = useState<CampaignCenterR2 | null>(null);
  const [error, setError] = useState('');
  const t = tabOf(tab);
  const load = useCallback(() => {
    setError('');
    api<CampaignDetailB3>(`/campaigns/${encodeURIComponent(id)}`).then(setD).catch((e) => setError(e.message));
    api<CampaignCenterR2>(`/campaigns/${encodeURIComponent(id)}/center`).then(setCenter).catch(() => setCenter(null));
  }, [id]);
  useEffect(load, [load]);
  // While the engine works on a press, look again every 15 seconds.
  useEffect(() => {
    if (!center?.automation.locked) return;
    const timer = window.setInterval(() => api<CampaignCenterR2>(`/campaigns/${encodeURIComponent(id)}/center`).then(setCenter).catch(() => undefined), 15_000);
    return () => window.clearInterval(timer);
  }, [center?.automation.locked, id]);
  const back = <BackLink label="Campaign Center" onClick={() => go(`campaigns${d?.campaign.clientKey ? `/all/${encodeURIComponent(d.campaign.clientKey)}` : ''}`)} />;
  if (error) return <>{back}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{back}<PageSkeleton kind="list" /></>;
  const c = d.campaign;
  const plan = center?.plan ?? null;
  return (
    <div>
      {back}
      <Card className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-[24px] font-bold leading-[1.15] tracking-tight text-fg sm:text-[32px]">{c.name}</h1>
          {d.links.bison && /^https:\/\//i.test(d.links.bison) && (
            <a href={d.links.bison} target="_blank" rel="noopener noreferrer" title="Open in EmailBison" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-fg-2 hover:bg-hover"><Icon name="external" size={16} /><span className="hidden sm:inline">EmailBison</span></a>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {c.client
            ? <button onClick={() => go(`clients/${c.clientRec}`)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[15px] font-semibold text-fg hover:bg-hover"><Icon name="users" size={15} className="text-muted" />{c.client}</button>
            : <span className="inline-flex min-h-9 items-center rounded-full bg-warn-soft px-3.5 text-[15px] font-semibold text-warn">No client link</span>}
          <BigStatus r={c} />
          {c.stage && c.stage !== 'Live' && <span className="inline-flex min-h-9 items-center rounded-full border border-line bg-sunken px-3.5 text-[15px] font-medium text-fg-2">{c.stage}</span>}
          {d.detail.skipBouncePause && <span className="inline-flex min-h-9 items-center rounded-full bg-warn-soft px-3.5 text-sm font-semibold text-warn">Skip Bounce Pause on</span>}
        </div>
        {(c.started || c.ended || (center && center.bison.length > 0)) && (
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {c.started && <span>Started {slash(c.started)}</span>}
            {c.ended && <span>Ended {slash(c.ended)}</span>}
            {center && center.bison.length > 0 && <span>EmailBison {center.bison.join(' + ')}</span>}
          </div>
        )}
        <Numbers c={c} />
        {center && center.actions.length > 0 && <div className="mt-5 border-t border-line pt-4"><CompactActions actions={center.actions} what={c.name} endpoint={`/campaigns/${id}/action`} onDone={load} /></div>}
        {center && <AutomationLine a={center.automation} />}
      </Card>

      <div className="mt-3"><Tabs label="Campaign" value={t} onChange={(k) => go(`campaigns/${id}${k === 'overview' ? '' : `/${k}`}`)} tabs={TABS.map((x) => (x.key === 'senders' ? { ...x, count: d.accounts.length } : x))} /></div>

      {t === 'overview' && (
        <div className="mt-3 space-y-3">
          {d.take && <AtlasTakeCard take={d.take} />}
          {c.needs.length > 0 && (
            <ul className="space-y-1.5">
              {c.needs.map((x) => (
                <li key={x.kind} className={cx('flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm leading-snug', NEED[x.kind].tone === 'bad' ? 'bg-bad-soft' : NEED[x.kind].tone === 'warn' ? 'bg-warn-soft' : NEED[x.kind].tone === 'info' ? 'bg-info-soft' : 'bg-accent-soft')}>
                  <Avatar name={x.agent} size="xs" />
                  <div className="min-w-0"><span className="font-semibold text-fg">{NEED[x.kind].label} · {x.agent}: </span><span className="text-fg-2">{x.text}</span></div>
                </li>
              ))}
            </ul>
          )}
          <Card className="p-4">
            <Steps steps={c.steps} />
            {c.now && <div className="mt-2 text-sm text-fg-2">Now: <span className="font-semibold">{c.now.label}</span>{c.now.note && <span className="text-muted"> · {c.now.note}</span>}</div>}
          </Card>
          {(plan || d.next) && (
            <button onClick={() => go(`campaigns/${id}/plan`)} className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-left text-sm hover:bg-hover">
              <span className="min-w-0 text-fg-2">{plan ? <>Atlas's plan #{plan.id}: <span className="font-medium text-fg">{plan.label}</span></> : <>Next campaign: plan #{d.next!.id}, <span className="font-medium text-fg">{d.next!.label}</span> (started {slash(d.next!.created)})</>}</span>
              <Icon name="chevronRight" size={16} className="shrink-0 text-muted" />
            </button>
          )}
        </div>
      )}

      {t === 'copy' && <CopyTab id={id} onDone={load} />}

      {t === 'list' && (
        <div className="mt-3 space-y-2">
          {!d.lists.length && <Card className="p-4"><div className="text-sm text-muted">No lead list linked to this campaign yet. Atlas links one when he plans a campaign; for a hand-made campaign link it on the Plan tab (Lead list).</div></Card>}
          {d.lists.map((l) => (
            <Card key={l.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="break-words text-[15px] font-semibold text-fg">{l.name}</div>
                  <div className="mt-0.5 text-sm text-muted">{[l.stage || 'no stage', l.qa ? `QA ${l.qa}` : '', l.leads ? `${num(l.leads)} leads` : '', l.engineStatus && `engine: ${l.engineStatus}`].filter(Boolean).join(' · ')}</div>
                  {l.message && <div className="mt-1 break-words text-sm text-fg-2">{l.message}</div>}
                </div>
                <button onClick={() => go(`campaigns/list/${l.id}`)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-semibold text-ink-fg shadow-card hover:bg-ink-hover"><Icon name="list" size={16} />Open the lead list</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {t === 'senders' && <Senders accounts={d.accounts} clientKey={c.clientKey} />}

      {t === 'plan' && (
        <div className="mt-3 space-y-3">
          {plan ? <PlanCard p={plan} onDone={load} /> : <Card className="p-4"><div className="text-sm text-muted">No Atlas plan on this campaign (it was made by hand or before Atlas planned campaigns).</div></Card>}
          <Card className="space-y-2 p-4 text-[15px] text-fg-2">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span><span className="text-muted">Strategy: </span>{d.detail.approach || 'UNKNOWN'}</span>
              {d.detail.launchDate && <span><span className="text-muted">Planned launch: </span>{slash(d.detail.launchDate)}</span>}
            </div>
            {d.detail.thesis ? <Clamp text={d.detail.thesis} /> : <p className="text-sm text-muted">No campaign thesis written yet.</p>}
          </Card>
          {d.next && <p className="text-sm text-fg-2">Next campaign: plan #{d.next.id}, <span className="font-medium">{d.next.label}</span> (started {slash(d.next.created)}).</p>}
        </div>
      )}

      {t === 'history' && <History d={d} />}
      {t === 'copy' && <CampaignCenterSection id={id} section="copy" onDone={load} />}
      {t === 'senders' && <CampaignCenterSection id={id} section="senders" onDone={load} />}
      {t === 'plan' && <CampaignCenterSection id={id} section="strategy" onDone={load} />}
      {(t === 'sequence' || t === 'settings' || t === 'variants' || t === 'more') && <CampaignCenterSection id={id} section={t} onDone={load} />}
      <p className="mt-4 text-xs text-muted">Read {timeAgo(d.readAt) || 'just now'} from Airtable and the engine; kept 1 minute. Buttons press the same engine steps as the Airtable Campaign Center.</p>
    </div>
  );
}

/** The status as a big, clear pill with its dot: Active (green; amber or red on a bounce flag), building (blue), finished (grey). */
function BigStatus({ r }: { r: { group: string; status: string; flag?: 'pause' | 'watch' | null } }) {
  const word = r.group === 'live' ? 'Active' : r.status || (r.group === 'building' ? 'Draft' : 'Done');
  const tone = r.group === 'live' ? (r.flag === 'pause' ? 'bad' : r.flag === 'watch' ? 'warn' : 'good') : r.group === 'building' ? 'info' : 'plain';
  const cls = { good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', info: 'bg-info-soft text-info', plain: 'border border-line bg-sunken text-fg-2' }[tone];
  const dot = { good: 'bg-dot-good', warn: 'bg-dot-warn', bad: 'bg-dot-bad', info: 'bg-info', plain: 'bg-dot-idle' }[tone];
  return (
    <span className={cx('inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-[15px] font-semibold', cls)}>
      <span aria-hidden="true" className={cx('h-2.5 w-2.5 rounded-full', dot)} />{word}
      {r.group === 'live' && r.flag && <span className="text-sm font-medium opacity-80">· bounce {r.flag === 'pause' ? 'over 4%' : 'watch'}</span>}
    </span>
  );
}

/** The key numbers: large tiles with room to breathe (2 across on the phone, 3 on a tablet, 6 on a computer). */
function Numbers({ c }: { c: CampaignDetailB3['campaign'] }) {
  const used = Math.round(c.progress * 100);
  const items: { label: string; v: string; sub?: string; tone?: string; bar?: number }[] = [
    { label: 'Sent', v: num(c.sent), sub: c.contacted ? `to ${num(c.contacted)} leads` : undefined },
    { label: 'Replies', v: num(c.replies), sub: c.contacted ? `${rate(c.replies, c.contacted)} of leads` : undefined },
    { label: 'Interested', v: num(c.interested), sub: c.replies ? `${rate(c.interested, c.replies)} of replies` : undefined },
    { label: 'Meetings', v: num(c.booked), sub: c.interested ? `${rate(c.booked, c.interested)} of interested` : undefined },
    // The limits (RULES.md): over 2.5% = watch, over 4% = pause. A finished campaign keeps its colour, without the action.
    { label: 'Bounce', v: `${c.bounce}%`, sub: !c.sent ? undefined : c.bounce > 4 ? (c.group === 'live' ? 'over 4%: pause' : 'over 4%') : c.bounce > 2.5 ? (c.group === 'live' ? 'over 2.5%: watch' : 'over 2.5%') : 'under 2.5%', tone: c.bounce > 4 ? 'text-bad' : c.bounce > 2.5 ? 'text-warn' : undefined },
    { label: 'Leads used', v: `${used}%`, sub: c.totalLeads ? `${num(c.contacted)} of ${num(c.totalLeads)}` : undefined, bar: c.progress },
  ];
  return (
    <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((x) => (
        <div key={x.label} className="min-w-0 rounded-2xl border border-line bg-sunken px-4 py-3.5">
          <dt className="truncate text-[13px] font-medium text-muted">{x.label}</dt>
          <dd className={cx('tabular mt-1 truncate text-[28px] font-bold leading-none tracking-tight text-fg sm:text-[30px]', x.tone)}>{x.v}</dd>
          {x.bar !== undefined && <div className="mt-2.5"><Bar v={x.bar} /></div>}
          {x.sub && <dd className="mt-1.5 truncate text-[13px] text-muted">{x.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Atlas's take: 2-3 sentences on how the campaign is doing (rule-based, from its own numbers; never invented). */
function AtlasTakeCard({ take }: { take: AtlasTakeR5 }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar name="Atlas" size="md" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg">Atlas's take</div>
          <p className="mt-1 text-[15px] leading-6 text-fg-2">{take.text}</p>
          <p className="mt-1.5 text-xs text-muted">{take.source}</p>
        </div>
      </div>
    </Card>
  );
}

/** What the engine is doing, in one line; nothing when it is idle with nothing to say. */
function AutomationLine({ a }: { a: AutomationR2 }) {
  const [more, setMore] = useState(false);
  const st = a.engineAction ? 'Pressed' : a.engineStatus || a.processing || '';
  const msg = a.engineAction ? `${a.engineAction}: sent to the engine, it starts within about 30 seconds.` : a.engineMessage || a.workflowMessage || '';
  const extra = [a.error, a.topupStatus ? `Top-up: ${a.topupStatus}${a.topupMessage ? ` · ${a.topupMessage}` : ''}` : ''].filter(Boolean).join('\n');
  if (!st && !msg && !extra) return null;
  const tone = /fail|needs review/i.test(st) || a.error ? 'bad' : /done|completed/i.test(st) ? 'good' : /queued|running|waiting|pressed/i.test(st) ? 'info' : 'plain';
  const text = [msg, extra].filter(Boolean).join('\n');
  return (
    <div className={cx('mt-2.5 flex items-start gap-2 text-sm', tone === 'bad' ? 'text-bad' : 'text-fg-2')}>
      <Icon name={tone === 'info' ? 'refresh' : tone === 'bad' ? 'alert' : 'activity'} size={15} className={cx('mt-0.5 shrink-0 text-muted', tone === 'info' && 'animate-spin', tone === 'bad' && 'text-bad')} />
      <div className="min-w-0">
        <span className="font-semibold text-fg">Engine:</span> {st && <Pill tone={tone as 'bad' | 'good' | 'info' | 'plain'}>{st}</Pill>}{' '}
        {text && <span className={cx('break-words', !more && 'line-clamp-1')}>{text}</span>}
        {text.length > 90 && <button onClick={() => setMore(!more)} className="ml-1 text-xs font-semibold text-accent-ink hover:underline">{more ? 'less' : 'more'}</button>}
      </div>
    </div>
  );
}

function Clamp({ text, lines = 6 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.split('\n').length > lines || text.length > 600;
  return (
    <div>
      <p className={cx('whitespace-pre-line text-sm leading-6', !open && long && 'line-clamp-6')}>{text}</p>
      {long && <button onClick={() => setOpen(!open)} className="mt-1 text-sm font-semibold text-accent-ink hover:underline">{open ? 'Show less' : 'Show all'}</button>}
    </div>
  );
}

/* ---------- Senders ---------- */
function Senders({ accounts, clientKey }: { accounts: CampaignAccountB3[]; clientKey: string }) {
  const tested = accounts.filter((a) => a.score !== null).length;
  return (
    <section className="mt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-fg-2"><span className="font-semibold text-fg">{accounts.length} sending inbox{accounts.length === 1 ? '' : 'es'}</span>{accounts.length > 0 && <span className="text-muted"> · {tested} with a placement score</span>}</span>
        <button onClick={() => go(`deliverability/inboxes/${clientKey || 'all'}`)} className="min-h-8 text-sm font-semibold text-accent-ink hover:underline">Deliverability</button>
      </div>
      <Card className="p-0">
        {!accounts.length ? <div className="px-4 py-3 text-sm text-muted">No sending inboxes on this campaign. Pick them below (Pick sending inboxes).</div> : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {accounts.map((a) => {
                const st = a.status ? ACC[a.status] : null;
                return (
                  <li key={a.id} className="flex items-start gap-2.5 px-4 py-2">
                    <StatusDot tone={a.warmupOff ? 'bad' : st?.tone ?? 'idle'} className="mt-1.5" label={st?.label ?? 'Unknown'} />
                    <div className="min-w-0 flex-1">
                      <div className="break-all text-sm font-medium text-fg">{a.email || 'Inbox not found in Email Accounts'}</div>
                      <div className="text-xs text-muted">{[st?.label, a.warmupOff ? 'warm-up OFF' : '', a.dailyLimit !== null ? `${a.dailyLimit} cold/day` : '', a.warmup !== null ? `warm-up ${a.warmup}` : '', `placement ${placementText(a)}`].filter(Boolean).join(' · ')}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-sunken text-xs text-muted"><tr>
                  <th className="px-4 py-2 font-medium">Inbox</th><th className="px-3 py-2 font-medium">Health</th><th className="px-3 py-2 text-right font-medium">Cold / day</th><th className="px-3 py-2 text-right font-medium">Warm-up / day</th>
                  <th className="px-3 py-2 text-right font-medium">Warm-up score</th><th className="px-4 py-2 font-medium">Placement</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {accounts.map((a) => {
                    const st = a.status ? ACC[a.status] : null;
                    return (
                      <tr key={a.id} className="align-top">
                        <td className="px-4 py-1.5 font-medium text-fg">{a.email || <span className="text-muted">Inbox not found in Email Accounts</span>}</td>
                        <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1.5"><StatusDot tone={a.warmupOff ? 'bad' : st?.tone ?? 'idle'} label={st?.label ?? 'Unknown'} /><span className="text-fg-2">{st?.label ?? 'Unknown'}{a.warmupOff && <span className="text-bad"> · warm-up OFF</span>}</span></span></td>
                        <td className="tabular px-3 py-1.5 text-right">{a.dailyLimit ?? '–'}</td><td className="tabular px-3 py-1.5 text-right">{a.warmupLimit ?? '–'}</td>
                        <td className="tabular px-3 py-1.5 text-right">{a.warmup ?? '–'}</td>
                        <td className="px-4 py-1.5"><span className={cx('tabular', a.score === null && 'text-muted')}>{placementText(a)}</span>{a.placement?.why && a.score === null && <div className="text-xs text-muted">{a.placement.why}</div>}{a.placement?.why && a.score !== null && /^Not in/.test(a.placement.why) && <div className="text-xs text-muted">{a.placement.why}</div>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
const placementText = (a: CampaignAccountB3) => a.placement?.text ?? (a.score !== null ? `${a.score}%` : 'Not tested');

/* ---------- Copy ---------- */
/** "{FIRST_NAME}" style variables (EmailBison merge tags). */
const VAR = /^[A-Z][A-Z0-9_]*$/;
/** Split at top-level "|" (spintax options), keeping nested braces whole. */
function options(inner: string): string[] {
  const out: string[] = []; let depth = 0; let cur = '';
  for (const ch of inner) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === '|' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}
/**
 * Copy as the reader sees it: a merge tag shows as itself ({FIRST_NAME}, never escaped), a spintax
 * group shows its first option (dotted underline; hover or tap-and-hold lists every option). Text only:
 * React escapes everything.
 */
export function CopyText({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let i = 0; let buf = ''; let k = 0;
  const flush = () => { if (buf) { parts.push(buf); buf = ''; } };
  while (i < text.length) {
    if (text[i] === '{') {
      let depth = 0; let j = i;
      for (; j < text.length; j++) { if (text[j] === '{') depth++; else if (text[j] === '}') { depth--; if (depth === 0) break; } }
      if (j < text.length) {
        const inner = text.slice(i + 1, j);
        const opts = options(inner);
        flush();
        if (opts.length > 1) parts.push(<span key={k++} title={`Rotates: ${opts.join(' / ')}`} className="underline decoration-dotted decoration-accent/60 underline-offset-4"><CopyText text={opts[0]} /></span>);
        else if (VAR.test(inner.trim())) parts.push(<span key={k++} className="whitespace-nowrap rounded bg-accent-soft px-1 font-mono text-[0.86em] text-accent-ink">{`{${inner.trim()}}`}</span>);
        else parts.push(<span key={k++}>{'{'}<CopyText text={inner} />{'}'}</span>);
        i = j + 1; continue;
      }
    }
    buf += text[i]; i++;
  }
  flush();
  return <>{parts}</>;
}

function CopyTab({ id, onDone }: { id: string; onDone: () => void }) {
  const [d, setD] = useState<CopyR2 | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<CopyR2>(`/campaigns/${encodeURIComponent(id)}/copy`).then(setD).catch((e) => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  if (error) return <div className="mt-3"><ErrorBox error={error} retry={load} /></div>;
  if (!d) return <div className="mt-3"><PageSkeleton kind="list" /></div>;
  const ap = d.approval;
  const firstSubject = d.review.find((x) => x.step === 1)?.subject ?? '';
  const hasNotes = d.scribe && (d.scribe.notes || d.scribe.flagged.length > 0 || d.scribe.questions.length > 0 || d.scribe.variables.length > 0 || d.scribe.claims.length > 0);
  return (
    <div className="mt-3 space-y-3">
      {d.plan && <PlanCard p={d.plan} onDone={() => { load(); onDone(); }} compact />}
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-semibold text-fg">Approval</span>
        {d.stage && <Pill>{d.stage}</Pill>}
        {ap.source ? <Pill tone="good">{ap.source}</Pill> : ap.exception ? <Pill tone="warn">Client approval exception</Pill> : <Pill>Not approved yet</Pill>}
        {ap.submittedAt && <span className="text-muted">sent to the client {slash(ap.submittedAt)}</span>}
        {ap.autoApproveAt && <span className="text-muted">· auto-approves {slashTime(ap.autoApproveAt)}</span>}
      </div>
      {(ap.clientFeedback || ap.feedback || ap.context) && (
        <div className="rounded-xl bg-sunken p-3 text-sm leading-6 text-fg-2">
          {ap.clientFeedback && <div><span className="font-medium">Client: </span>{ap.clientFeedback}{ap.changeArea ? ` (${ap.changeArea})` : ''}</div>}
          {ap.feedback && <div className="whitespace-pre-wrap">{ap.feedback}</div>}
          {ap.context && <div className="whitespace-pre-wrap text-muted">{ap.context}</div>}
        </div>
      )}
      {d.comesNext.length > 0 && <p className="text-xs text-muted">Hand-made campaign: {d.comesNext.map((x) => x.label).join(' and ')} come next in HQ (Campaign Center for now).</p>}
      {!d.review.length ? <Card className="p-4"><div className="text-sm text-muted">No copy yet.{d.plan ? ' Scribe writes it after approval 1.' : ''}</div></Card>
        : d.review.map((x) => <EmailCard key={x.step} x={x} firstSubject={firstSubject} />)}
      {hasNotes && d.scribe && (
        <details className="rounded-2xl border border-line bg-surface p-4 text-sm text-fg-2 shadow-card">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-fg"><Avatar name="Scribe" size="xs" />Scribe's notes{(d.scribe.flagged.length + d.scribe.questions.length) > 0 && <Pill tone="warn">{d.scribe.flagged.length + d.scribe.questions.length} open</Pill>}</summary>
          {d.scribe.notes && <p className="mt-2 whitespace-pre-wrap leading-6">{d.scribe.notes}</p>}
          {d.scribe.flagged.length > 0 && <p className="mt-2 text-warn">Still flagged: {d.scribe.flagged.join(' · ')}</p>}
          {d.scribe.questions.length > 0 && <p className="mt-2 text-warn">Questions for you: {d.scribe.questions.join(' · ')}</p>}
          {d.scribe.variables.length > 0 && <p className="mt-2">Custom variables: {d.scribe.variables.map((v) => `{${v.name}} (${v.find}; fallback "${v.fallback}")`).join(' · ')}</p>}
          {d.scribe.claims.length > 0 && <ul className="mt-2 space-y-1">{d.scribe.claims.map((c, i) => <li key={i}><span className="text-fg">{c.claim}</span> <span className={cx(/UNKNOWN/.test(c.source) ? 'text-bad' : 'text-muted')}>· {c.source}</span></li>)}</ul>}
        </details>
      )}
    </div>
  );
}

function EmailCard({ x, firstSubject }: { x: CopyR2['review'][number]; firstSubject: string }) {
  const versions = x.versions?.length ? x.versions : [{ version: 1, body: x.body, signature: '' }];
  const [v, setV] = useState(0);
  const [built, setBuilt] = useState(false);
  const cur = versions[Math.min(v, versions.length - 1)];
  const subject = x.thread ? `Re: ${firstSubject || x.subject}` : x.subject;
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <span className="text-sm font-semibold text-fg">Email {x.step}{x.step > 1 && <span className="ml-1.5 text-xs font-normal text-muted">{x.thread ? 'reply in the same thread' : 'new thread'}</span>}</span>
        {versions.length > 1 && (
          <div role="tablist" aria-label={`Email ${x.step} versions`} className="flex gap-0.5 rounded-lg bg-sunken p-0.5">
            {versions.map((y, i) => (
              <button key={i} role="tab" aria-selected={v === i} onClick={() => setV(i)} className={cx('min-h-8 rounded-md px-2.5 text-xs font-semibold', v === i ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>Version {y.version || i + 1}</button>
            ))}
          </div>
        )}
      </div>
      <div className="px-4 py-3">
        <div className="text-sm"><span className="text-muted">Subject: </span><span className="font-semibold text-fg">{subject ? <CopyText text={subject} /> : <span className="font-normal text-muted">none</span>}</span></div>
        <div className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-6 text-fg-2">{cur.body ? <CopyText text={cur.body} /> : <span className="text-muted">No body.</span>}</div>
        {/* The signature is not stored with the copy: the campaign build adds it (see centerActions.signatureFor). */}
        {cur.signature
          ? <div className="mt-3 whitespace-pre-wrap break-words border-t border-dashed border-line pt-2 text-[14px] leading-6 text-muted"><CopyText text={cur.signature} /></div>
          : <div className="mt-3 border-t border-dashed border-line pt-2 text-xs text-muted">Signature: already in the email above.</div>}
      </div>
      {x.built?.length > 0 && (
        <div className="border-t border-line px-4 py-2">
          <button onClick={() => setBuilt(!built)} aria-expanded={built} className="min-h-8 text-xs font-semibold text-accent-ink hover:underline">{built ? 'Hide' : 'Show'} what EmailBison gets ({x.built.length} with spintax)</button>
          {built && (
            <div className="mt-2 space-y-2 pb-1">
              {x.built.map((b) => (
                <div key={b.variant} className="rounded-xl bg-sunken p-3 text-sm">
                  <div className="text-xs font-semibold text-muted">Version {b.variant}{b.subject && <> · Subject: <span className="font-medium text-fg-2">{b.subject}</span></>}</div>
                  <div className="mt-1 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-5 text-fg-2">{b.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------- History ---------- */
function History({ d }: { d: CampaignDetailB3 }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-3 space-y-4">
      <section>
        <h2 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-fg"><Icon name="history" size={15} className="text-muted" />Stage history <span className="text-xs font-normal text-muted">engine</span></h2>
        <Card className="p-0">
          {d.history.length ? (
            <ol className="divide-y divide-line">
              {d.history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex gap-3 px-4 py-2">
                  <span className="tabular w-24 shrink-0 text-xs text-muted sm:w-28">{slashTime(h.at)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm text-fg">{h.what}<Pill tone={h.status === 'failed' ? 'bad' : h.status === 'succeeded' || h.status === 'live' ? 'good' : 'plain'}>{h.status}</Pill>{h.dryRun && <Pill>dry run</Pill>}</div>
                    {h.message && <div className="mt-0.5 break-words text-xs text-muted">{h.message}</div>}
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className="px-4 py-3 text-sm text-muted">No engine steps on this campaign yet (it may have been built before the engine).</div>}
        </Card>
      </section>
      <section>
        <h2 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-fg"><Icon name="activity" size={15} className="text-muted" />Activity log <span className="text-xs font-normal text-muted">newest first</span></h2>
        <Card className="p-0">
          {!d.activity.length && <div className="px-4 py-3 text-sm text-muted">Nothing logged yet for this campaign or its lead list.</div>}
          <ol className="divide-y divide-line">
            {d.activity.slice(0, 60).map((r) => (
              <li key={r.id}>
                <button onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} disabled={!r.details} className="flex w-full items-start gap-3 px-4 py-2 text-left transition enabled:hover:bg-hover">
                  <span className="tabular w-24 shrink-0 text-xs text-muted sm:w-28">{slashTime(r.when)}</span>
                  <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium text-fg">{r.event}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1"><Pill tone="accent">{r.agent}</Pill>{r.type && <Pill>{r.type}</Pill>}{r.on === 'list' && <Pill>lead list</Pill>}</span></span>
                </button>
                {open === r.id && r.details && <div className="mx-4 mb-2 whitespace-pre-wrap break-words rounded-lg bg-sunken p-3 text-xs leading-5 text-fg-2">{r.details}</div>}
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </div>
  );
}
