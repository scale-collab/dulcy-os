// A channel's full numbers (opened from Home's results): Email, LinkedIn, AI caller, Direct mail.
// Only the channels that are on for the client are linked from Home.
import { useState } from 'react';
import { Card, cx, Empty, go, Pill, SectionHeader } from '../ui';
import { BackTo, HealthLine, HealthPill, NotActive, num, Page, pct, Segmented, Stat, Updated, useLoad } from './kit';
import type { AiCaller, CampaignRow, EmailResults, LinkedinResults, Session } from './types';

/* ---------- Email ---------- */
const PERIOD_OPTS = [['Last 10 days', '10 days'], ['Last 30 days', '30 days'], ['Last 60 days', '60 days'], ['Last 120 days', '120 days'], ['All time', 'All time']] as const;
type PeriodKey = (typeof PERIOD_OPTS)[number][0];
export function Email() {
  const s = useLoad<EmailResults>('/portal/email');
  const [p, setP] = useState<PeriodKey>('Last 30 days');
  return (
    <>
    <BackTo tab="home" />
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
    </>
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
    <>
    <BackTo tab="home" />
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
    </>
  );
}

/* ---------- AI caller ---------- */
export function AiCallerPage() {
  const s = useLoad<AiCaller>('/portal/ai-caller');
  return (
    <>
    <BackTo tab="home" />
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
    </>
  );
}

export function DirectMail({ session }: { session: Session }) {
  return (
    <div>
      <BackTo tab="home" />
      <h1 className="mb-6 text-[26px] font-bold leading-tight tracking-tight text-fg sm:text-[28px]">Direct mail results</h1>
      {session.channels.directMail
        ? <Card><Empty icon="mail" title="Direct mail numbers are not in your portal yet" sub="Ask your Dulcy team for the latest direct mail report." /></Card>
        : <NotActive channel="Direct mail" icon="mail" />}
    </div>
  );
}
