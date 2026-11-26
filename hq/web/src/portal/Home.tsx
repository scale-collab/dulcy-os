// Tab 1, Home: "How it's going" in one scroll (v3, 2026-11-26). One read: /portal/home.
//   "Is it working?" + the last 30 days against the 30 before, per active channel (a small switch
//   when more than one is on; an off channel is not shown) · the next call with us + Book a call ·
//   "Needs you" (tasks to mark done, campaigns to review, call feedback due, the onboarding form) ·
//   the active campaigns (tap: the campaign page with numbers, copy and the review form).
import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { Button, Card, cx, ErrorBox, go, Icon, Markdown, Pill, SectionHeader, StatusDot } from '../ui';
import { StatePill } from './Results';
import { Files, niceDate, num, Page, Segmented, Updated, useLoad } from './kit';
import type { Home as HomeT, Session, Task, Win } from './types';

type Ch = 'email' | 'linkedin' | 'ai' | 'mail';
const CH_LABEL: Record<Ch, string> = { email: 'Email', linkedin: 'LinkedIn', ai: 'AI caller', mail: 'Direct mail' };

export function Home({ session, onChanged }: { session: Session; onChanged: () => void }) {
  const s = useLoad<HomeT>('/portal/home');
  const first = (session.user.name || '').split(' ')[0];
  return (
    <Page title="How it's going" kicker={first ? `Hi ${first}` : session.client.name} state={s} kind="today">
      {(d) => (
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          {/* Phone: one column in the order results, our next call, needs you, campaigns. Computer: results and campaigns left, needs you and our next call right. */}
          <div className="contents lg:flex lg:flex-col lg:gap-5">
            <div className="order-1 lg:order-none"><Results d={d} /></div>
            <div className="order-4 lg:order-none"><ActiveCampaigns d={d} /></div>
          </div>
          <div className="contents lg:flex lg:flex-col lg:gap-5">
            <div className="order-3 lg:order-none"><NeedsYou d={d} reload={() => { s.load(); onChanged(); }} /></div>
            <div className="order-2 lg:order-none"><NextCall d={d} session={session} /></div>
          </div>
          <div className="order-5 lg:col-span-2"><Updated at={d.readAt} /></div>
        </div>
      )}
    </Page>
  );
}

/* ---------- Is it working? + the numbers ---------- */
function Results({ d }: { d: HomeT }) {
  const r = d.results;
  const on = ([['email', r.email], ['linkedin', r.linkedin], ['ai', r.aiCaller], ['mail', r.directMail || null]] as const).filter(([, x]) => x).map(([k]) => k as Ch);
  const [ch, setCh] = useState<Ch>(on[0] ?? 'email');
  const cur = on.includes(ch) ? ch : on[0];
  return (
    <Card className="relative overflow-hidden border-accent/30 bg-gradient-to-br from-accent-soft via-surface to-surface p-5 sm:p-7">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-ink">Is it working?</div>
      <p className="mt-2 text-xl font-bold leading-snug tracking-tight text-fg sm:text-2xl">{d.verdict}</p>
      {on.length > 1 && (
        <div className="mt-5"><Segmented label="Channel" value={cur} onChange={setCh} options={on.map((k) => [k, CH_LABEL[k]] as const)} /></div>
      )}
      <div className="mt-5">
        {cur === 'email' && r.email && (
          <>
            <Window label={r.email.label} before={!!r.email.before} />
            <Numbers now={r.email.now} before={r.email.before} rows={[['sent', 'Emails sent'], ['replies', 'Replies'], ['interested', 'Interested'], ['booked', 'Meetings booked']]} />
            <div className="mt-4 flex items-start gap-2 text-sm text-fg-2"><StatusDot tone={r.email.health.status === 'healthy' ? 'good' : r.email.health.status === 'watching' ? 'warn' : 'bad'} className="mt-1.5 h-2 w-2" /><span>Inbox delivery: {r.email.health.text}</span></div>
            <More onClick={() => go('email')}>All email numbers and campaigns</More>
          </>
        )}
        {cur === 'linkedin' && r.linkedin && (
          <>
            <Window label={r.linkedin.label} before={!!r.linkedin.before} />
            <Numbers now={r.linkedin.now} before={r.linkedin.before} rows={[['sent', 'Connection requests'], ['accepted', 'Accepted'], ['replies', 'Replies'], ['booked', 'Meetings booked']]} />
            <More onClick={() => go('linkedin')}>All LinkedIn numbers and campaigns</More>
          </>
        )}
        {cur === 'ai' && r.aiCaller && (
          <>
            <Window label="All time" before={false} />
            <Numbers now={{ calls: r.aiCaller.calls, answered: r.aiCaller.answered, interested: r.aiCaller.interested }} before={null} rows={[['calls', 'Calls made'], ['answered', 'Answered'], ['interested', 'Interested']]} />
            <More onClick={() => go('ai-caller')}>AI caller details</More>
          </>
        )}
        {cur === 'mail' && <p className="text-[15px] text-fg-2">Direct mail numbers are not in your portal yet. Ask your Dulcy team for the latest direct mail report.</p>}
        {!on.length && <p className="text-[15px] text-fg-2">Your numbers show up here as soon as your first campaign starts sending.</p>}
      </div>
    </Card>
  );
}
function Window({ label, before }: { label: string; before: boolean }) {
  return <div className="mb-2 text-sm text-muted"><span className="font-semibold text-fg-2">{label}</span>{before && ' · compared with the 30 days before'}</div>;
}
function Numbers({ now, before, rows }: { now: Win; before: Win | null; rows: [string, string][] }) {
  return (
    <div className={cx('grid gap-2.5', rows.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
      {rows.map(([k, label]) => {
        const v = now[k] ?? 0; const b = before ? before[k] ?? 0 : null;
        const strong = k === 'booked' || (k === 'interested' && rows.length === 3);
        return (
          <div key={k} className="min-w-0 rounded-xl border border-line bg-surface/80 px-3 py-3 sm:px-4">
            <div className={cx('tabular text-[30px] font-bold leading-none tracking-tight sm:text-[34px]', strong ? 'text-accent-ink' : 'text-fg')}>{num(v)}</div>
            <div className="mt-1.5 text-sm font-medium text-fg-2">{label}</div>
            {b !== null && <Change now={v} before={b} />}
          </div>
        );
      })}
    </div>
  );
}
function Change({ now, before }: { now: number; before: number }) {
  if (now === before) return <div className="mt-0.5 text-xs text-muted">Same as before ({num(before)})</div>;
  const up = now > before;
  return (
    <div className={cx('mt-0.5 flex items-center gap-1 text-xs', up ? 'text-good' : 'text-muted')}>
      <Icon name={up ? 'trendUp' : 'trendDown'} size={13} strokeWidth={2.2} />{up ? 'Up' : 'Down'} from {num(before)}
    </div>
  );
}
const More = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick} className="-mx-2 mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-accent-ink hover:bg-hover">{children}<Icon name="arrowRight" size={15} /></button>
);

/* ---------- Our next call ---------- */
function NextCall({ d, session }: { d: HomeT; session: Session }) {
  const url = session.go.meeting;
  return (
    <Card>
      <SectionHeader title="Your next call with us" icon="calendar" />
      {d.next ? <div><div className="text-lg font-semibold text-fg">{d.next.title}</div><div className="text-sm text-muted">{niceDate(d.next.day, { weekday: true })}</div></div>
        : <div className="text-[15px] text-muted">Nothing on the calendar yet.</div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-4 text-[15px] font-semibold text-accent-fg shadow-card hover:bg-accent-hover sm:flex-none"><Icon name="calendar" size={17} />Book a call</a>
          : <Button tone="accent" icon="calendar" onClick={() => go('schedule')} className="flex-1 sm:flex-none">Book a call</Button>}
        <Button icon="history" onClick={() => go('our-meetings')} className="flex-1 sm:flex-none">Past calls</Button>
      </div>
    </Card>
  );
}

/* ---------- Needs you ---------- */
function NeedsYou({ d, reload }: { d: HomeT; reload: () => void }) {
  const n = d.needs;
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [done, setDone] = useState<string[]>([]);
  const markDone = async (t: Task) => {
    setBusy(t.key); setError('');
    try { await api(`/portal/task/${t.key}/done`, { body: {} }); setDone((x) => [...x, t.key]); reload(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const tasks = n.tasks.filter((t) => !done.includes(t.key));
  const count = n.count - (n.tasks.length - tasks.length);
  return (
    <Card className={cx(count > 0 && 'border-accent/50')}>
      <SectionHeader title={<>Needs you{count > 0 && <span className="tabular font-normal text-muted"> · {count}</span>}</>} icon="flag" />
      {error && <div className="mb-3"><ErrorBox error={error} /></div>}
      {count === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-good-soft px-3 py-3 text-[15px] font-medium text-good"><Icon name="check" size={18} strokeWidth={2.4} />Nothing needs you right now.</div>
      ) : (
        <ul className="-mx-1 divide-y divide-line">
          {n.review.map((c) => <Item key={c.key} icon="megaphone" title="Review your new campaign" sub={c.name} action="Review" onClick={() => go(`campaign/${c.key}/review`)} />)}
          {n.feedback.map((m) => <Item key={m.key} icon="star" title={`How did the call with ${m.name} go?`} sub={[m.company, `booked ${niceDate(m.bookedOn)}`].filter(Boolean).join(' · ')} action="Tell us" onClick={() => go(`lead/${m.key}/feedback`)} />)}
          {n.onboarding && <Item icon="file" title="Finish your onboarding form" sub="Your company, offer and ideal clients: we build your campaigns from it." action="Open" onClick={() => go('account/onboarding')} />}
          {tasks.map((t) => (
            <li key={t.key} className="px-1 py-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Icon name="list" size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-fg [overflow-wrap:anywhere]">{t.name}</span>{t.stage === 'blocked' && <Pill tone="warn">Blocked</Pill>}</div>
                  {t.details && <div className="mt-0.5 line-clamp-3 text-sm"><Markdown text={t.details} small /></div>}
                  <Files files={t.files} />
                  <Button tone="quiet" icon="check" disabled={busy === t.key} onClick={() => markDone(t)} className="mt-2.5 w-full sm:w-auto">{busy === t.key ? 'Saving…' : 'Mark done'}</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => go('tasks')} className="-mx-2 mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted hover:bg-hover hover:text-fg">All tasks, with the finished ones<Icon name="chevronRight" size={15} /></button>
    </Card>
  );
}
function Item({ icon, title, sub, action, onClick }: { icon: string; title: string; sub: string; action: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left hover:bg-hover">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Icon name={icon} size={18} /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold text-fg [overflow-wrap:anywhere]">{title}</span>{sub && <span className="block text-sm text-muted [overflow-wrap:anywhere]">{sub}</span>}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-accent-ink">{action}<Icon name="chevronRight" size={15} /></span>
      </button>
    </li>
  );
}

/* ---------- Active campaigns ---------- */
function ActiveCampaigns({ d }: { d: HomeT }) {
  return (
    <section>
      <SectionHeader title={`Your campaigns · ${d.campaigns.length}`} icon="megaphone" />
      {!d.campaigns.length ? <Card><p className="text-[15px] text-muted">Your first campaign is being prepared. It shows up here as soon as it is ready for your review.</p></Card> : (
        <Card className="divide-y divide-line p-0">
          {d.campaigns.map((c) => (
            <button key={c.key} onClick={() => go(`campaign/${c.key}`)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-hover sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-fg [overflow-wrap:anywhere]">{c.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted"><StatePill c={c} />{c.sent > 0 && <span className="tabular">{num(c.booked)} booked · {num(c.interested)} interested · {num(c.sent)} sent</span>}</div>
              </div>
              <Icon name="chevronRight" className="shrink-0 text-faint" />
            </button>
          ))}
        </Card>
      )}
      <button onClick={() => go('campaigns')} className="-mx-2 mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-left text-sm font-medium text-muted hover:bg-hover hover:text-fg">
        All campaigns{d.finishedCampaigns > 0 ? ` (${d.finishedCampaigns} finished)` : ''} and the launch calendar<Icon name="chevronRight" size={15} />
      </button>
    </section>
  );
}
