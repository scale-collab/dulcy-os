// Campaigns (Softr: Campaign Overview, Campaign Details, Campaign Review, Campaign Calendar).
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { BackLink, Button, Card, cx, Empty, ErrorBox, go, Icon, Label, Markdown, SectionHeader } from '../ui';
import { CampaignTable, StatePill } from './Results';
import { Choice, Done, Field, HealthPill, niceDate, num, Page, TextArea, Updated, useLoad } from './kit';
import type { Calendar, CampaignDetail, CampaignRow } from './types';

export function Campaigns() {
  const s = useLoad<{ campaigns: CampaignRow[]; readAt: string }>('/portal/campaigns');
  return (
    <Page title="Campaigns" sub="Every campaign we run for you: what is waiting for your review, what is live, and what is done." state={s} kind="list">
      {(d) => {
        const review = d.campaigns.filter((c) => c.state === 'review');
        return (
          <div className="space-y-6">
            {review.length > 0 && (
              <section>
                <SectionHeader title="Waiting for your review" icon="flag" />
                <div className="grid gap-3 md:grid-cols-2">
                  {review.map((c) => (
                    <Card key={c.key} onClick={() => go(`campaign/${c.key}`)} className="flex items-center gap-3 border-accent/50" label={`Review ${c.name}`}>
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Icon name="megaphone" size={20} /></span>
                      <div className="min-w-0 flex-1"><div className="font-semibold text-fg [overflow-wrap:anywhere]">{c.name}</div><div className="text-sm text-muted">Read the plan and the emails, then approve or ask for changes.</div></div>
                      <Icon name="chevronRight" className="text-muted" />
                    </Card>
                  ))}
                </div>
              </section>
            )}
            <section>
              <SectionHeader title={`All campaigns · ${d.campaigns.length}`} icon="megaphone" />
              <CampaignTable rows={d.campaigns} />
            </section>
            <Updated at={d.readAt} />
          </div>
        );
      }}
    </Page>
  );
}

export function CampaignPage({ id }: { id: string }) {
  const s = useLoad<CampaignDetail>(`/portal/campaign/${encodeURIComponent(id)}`);
  return (
    <div>
      <BackLink label="Campaigns" onClick={() => go('campaigns')} />
      <Page title={s.d?.name ?? 'Campaign'} kicker={s.d ? <StatePill c={s.d} /> : undefined} state={s} kind="list">
        {(d) => (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-6">
              {d.state !== 'review' && d.state !== 'building' && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {([['Sent', d.sent], ['Replies', d.replies], ['Interested', d.interested], ['Booked', d.booked]] as const).map(([k, v]) => (
                    <Card key={k} className="p-4"><div className="text-xs text-muted">{k}</div><div className={cx('tabular mt-1 text-2xl font-bold', k === 'Booked' ? 'text-accent-ink' : 'text-fg')}>{num(v)}</div></Card>
                  ))}
                </div>
              )}
              {d.thesis && <Card><SectionHeader title="The plan" icon="target" /><Markdown text={d.thesis} /></Card>}
              {d.targeting.length > 0 && (
                <Card>
                  <SectionHeader title="Who we are reaching" icon="users" />
                  <dl className="grid gap-3 sm:grid-cols-2">{d.targeting.map((t) => <div key={t.what}><dt><Label>{t.what}</Label></dt><dd className="mt-1 text-[15px] text-fg-2">{t.value}</dd></div>)}</dl>
                </Card>
              )}
              {d.emails.length > 0 && (
                <Card>
                  <SectionHeader title={`The emails · ${d.emails.length}`} icon="mail" />
                  <ol className="space-y-4">
                    {d.emails.map((e) => (
                      <li key={e.step} className="rounded-xl border border-line bg-sunken p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Email {e.step}</div>
                        {e.subject && <div className="mt-1 font-semibold text-fg">Subject: {e.subject}</div>}
                        <div className="mt-2 whitespace-pre-wrap text-[15px] leading-6 text-fg-2">{e.body}</div>
                      </li>
                    ))}
                  </ol>
                </Card>
              )}
              {!d.thesis && !d.emails.length && !d.targeting.length && <Card><Empty icon="megaphone" title="The plan for this campaign is being written" sub="It shows up here as soon as it is ready for you." /></Card>}
            </div>
            <aside className="space-y-4">
              <Card>
                <SectionHeader title="Details" icon="list" />
                <dl className="space-y-2 text-sm">
                  {d.approach && <Row k="Approach" v={d.approach} />}
                  {d.launch && !d.started && <Row k="Planned launch" v={niceDate(d.launch)} />}
                  {d.started && <Row k="Started sending" v={niceDate(d.started)} />}
                  {d.finished && <Row k="Finished" v={niceDate(d.finished)} />}
                  {d.contacted > 0 && <Row k="People contacted" v={num(d.contacted)} />}
                  {d.deliverability && <div className="flex items-center justify-between gap-3"><dt className="text-muted">Deliverability</dt><dd><HealthPill h={d.deliverability} /></dd></div>}
                </dl>
              </Card>
              {d.canReview ? <ReviewForm d={d} /> : d.answer.feedback ? (
                <Card><SectionHeader title="Your answer" icon="check" /><div className="text-[15px] font-semibold text-fg">{d.answer.feedback}</div>{d.answer.changes && <div className="text-sm text-muted">Change: {d.answer.changes}</div>}{d.answer.comments && <p className="mt-2 whitespace-pre-wrap text-sm text-fg-2">{d.answer.comments}</p>}</Card>
              ) : null}
            </aside>
          </div>
        )}
      </Page>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex items-center justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium text-fg">{v}</dd></div>;

function ReviewForm({ d }: { d: CampaignDetail }) {
  const [f, setF] = useState({ feedback: '', changes: '', reviewCopy: '', size: '', geo: '', industry: '', title: '', context: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const changes = f.feedback === 'Request Changes';
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api(`/portal/campaign/${d.key}/review`, { body: f }); setSent(f.feedback); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  if (sent) return <Card><Done title={sent === 'Approve Campaign' ? 'Approved. Thank you!' : 'Got it. We will update the campaign.'} sub={sent === 'Approve Campaign' ? 'We take it from here and let you know when it is live.' : 'You will see the new version here for review.'} /></Card>;
  return (
    <Card className="border-accent/50">
      <SectionHeader title="Your review" icon="flag" />
      <form onSubmit={submit} className="space-y-4">
        <Choice label="What do you think?" value={f.feedback as never} options={d.choices.feedback as never[]} onChange={(v) => setF({ ...f, feedback: v })} columns={1} />
        {changes && <Choice label="What should change?" value={f.changes as never} options={d.choices.changes as never[]} onChange={(v) => setF({ ...f, changes: v })} columns={1} />}
        {changes && <Field label="Your notes on the emails"><TextArea value={f.reviewCopy} onChange={set('reviewCopy')} placeholder="What to change, add or remove" /></Field>}
        <details className="rounded-xl border border-line p-3" open={changes}>
          <summary className="min-h-8 cursor-pointer text-sm font-semibold text-fg">Targeting (optional)</summary>
          <div className="mt-3 space-y-3">
            {([['size', 'Company size'], ['geo', 'Locations'], ['industry', 'Industries'], ['title', 'Job titles']] as const).map(([k, label]) => (
              <Field key={k} label={label}>
                <select className="mt-1.5 w-full min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-fg" value={f[k]} onChange={(e) => set(k)(e.target.value)}>
                  <option value="">No comment</option>
                  {d.choices.targeting.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            ))}
          </div>
        </details>
        <Field label="Anything else?"><TextArea rows={3} value={f.context} onChange={set('context')} /></Field>
        {error && <ErrorBox error={error} />}
        <Button type="submit" tone="accent" size="lg" className="w-full" disabled={busy || !f.feedback || (changes && !f.changes)}>{busy ? 'Sending…' : f.feedback === 'Approve Campaign' ? 'Approve campaign' : 'Send my review'}</Button>
      </form>
    </Card>
  );
}

export function CalendarPage() {
  const s = useLoad<Calendar>('/portal/calendar');
  return (
    <Page title="Campaign calendar" sub="When each campaign launched, launches next, and finished." state={s}>
      {(d) => {
        if (!d.events.length) return <Card><Empty icon="calendar" title="Nothing on the calendar yet" sub="Planned launches show up here as soon as they are set." /></Card>;
        const months = new Map<string, Calendar['events']>();
        for (const e of d.events) { const m = e.day.slice(0, 7); months.set(m, [...(months.get(m) ?? []), e]); }
        return (
          <div className="space-y-6">
            {[...months.entries()].map(([m, list]) => (
              <section key={m}>
                <SectionHeader title={new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} icon="calendar" />
                <Card className="divide-y divide-line p-0">
                  {list.map((e, i) => (
                    <button key={`${e.key}-${i}`} onClick={() => go(`campaign/${e.key}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover sm:px-5">
                      <div className="w-14 shrink-0 text-center"><div className="text-xs uppercase text-muted">{new Date(`${e.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</div><div className="tabular text-xl font-bold text-fg">{Number(e.day.slice(8, 10))}</div></div>
                      <div className="min-w-0 flex-1"><div className="truncate font-semibold text-fg">{e.name}</div><div className={cx('text-sm', e.what === 'launch' ? 'text-accent-ink' : 'text-muted')}>{e.label}</div></div>
                      <Icon name="chevronRight" className="text-muted" />
                    </button>
                  ))}
                </Card>
              </section>
            ))}
            <Updated at={d.readAt} />
          </div>
        );
      }}
    </Page>
  );
}
