// Home ("is this working?") and the results per channel: Email, LinkedIn, AI caller, Direct mail.
import { useState } from 'react';
import { Button, Card, cx, Empty, go, Icon, Pill, SectionHeader } from '../ui';
import { HealthLine, HealthPill, niceDate, NotActive, num, Page, pct, Segmented, Stat, Updated, useLoad } from './kit';
import type { AiCaller, CampaignRow, EmailResults, Home as HomeT, LinkedinResults, Session } from './types';

export function Home({ session }: { session: Session }) {
  const s = useLoad<HomeT>('/portal/home');
  const first = (session.user.name || '').split(' ')[0];
  return (
    <Page title={first ? `Hi ${first}` : 'Welcome'} kicker={session.client.name} state={s} kind="today">
      {(d) => (
        <div className="space-y-6">
          <Card className="relative overflow-hidden border-accent/30 bg-gradient-to-br from-accent-soft via-surface to-surface p-5 sm:p-7">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-ink">Is it working?</div>
            <div className="mt-2 text-xl font-bold leading-snug tracking-tight text-fg sm:text-2xl">{d.verdict}</div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini label="Meetings booked" sub="This month" n={d.month.booked} strong />
              <Mini label="Interested replies" sub="This month" n={d.month.interested} />
              <Mini label="Emails sent" sub="Last 30 days" n={d.month.sent30} />
              <Mini label="Live campaigns" sub="Right now" n={d.month.live} />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col">
              <SectionHeader title="Next meeting with us" icon="calendar" />
              {d.next ? (
                <div><div className="text-lg font-semibold text-fg">{d.next.title}</div><div className="text-sm text-muted">{niceDate(d.next.day, { weekday: true })}</div></div>
              ) : <div className="text-sm text-muted">Nothing on the calendar yet.</div>}
              <div className="mt-auto pt-4"><Button icon="calendar" onClick={() => go('schedule')} className="w-full sm:w-auto">Book a call with us</Button></div>
            </Card>
            <Card className="flex flex-col">
              <SectionHeader title="Latest meeting booked for you" icon="check" />
              {d.lastBooked ? (
                <button onClick={() => go(`lead/${d.lastBooked!.key}`)} className="-mx-2 rounded-xl px-2 py-1 text-left hover:bg-hover">
                  <div className="text-lg font-semibold text-fg">{d.lastBooked.name}</div>
                  <div className="text-sm text-muted">{[d.lastBooked.company, `booked ${niceDate(d.lastBooked.bookedOn)}`].filter(Boolean).join(' · ')}</div>
                </button>
              ) : <div className="text-sm text-muted">Booked meetings show up here.</div>}
              <div className="mt-auto pt-4"><Button icon="arrowRight" onClick={() => go('pipeline')} className="w-full sm:w-auto">See your pipeline</Button></div>
            </Card>
            <Card className="flex flex-col">
              <SectionHeader title={`Open tasks for you · ${d.tasks.open}`} icon="list" />
              {d.tasks.top.length ? (
                <ul className="space-y-1.5">{d.tasks.top.map((t) => <li key={t.key} className="flex items-start gap-2 text-[15px] text-fg-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{t.name}{t.stage === 'blocked' && <Pill tone="warn">Blocked</Pill>}</li>)}</ul>
              ) : <div className="text-sm text-muted">Nothing needed from you right now.</div>}
              <div className="mt-auto pt-4"><Button icon="arrowRight" onClick={() => go('tasks')} className="w-full sm:w-auto">Open tasks</Button></div>
            </Card>
          </div>

          {(d.todo.review > 0 || d.todo.feedback > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {d.todo.review > 0 && <Todo icon="megaphone" title={`${d.todo.review === 1 ? 'A campaign is' : `${d.todo.review} campaigns are`} waiting for your review`} sub="Read the plan and the emails, then approve or ask for changes." onClick={() => go('campaigns')} />}
              {d.todo.feedback > 0 && <Todo icon="star" title={`${d.todo.feedback} call${d.todo.feedback === 1 ? '' : 's'} need${d.todo.feedback === 1 ? 's' : ''} your feedback`} sub="30 seconds each: how did the call go?" onClick={() => go('feedback')} />}
            </div>
          )}
          <HealthLine h={d.health} />
          <Updated at={d.readAt} />
        </div>
      )}
    </Page>
  );
}

function Mini({ label, sub, n, strong }: { label: string; sub: string; n: number; strong?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface/80 px-3 py-3 sm:px-4">
      <div className={cx('tabular text-[28px] font-bold leading-none tracking-tight sm:text-[32px]', strong ? 'text-accent-ink' : 'text-fg')}>{num(n)}</div>
      <div className="mt-1.5 truncate text-sm font-medium text-fg-2">{label}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
}
function Todo({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <Card onClick={onClick} className="flex items-center gap-3 border-accent/40">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Icon name={icon} size={20} /></span>
      <div className="min-w-0 flex-1"><div className="font-semibold text-fg">{title}</div><div className="text-sm text-muted">{sub}</div></div>
      <Icon name="chevronRight" className="text-muted" />
    </Card>
  );
}

/* ---------- Email ---------- */
const PERIOD_OPTS = [['Last 10 days', '10 days'], ['Last 30 days', '30 days'], ['Last 60 days', '60 days'], ['Last 120 days', '120 days'], ['All time', 'All time']] as const;
type PeriodKey = (typeof PERIOD_OPTS)[number][0];
export function Email() {
  const s = useLoad<EmailResults>('/portal/email');
  const [p, setP] = useState<PeriodKey>('Last 30 days');
  return (
    <Page title="Email results" sub="Your cold email campaigns: what was sent, who replied, and the meetings booked." state={s} kind="grid">
      {(d) => {
        if (!d.active) return <NotActive channel="Cold email" icon="mail" />;
        const row = d.periods.find((x) => x.period === p);
        const v = row ? { contacted: Number(row.contacted), sent: Number(row.sent), replies: Number(row.replies), interested: Number(row.interested), booked: Number(row.booked) } : p === 'All time' || !d.periods.length ? d.total : null;
        return (
          <div className="space-y-6">
            {d.periods.length > 0 && <Segmented label="Time frame" value={p} onChange={setP} options={PERIOD_OPTS} />}
            {v ? (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label="Emails sent" value={num(v.sent)} sub={v.contacted ? `${num(v.contacted)} people contacted` : undefined} />
                  <Stat label="Replies" value={num(v.replies)} sub={`Reply rate ${pct(v.replies, v.contacted || v.sent)}`} />
                  <Stat label="Interested replies" value={num(v.interested)} sub={`${pct(v.interested, v.replies)} of replies`} />
                  <Stat label="Meetings booked" value={num(v.booked)} strong sub={v.booked ? `1 meeting per ${num(Math.round(v.sent / v.booked))} emails` : 'Meetings come after interested replies'} />
                </div>
                {!row && d.periods.length === 0 && <p className="text-xs text-muted">Totals across your campaigns. Numbers by time frame start once your first campaign has run a few days.</p>}
              </>
            ) : <Card><Empty icon="clock" title="No numbers for this time frame yet" /></Card>}
            <HealthLine h={d.health} />
            <section>
              <SectionHeader title={`Campaigns · ${d.campaigns.length}`} icon="megaphone" />
              <CampaignTable rows={d.campaigns} />
            </section>
            <Updated at={d.readAt} />
          </div>
        );
      }}
    </Page>
  );
}

export function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  if (!rows.length) return <Card><Empty icon="megaphone" title="No campaign has started yet" sub="Your first campaign shows up here as soon as it starts sending." /></Card>;
  return (
    <>
      <Card className="hidden p-0 md:block">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th className="w-2/5 px-5 py-3 font-semibold">Campaign</th><th className="px-3 py-3 text-right font-semibold">Sent</th><th className="px-3 py-3 text-right font-semibold">Replies</th>
            <th className="px-3 py-3 text-right font-semibold">Interested</th><th className="px-3 py-3 text-right font-semibold">Booked</th><th className="px-5 py-3 font-semibold">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.key} className="cursor-pointer hover:bg-hover" onClick={() => go(`campaign/${c.key}`)}>
                <td className="max-w-0 px-5 py-3 font-medium text-fg"><div className="truncate">{c.name}</div></td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(c.sent)}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(c.replies)}</td>
                <td className="tabular px-3 py-3 text-right text-fg-2">{num(c.interested)}</td>
                <td className="tabular px-3 py-3 text-right font-semibold text-fg">{num(c.booked)}</td>
                <td className="px-5 py-3"><div className="flex flex-wrap gap-1"><StatePill c={c} />{c.deliverability && c.deliverability !== 'healthy' && <HealthPill h={c.deliverability} />}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-3 md:hidden">
        {rows.map((c) => (
          <Card key={c.key} className="p-4" onClick={() => go(`campaign/${c.key}`)} label={c.name}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0 font-semibold text-fg [overflow-wrap:anywhere]">{c.name}</div><StatePill c={c} /></div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {([['Sent', c.sent], ['Replies', c.replies], ['Interested', c.interested], ['Booked', c.booked]] as const).map(([k, v]) => (
                <div key={k} className="min-w-0 rounded-xl bg-sunken px-1 py-2"><div className={cx('tabular text-base font-semibold', k === 'Booked' ? 'text-accent-ink' : 'text-fg')}>{num(v)}</div><div className="truncate text-[11px] text-muted">{k}</div></div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
export function StatePill({ c }: { c: Pick<CampaignRow, 'state' | 'label'> }) {
  const tone = c.state === 'live' ? 'good' : c.state === 'review' ? 'accent' : c.state === 'paused' ? 'warn' : 'plain';
  return <Pill tone={tone}>{c.label}</Pill>;
}

/* ---------- LinkedIn ---------- */
export function Linkedin() {
  const s = useLoad<LinkedinResults>('/portal/linkedin');
  const [p, setP] = useState<PeriodKey>('Last 30 days');
  return (
    <Page title="LinkedIn results" sub="Connection requests, replies and meetings from LinkedIn." state={s} kind="grid">
      {(d) => {
        if (!d.active) return <NotActive channel="LinkedIn" icon="users" />;
        const row = d.periods.find((x) => x.period === p);
        return (
          <div className="space-y-6">
            {d.periods.length > 0 && <Segmented label="Time frame" value={p} onChange={setP} options={PERIOD_OPTS} />}
            {row ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Connection requests" value={num(Number(row.sent))} sub={`${pct(Number(row.accepted), Number(row.sent))} accepted`} />
                <Stat label="Conversations started" value={num(Number(row.messages))} />
                <Stat label="Replies" value={num(Number(row.replies))} />
                <Stat label="Meetings booked" value={num(Number(row.booked))} strong />
              </div>
            ) : <Card><Empty icon="clock" title="No LinkedIn numbers for this time frame yet" /></Card>}
            <section>
              <SectionHeader title={`LinkedIn campaigns · ${d.campaigns.length}`} icon="megaphone" />
              {!d.campaigns.length ? <Card><Empty icon="users" title="No LinkedIn campaign yet" /></Card> : (
                <div className="grid gap-3 md:grid-cols-2">
                  {d.campaigns.map((c) => (
                    <Card key={c.key} className="p-4">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0 font-semibold text-fg">{c.name}</div><Pill tone={c.status === 'Active' ? 'good' : 'plain'}>{c.status}</Pill></div>
                      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                        {([['Requests', c.sent], ['Accepted', c.accepted], ['Replies', c.replies], ['Booked', c.booked]] as const).map(([k, v]) => (
                          <div key={k} className="rounded-xl bg-sunken px-1 py-2"><div className="tabular font-semibold text-fg">{num(v)}</div><div className="truncate text-[11px] text-muted">{k}</div></div>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
            <Updated at={d.readAt} />
          </div>
        );
      }}
    </Page>
  );
}

/* ---------- AI caller ---------- */
export function AiCallerPage() {
  const s = useLoad<AiCaller>('/portal/ai-caller');
  return (
    <Page title="AI caller results" sub="Calls our AI caller made to your leads." state={s} kind="grid">
      {(d) => !d.active ? <NotActive channel="The AI caller" icon="phone" /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Calls made" value={num(d.calls)} />
            <Stat label="Answered" value={num(d.answered)} sub={`${pct(d.answered, d.calls)} of calls`} />
            <Stat label="Interested" value={num(d.interested)} strong sub={`${pct(d.interested, d.answered)} of answered calls`} />
          </div>
          <Updated at={d.readAt} />
        </div>
      )}
    </Page>
  );
}

export function DirectMail({ session }: { session: Session }) {
  return (
    <div>
      <h1 className="mb-6 text-[26px] font-bold leading-tight tracking-tight text-fg sm:text-[28px]">Direct mail results</h1>
      {session.channels.directMail
        ? <Card><Empty icon="mail" title="Direct mail numbers are not in your portal yet" sub="Ask your Dulcy team for the latest direct mail report." /></Card>
        : <NotActive channel="Direct mail" icon="mail" />}
    </div>
  );
}
