// One campaign, as the Airtable Campaign Center's record panel (Round 2, 2026-11-27): the buttons
// (Build, Launch, Pause, Update senders, Top up; Clone / Sync / Delete come next), Automation status,
// and tabs Overview · Strategy · Copy · Lead list · Senders · History. The copy tab shows the copy
// Alex and the client read and, for a campaign Atlas planned, approve / reject / rewrite with notes.
import { useCallback, useEffect, useState } from 'react';
import { api, type CampaignCenterR2, type CampaignDetailB3, type CopyR2 } from '../../api';
import { Avatar, BackLink, Card, cx, ErrorBox, go, Icon, Label, PageSkeleton, Pill, SectionHeader, StatusDot, timeAgo } from '../../ui';
import { NEED, StatusPill, Steps } from './bits';
import { PlanCard } from './Plans';
import { ActionBar, AutomationStatus, num, rate, slash, slashTime, Stat, Tabs } from './shared';

type Tab = 'overview' | 'strategy' | 'copy' | 'list' | 'senders' | 'history';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'strategy', label: 'Strategy' }, { key: 'copy', label: 'Copy' }, { key: 'list', label: 'Lead list' }, { key: 'senders', label: 'Senders' }, { key: 'history', label: 'History' },
];
const isTab = (t?: string): t is Tab => TABS.some((x) => x.key === t);
const ACC: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'idle' }> = { healthy: { label: 'Healthy', tone: 'good' }, risk: { label: 'At risk', tone: 'warn' }, spam: { label: 'Spam', tone: 'bad' }, resting: { label: 'Resting', tone: 'idle' } };

export function CampaignPage({ id, tab }: { id: string; tab?: string }) {
  const [d, setD] = useState<CampaignDetailB3 | null>(null);
  const [center, setCenter] = useState<CampaignCenterR2 | null>(null);
  const [error, setError] = useState('');
  const t: Tab = isTab(tab) ? tab : 'overview';
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
  return (
    <div>
      {back}
      <Card className="sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-[24px] font-bold leading-tight tracking-tight sm:text-[26px]">{c.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
              {c.client ? <button onClick={() => go(`clients/${c.clientRec}`)} className="min-h-8 font-medium text-accent-ink hover:underline">{c.client}</button> : <span className="text-warn">No client link</span>}
              <StatusPill r={c} />
              {c.stage && <Pill>{c.stage}</Pill>}
              {d.detail.skipBouncePause && <Pill tone="warn">Skip Bounce Pause on</Pill>}
              {center && center.bison.length > 0 && <span className="text-xs">EmailBison {center.bison.join(' + ')}</span>}
            </div>
          </div>
          {d.links.bison && /^https:\/\//i.test(d.links.bison) && (
            <a href={d.links.bison} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg transition hover:bg-hover"><Icon name="external" size={17} strokeWidth={2.1} />Open in EmailBison</a>
          )}
        </div>
        {center && <ActionBar className="mt-5" actions={center.actions} what={c.name} endpoint={`/campaigns/${id}/action`} onDone={load} />}
        {center && <AutomationStatus a={center.automation} className="mt-4" />}
      </Card>

      <div className="mt-5"><Tabs label="Campaign" value={t} onChange={(k) => go(`campaigns/${id}${k === 'overview' ? '' : `/${k}`}`)} tabs={TABS} /></div>

      {t === 'overview' && (
        <div className="mt-4">
          {c.needs.length > 0 && (
            <ul className="mb-4 space-y-2">
              {c.needs.map((x) => (
                <li key={x.kind} className={cx('flex items-start gap-3 rounded-xl px-3.5 py-3 text-sm leading-snug', NEED[x.kind].tone === 'bad' ? 'bg-bad-soft' : NEED[x.kind].tone === 'warn' ? 'bg-warn-soft' : NEED[x.kind].tone === 'info' ? 'bg-info-soft' : 'bg-accent-soft')}>
                  <Avatar name={x.agent} size="sm" />
                  <div className="min-w-0"><div className="font-semibold text-fg">{NEED[x.kind].label} · {x.agent}</div><div className="text-fg-2">{x.text}</div></div>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Sent" v={num(c.sent)} />
            <Stat label="Replies" v={num(c.replies)} sub={rate(c.replies, c.contacted)} />
            <Stat label="Interested" v={num(c.interested)} sub={c.replies ? `${rate(c.interested, c.replies)} of replies` : undefined} />
            <Stat label="Meetings" v={num(c.booked)} sub={c.interested ? `${rate(c.booked, c.interested)} of interested` : undefined} />
            <Stat label="Bounce" v={`${c.bounce}%`} tone={c.flag === 'pause' ? 'bad' : c.flag === 'watch' ? 'warn' : undefined} sub={c.flag === 'pause' ? 'over 4%' : c.flag === 'watch' ? 'over 2.5%: watch' : undefined} />
            <Stat label="Leads used" v={`${Math.round(c.progress * 100)}%`} sub={c.totalLeads ? `${num(c.contacted)} of ${num(c.totalLeads)}` : undefined} />
          </div>
          <Card className="mt-4">
            <Label className="mb-2">Steps</Label>
            <Steps steps={c.steps} />
            {c.now && <div className="mt-2 text-sm text-fg-2">Now: <span className="font-semibold">{c.now.label}</span>{c.now.note && <span className="text-muted"> · {c.now.note}</span>}</div>}
          </Card>
          {center?.plan && <div className="mt-4"><SectionHeader title="Campaign plan" icon="target" /><PlanCard p={center.plan} onDone={load} /></div>}
          {d.next && <p className="mt-3 text-sm text-fg-2">Next campaign: plan #{d.next.id}, <span className="font-medium">{d.next.label}</span> (started {slash(d.next.created)}).</p>}
        </div>
      )}

      {t === 'strategy' && (
        <Card className="mt-4 space-y-3 text-[15px] text-fg-2">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span><span className="text-muted">Approach: </span>{d.detail.approach || 'UNKNOWN'}</span>
            {d.detail.launchDate && <span><span className="text-muted">Planned launch: </span>{slash(d.detail.launchDate)}</span>}
          </div>
          {d.detail.thesis ? <p className="whitespace-pre-line leading-relaxed">{d.detail.thesis}</p> : <p className="text-muted">No campaign thesis written yet.</p>}
        </Card>
      )}

      {t === 'copy' && <CopyTab id={id} onDone={load} />}

      {t === 'list' && (
        <div className="mt-4 space-y-3">
          {!d.lists.length && <Card><div className="text-sm text-muted">No lead list linked to this campaign yet. Atlas links one when he plans a campaign; for a hand-made campaign link it in Campaign Center (comes next in HQ).</div></Card>}
          {d.lists.map((l) => (
            <Card key={l.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="break-words text-[15px] font-semibold text-fg">{l.name}</div>
                  <div className="mt-0.5 text-sm text-muted">{[l.stage || 'no stage', l.qa ? `QA ${l.qa}` : '', l.leads ? `${num(l.leads)} leads` : '', l.engineStatus && `engine: ${l.engineStatus}`].filter(Boolean).join(' · ')}</div>
                  {l.message && <div className="mt-1 break-words text-sm text-fg-2">{l.message}</div>}
                </div>
                <button onClick={() => go(`campaigns/list/${l.id}`)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[15px] font-semibold text-ink-fg shadow-card hover:bg-ink-hover"><Icon name="list" size={17} />Open the lead list</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {t === 'senders' && (
        <section className="mt-4">
          <SectionHeader title={`Sending inboxes (${d.accounts.length})`} icon="mail" right={<button onClick={() => go(`deliverability/inboxes/${c.clientKey || 'all'}`)} className="min-h-9 text-sm font-semibold text-accent-ink hover:underline">Deliverability</button>} />
          <Card className="p-0">
            {!d.accounts.length ? <div className="px-5 py-4 text-sm text-muted">No sending inboxes on this campaign. The client's free inboxes are in the Sending accounts box on the Campaign Center; picking them comes next in HQ.</div> : (
              <ul className="divide-y divide-line">
                {d.accounts.map((a) => {
                  const st = a.status ? ACC[a.status] : null;
                  return (
                    <li key={a.id} className="flex items-start gap-2.5 px-4 py-2.5 sm:px-5">
                      <StatusDot tone={a.warmupOff ? 'bad' : st?.tone ?? 'idle'} className="mt-1.5" label={st?.label ?? 'Unknown'} />
                      <div className="min-w-0 flex-1">
                        <div className="break-all text-sm font-medium text-fg">{a.email || 'Inbox not found in Email Accounts'}</div>
                        <div className="text-xs text-muted">{[st?.label, a.warmupOff ? 'warm-up OFF' : '', a.dailyLimit !== null ? `${a.dailyLimit} cold/day` : '', a.warmupLimit !== null ? `${a.warmupLimit} warm-up/day` : '', a.warmup !== null ? `warm-up score ${a.warmup}` : '', a.score !== null ? `placement ${a.score}%` : ''].filter(Boolean).join(' · ')}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      )}

      {t === 'history' && <History d={d} />}
      <p className="mt-6 text-xs text-muted">Read {timeAgo(d.readAt) || 'just now'} from Airtable and the engine; kept 1 minute. Buttons press the same engine steps as the Airtable Campaign Center.</p>
    </div>
  );
}

function CopyTab({ id, onDone }: { id: string; onDone: () => void }) {
  const [d, setD] = useState<CopyR2 | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<CopyR2>(`/campaigns/${encodeURIComponent(id)}/copy`).then(setD).catch((e) => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  if (error) return <div className="mt-4"><ErrorBox error={error} retry={load} /></div>;
  if (!d) return <div className="mt-4"><PageSkeleton kind="list" /></div>;
  const ap = d.approval;
  return (
    <div className="mt-4 space-y-4">
      {d.plan && <PlanCard p={d.plan} onDone={() => { load(); onDone(); }} compact />}
      {d.comesNext.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-fg">Copy buttons for a hand-made campaign</div>
          <ul className="mt-2 space-y-1.5 text-sm text-fg-2">{d.comesNext.map((x) => <li key={x.key}><Pill>{x.label}</Pill> <span className="text-muted">{x.why}</span></li>)}</ul>
        </Card>
      )}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-fg">Approval</span>
          {d.stage && <Pill>{d.stage}</Pill>}
          {ap.source ? <Pill tone="good">{ap.source}</Pill> : ap.exception ? <Pill tone="warn">Client approval exception</Pill> : <Pill>Not approved yet</Pill>}
          {ap.submittedAt && <span className="text-muted">sent to the client {slash(ap.submittedAt)}</span>}
          {ap.autoApproveAt && <span className="text-muted">· auto-approves {slashTime(ap.autoApproveAt)}</span>}
        </div>
        {(ap.clientFeedback || ap.feedback || ap.context) && (
          <div className="mt-2 rounded-xl bg-sunken p-3 text-sm leading-6 text-fg-2">
            {ap.clientFeedback && <div><span className="font-medium">Client: </span>{ap.clientFeedback}{ap.changeArea ? ` (${ap.changeArea})` : ''}</div>}
            {ap.feedback && <div className="whitespace-pre-wrap">{ap.feedback}</div>}
            {ap.context && <div className="whitespace-pre-wrap text-muted">{ap.context}</div>}
          </div>
        )}
      </Card>
      {d.scribe && (d.scribe.notes || d.scribe.flagged.length > 0 || d.scribe.questions.length > 0 || d.scribe.variables.length > 0) && (
        <Card className="p-4 text-sm text-fg-2">
          <div className="flex items-center gap-2 font-semibold text-fg"><Avatar name="Scribe" size="xs" />Scribe's notes</div>
          {d.scribe.notes && <p className="mt-2 whitespace-pre-wrap leading-6">{d.scribe.notes}</p>}
          {d.scribe.flagged.length > 0 && <p className="mt-2 text-warn">Still flagged: {d.scribe.flagged.join(' · ')}</p>}
          {d.scribe.questions.length > 0 && <p className="mt-2 text-warn">Questions for you: {d.scribe.questions.join(' · ')}</p>}
          {d.scribe.variables.length > 0 && <p className="mt-2">Custom variables: {d.scribe.variables.map((v) => `{${v.name}} (${v.find}; fallback "${v.fallback}")`).join(' · ')}</p>}
          {d.scribe.claims.length > 0 && (
            <details className="mt-2"><summary className="cursor-pointer font-medium text-accent-ink">Every claim and its source ({d.scribe.claims.length})</summary>
              <ul className="mt-1.5 space-y-1">{d.scribe.claims.map((c, i) => <li key={i}><span className="text-fg">{c.claim}</span> <span className={cx(/UNKNOWN/.test(c.source) ? 'text-bad' : 'text-muted')}>· {c.source}</span></li>)}</ul>
            </details>
          )}
        </Card>
      )}
      <section>
        <SectionHeader title="Copy for review (what Alex and the client read)" icon="pen" />
        {!d.review.length ? <Card><div className="text-sm text-muted">No review copy yet.{d.plan ? ' Scribe writes it after approval 1.' : ''}</div></Card> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {d.review.map((x) => (
              <Card key={x.step} className="p-4">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-fg">Email {x.step}</span>{x.thread && <Pill>reply in the same thread</Pill>}</div>
                {x.subject && <div className="mt-2 text-sm"><span className="text-muted">Subject: </span><span className="font-medium text-fg">{x.subject}</span></div>}
                <div className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-6 text-fg-2">{x.body || <span className="text-muted">No body.</span>}</div>
              </Card>
            ))}
          </div>
        )}
      </section>
      {d.sequence.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <summary className="cursor-pointer text-sm font-semibold text-fg">Sequence fields the build uses ({d.sequence.length})</summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {d.sequence.map((x) => (
              <div key={`${x.step}-${x.variant}`} className="rounded-xl bg-sunken p-3 text-sm">
                <div className="font-semibold text-fg">Email {x.step} · version {x.variant}</div>
                {x.subject && <div className="mt-1 text-fg-2">Subject: {x.subject}</div>}
                <div className="mt-1 whitespace-pre-wrap break-words text-fg-2">{x.body}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function History({ d }: { d: CampaignDetailB3 }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-4 space-y-6">
      <section>
        <SectionHeader title="Stage history" icon="history" right={<span className="text-xs text-muted">engine</span>} />
        <Card className="p-0">
          {d.history.length ? (
            <ol className="divide-y divide-line">
              {d.history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex gap-3 px-5 py-3">
                  <span className="tabular w-24 shrink-0 text-xs text-muted sm:w-28">{slashTime(h.at)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[15px] text-fg">{h.what}<Pill tone={h.status === 'failed' ? 'bad' : h.status === 'succeeded' || h.status === 'live' ? 'good' : 'plain'}>{h.status}</Pill>{h.dryRun && <Pill>dry run</Pill>}</div>
                    {h.message && <div className="mt-0.5 break-words text-xs text-muted">{h.message}</div>}
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className="px-5 py-4 text-sm text-muted">No engine steps on this campaign yet (it may have been built before the engine).</div>}
        </Card>
      </section>
      <section>
        <SectionHeader title="Activity log" icon="activity" right={<span className="text-xs text-muted">newest first</span>} />
        <Card className="p-0">
          {!d.activity.length && <div className="px-5 py-4 text-sm text-muted">Nothing logged yet for this campaign or its lead list.</div>}
          <ol className="divide-y divide-line">
            {d.activity.slice(0, 60).map((r) => (
              <li key={r.id}>
                <button onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} disabled={!r.details} className="flex w-full items-start gap-3 px-5 py-3 text-left transition enabled:hover:bg-hover">
                  <span className="tabular w-24 shrink-0 text-xs text-muted sm:w-28">{slashTime(r.when)}</span>
                  <span className="min-w-0 flex-1"><span className="block break-words text-[15px] font-medium text-fg">{r.event}</span>
                    <span className="mt-1 flex flex-wrap gap-1"><Pill tone="accent">{r.agent}</Pill>{r.type && <Pill>{r.type}</Pill>}{r.on === 'list' && <Pill>lead list</Pill>}</span></span>
                </button>
                {open === r.id && r.details && <div className="mx-5 mb-3 whitespace-pre-wrap break-words rounded-lg bg-sunken p-3 text-xs leading-5 text-fg-2">{r.details}</div>}
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </div>
  );
}
