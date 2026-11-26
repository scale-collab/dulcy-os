// Tab 2, Leads: "Your leads" (v3, 2026-11-26). Softr: Pipeline, Lead Details Full, Close a Deal, Call
// Feedback Form, Call Feedback, Emails details. One list of positive replies, newest first; the
// pipeline stages are the filter chips; booked meetings (with the feedback due or given) are the
// "Meetings" chip. One read: /portal/pipeline. A lead's page: what they wrote, the meeting, the
// call feedback form and the close-a-deal form.
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Button, Card, cx, Empty, ErrorBox, go, Icon, Pill, SectionHeader } from '../ui';
import { BackTo, Choice, Done, Field, Initial, inputCls, money, niceDate, Page, Quote, StarRow, Stars, TextArea, Updated, useLoad } from './kit';
import type { LeadDetail, Pipeline as PipelineT, PipelineLead } from './types';

const STAGE_TONE: Record<string, 'accent' | 'good' | 'info' | 'warn' | 'plain'> = {
  'New Interested': 'info', 'In Conversation': 'info', 'Booked Meeting': 'accent', 'Completed Meeting': 'accent', 'Closed Deal': 'good', 'Closed -- Not Moving Forward': 'plain', Lost: 'plain',
};
const STAGE_LABEL: Record<string, string> = {
  'New Interested': 'New', 'In Conversation': 'In conversation', 'Booked Meeting': 'Meeting booked', 'Completed Meeting': 'Meeting done', 'Closed Deal': 'Closed', 'Closed -- Not Moving Forward': 'Not moving forward', Lost: 'Lost',
};
const stageLabel = (s: string) => STAGE_LABEL[s] ?? s;

export type LeadChip = 'all' | 'new' | 'booked' | 'closed' | 'lost' | 'meetings';
const CHIP_STAGES: Record<'new' | 'booked' | 'closed' | 'lost', readonly string[]> = {
  new: ['New Interested', 'In Conversation'], booked: ['Booked Meeting', 'Completed Meeting'], closed: ['Closed Deal'], lost: ['Closed -- Not Moving Forward', 'Lost'],
};
const CHIP_LABEL: Record<LeadChip, string> = { all: 'All', new: 'New', booked: 'Meeting booked', closed: 'Closed', lost: 'Lost', meetings: 'Meetings' };
export const LEAD_CHIPS = Object.keys(CHIP_LABEL) as LeadChip[];
const newest = (l: PipelineLead) => l.bookedOn || l.date;

export function Leads({ chip }: { chip: LeadChip }) {
  const s = useLoad<PipelineT>('/portal/pipeline');
  return (
    <Page title="Your leads" sub="Everyone who said yes to your campaigns, newest first (last 12 months). Tap a lead to see what they wrote." state={s} kind="list">
      {(d) => {
        const all = d.stages.flatMap((x) => x.leads).sort((a, b) => newest(b).localeCompare(newest(a)));
        const of = (c: LeadChip) => (c === 'all' ? all : c === 'meetings' ? all.filter((l) => l.bookedOn) : all.filter((l) => CHIP_STAGES[c].includes(l.stage)));
        const chips = LEAD_CHIPS.filter((c) => c !== 'lost' || of('lost').length > 0);
        const cur = chips.includes(chip) ? chip : 'all';
        const rows = of(cur);
        return (
          <div className="space-y-4">
            <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <button key={c} role="radio" aria-checked={cur === c} onClick={() => go(c === 'all' ? 'leads' : `leads/${c}`)}
                  className={cx('inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition', cur === c ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong bg-surface text-fg-2 hover:bg-hover')}>
                  {CHIP_LABEL[c]}<span className={cx('tabular', cur === c ? 'text-accent-ink' : 'text-muted')}>{of(c).length}</span>
                </button>
              ))}
            </div>
            {d.deals.count > 0 && cur !== 'meetings' && <p className="text-sm text-fg-2"><Icon name="dollar" size={15} className="mr-1 inline text-good" />{d.deals.count} deal{d.deals.count === 1 ? '' : 's'} closed, worth {money(d.deals.value)} (as you recorded them).</p>}
            {!rows.length ? <Card><Empty icon={cur === 'meetings' ? 'calendar' : 'reply'} title={cur === 'meetings' ? 'No meetings booked yet' : 'No leads here yet'} sub={cur === 'meetings' ? 'Booked meetings show up here.' : 'When a prospect says yes, they show up here.'} /></Card>
              : cur === 'meetings' ? <MeetingList rows={rows} /> : <LeadList rows={rows} />}
            <Updated at={d.readAt} extra={cur === 'meetings' ? 'Each date is the day the meeting was booked, or the day of the call when we have it.' : undefined} />
          </div>
        );
      }}
    </Page>
  );
}

function LeadList({ rows }: { rows: PipelineLead[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {rows.map((l) => (
        <Card key={l.key} className="flex flex-col p-4 sm:p-5" onClick={() => go(`lead/${l.key}`)} label={`${l.name}, ${stageLabel(l.stage)}`}>
          <div className="flex items-start gap-3">
            <Initial name={l.name} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-semibold text-fg [overflow-wrap:anywhere]">{l.name}</span><Pill tone={STAGE_TONE[l.stage] ?? 'plain'}>{stageLabel(l.stage)}</Pill></div>
              {l.company && <div className="text-sm text-fg-2 [overflow-wrap:anywhere]">{l.company}</div>}
              <div className="mt-0.5 text-xs text-muted">{l.bookedOn ? `Meeting booked ${niceDate(l.bookedOn)}` : l.date ? `Replied ${niceDate(l.date)}` : ''}</div>
            </div>
          </div>
          {l.message && <Quote clamp>{l.message}</Quote>}
          {(l.feedbackDue || l.deal) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {l.feedbackDue && <Pill tone="accent" icon="star">Call feedback needed</Pill>}
              {l.deal && <Pill tone="good" icon="dollar">Deal recorded</Pill>}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/** Booked meetings by month, like a calendar: the day it was booked, and the call feedback due or given. */
function MeetingList({ rows }: { rows: PipelineLead[] }) {
  const months = new Map<string, PipelineLead[]>();
  for (const l of [...rows].sort((a, b) => b.bookedOn.localeCompare(a.bookedOn))) { const m = l.bookedOn.slice(0, 7); months.set(m, [...(months.get(m) ?? []), l]); }
  return (
    <div className="space-y-5">
      {[...months.entries()].map(([m, list]) => (
        <section key={m}>
          <SectionHeader title={new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} icon="calendar" />
          <Card className="divide-y divide-line p-0">
            {list.map((l) => {
              const day = new Date(l.bookedOn.length === 10 ? `${l.bookedOn}T12:00:00` : l.bookedOn);
              return (
                <button key={l.key} onClick={() => go(l.feedbackDue ? `lead/${l.key}/feedback` : `lead/${l.key}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover sm:px-5">
                  <div className="w-12 shrink-0 text-center"><div className="text-xs uppercase text-muted">{day.toLocaleDateString(undefined, { weekday: 'short' })}</div><div className="tabular text-xl font-bold text-fg">{day.getDate()}</div></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-fg">{l.name}</div>
                    <div className="truncate text-sm text-muted">{l.company || stageLabel(l.stage)}</div>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    {l.feedbackDue ? <span className="font-semibold text-accent-ink">Give feedback</span>
                      : l.lastFeedback ? <div className="flex flex-col items-end gap-0.5"><span className="font-medium text-fg-2">{l.lastFeedback.status}</span><StarRow n={l.lastFeedback.rating} /></div>
                        : <span className="text-muted">{stageLabel(l.stage)}</span>}
                  </div>
                </button>
              );
            })}
          </Card>
        </section>
      ))}
    </div>
  );
}

export function LeadPage({ id, open }: { id: string; open?: 'feedback' | 'deal' }) {
  const s = useLoad<LeadDetail>(`/portal/lead/${encodeURIComponent(id)}`);
  const [form, setForm] = useState<'feedback' | 'deal' | null>(open ?? null);
  return (
    <div>
      <BackTo tab="leads" />
      <Page title={s.d?.name ?? 'Lead'} kicker={s.d?.company} state={s}>
        {(d) => (
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-4">
              <Card>
                <div className="flex flex-wrap items-center gap-2"><Pill tone={STAGE_TONE[d.stage] ?? 'plain'}>{stageLabel(d.stage)}</Pill>{d.bookedOn && <span className="text-sm text-muted">Booked {niceDate(d.bookedOn)}</span>}</div>
                {d.message && <><div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">What they wrote {d.date && `· ${niceDate(d.date)}`}</div><Quote>{d.message}</Quote></>}
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  {d.email && <div><dt className="text-muted">Email</dt><dd><a className="inline-flex min-h-10 items-center gap-1.5 font-medium text-accent-ink hover:underline [overflow-wrap:anywhere]" href={`mailto:${d.email}`}><Icon name="mail" size={15} />{d.email}</a></dd></div>}
                  {d.campaign && <div><dt className="text-muted">Campaign</dt><dd className="font-medium text-fg">{d.campaign}</dd></div>}
                </dl>
              </Card>
              {d.feedback.length > 0 && (
                <Card>
                  <SectionHeader title="Your call feedback" icon="star" />
                  <div className="space-y-3">{d.feedback.map((x) => (
                    <div key={x.key} className="rounded-xl bg-sunken p-3">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-fg">{x.status}</span><StarRow n={x.rating} /><span className="text-xs text-muted">{niceDate(x.date)}</span></div>
                      {x.newDate && <div className="text-sm text-muted">New date: {niceDate(x.newDate)}</div>}
                      {x.comments && <p className="mt-1 whitespace-pre-wrap text-sm text-fg-2">{x.comments}</p>}
                      {x.recording && <a href={x.recording} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-accent-ink hover:underline"><Icon name="external" size={14} />Recording</a>}
                    </div>
                  ))}</div>
                </Card>
              )}
              {d.deal && (
                <Card className="border-good/40">
                  <SectionHeader title="Deal closed" icon="dollar" />
                  <div className="tabular text-2xl font-bold text-good">{money(d.deal.value)}</div>
                  <div className="text-sm text-muted">{[d.deal.type, d.deal.day && niceDate(d.deal.day)].filter(Boolean).join(' · ')}</div>
                  {d.deal.why && <p className="mt-2 whitespace-pre-wrap text-sm text-fg-2">{d.deal.why}</p>}
                </Card>
              )}
            </div>
            <aside className={cx('space-y-4', form && 'order-first lg:order-none')}>
              {form === 'feedback' && d.canFeedback ? <FeedbackForm d={d} onDone={() => { setForm(null); s.load(); }} />
                : form === 'deal' && d.canCloseDeal ? <DealForm d={d} onDone={() => { setForm(null); s.load(); }} />
                  : (
                    <Card>
                      <SectionHeader title="What happened next?" icon="flag" />
                      <div className="space-y-2">
                        {d.canFeedback && <Button tone={d.feedbackDue ? 'accent' : 'quiet'} icon="star" className="w-full" onClick={() => setForm('feedback')}>{d.feedback.length ? 'Add call feedback' : 'Give call feedback'}</Button>}
                        {d.canCloseDeal && <Button icon="dollar" className="w-full" onClick={() => setForm('deal')}>I closed a deal</Button>}
                        {!d.canFeedback && !d.canCloseDeal && <p className="text-sm text-muted">Nothing to add right now.</p>}
                      </div>
                      {d.feedbackDue && <p className="mt-3 text-sm text-muted">The call has happened: 30 seconds of feedback helps us book better calls.</p>}
                    </Card>
                  )}
            </aside>
          </div>
        )}
      </Page>
    </div>
  );
}

function FeedbackForm({ d, onDone }: { d: LeadDetail; onDone: () => void }) {
  const [f, setF] = useState({ status: '', rating: 0, comments: '', recording: '', newDate: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [ok, setOk] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api(`/portal/lead/${d.key}/feedback`, { body: { ...f, rating: f.rating || undefined } }); setOk(true); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  if (ok) return <Card><Done title="Thanks for the feedback" sub="It helps us book better calls for you."><Button onClick={onDone}>Back to the lead</Button></Done></Card>;
  return (
    <Card className="border-accent/50">
      <SectionHeader title={`Call with ${d.name}`} icon="star" right={<button className="min-h-10 px-2 text-sm text-muted hover:text-fg" onClick={onDone}>Cancel</button>} />
      <form onSubmit={submit} className="space-y-4">
        <Choice label="How did it go?" value={f.status as never} options={d.choices.status as never[]} onChange={(v) => setF({ ...f, status: v })} />
        {f.status === 'New Date' && <Field label="New call date"><input type="date" className={inputCls} value={f.newDate} onChange={(e) => setF({ ...f, newDate: e.target.value })} required /></Field>}
        <Stars value={f.rating} onChange={(rating) => setF({ ...f, rating })} />
        <Field label="Notes and next steps"><TextArea value={f.comments} onChange={(comments) => setF({ ...f, comments })} rows={3} /></Field>
        <Field label="Link to the call recording (optional)"><input type="url" inputMode="url" className={inputCls} placeholder="https://" value={f.recording} onChange={(e) => setF({ ...f, recording: e.target.value })} /></Field>
        {error && <ErrorBox error={error} />}
        <Button type="submit" tone="accent" size="lg" className="w-full" disabled={busy || !f.status || (f.status === 'New Date' && !f.newDate)}>{busy ? 'Sending…' : 'Send feedback'}</Button>
      </form>
    </Card>
  );
}

function DealForm({ d, onDone }: { d: LeadDetail; onDone: () => void }) {
  const [f, setF] = useState({ value: '', date: new Date().toISOString().slice(0, 10), type: '', why: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [ok, setOk] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api(`/portal/lead/${d.key}/deal`, { body: { ...f, value: Number(f.value) } }); setOk(true); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  if (ok) return <Card><Done title="Congratulations!" sub="The deal is recorded."><Button onClick={onDone}>Back to the lead</Button></Done></Card>;
  return (
    <Card className="border-good/50">
      <SectionHeader title={`Deal with ${d.name}`} icon="dollar" right={<button className="min-h-10 px-2 text-sm text-muted hover:text-fg" onClick={onDone}>Cancel</button>} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Deal value (USD)"><input type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} required /></Field>
        <Field label="Date the deal closed"><input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
        <Choice label="Deal type" value={f.type as never} options={d.choices.deal as never[]} onChange={(type) => setF({ ...f, type })} />
        <Field label="Why they said yes (optional)"><TextArea rows={3} value={f.why} onChange={(why) => setF({ ...f, why })} /></Field>
        {error && <ErrorBox error={error} />}
        <Button type="submit" tone="accent" size="lg" className="w-full" disabled={busy || f.value === '' || !f.type || !f.date}>{busy ? 'Saving…' : 'Record the deal'}</Button>
      </form>
    </Card>
  );
}
