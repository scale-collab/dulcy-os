// Leads & pipeline (Softr: Pipeline, Lead Details Full, Close a Deal, Call Feedback Form, Emails details).
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { BackLink, Button, Card, cx, Empty, ErrorBox, go, Icon, Pill, SectionHeader } from '../ui';
import { Choice, Done, Field, Initial, inputCls, money, niceDate, num, Page, Quote, Segmented, StarRow, Stars, TextArea, Updated, useLoad } from './kit';
import type { Lead, LeadDetail, Pipeline as PipelineT } from './types';

const STAGE_TONE: Record<string, 'accent' | 'good' | 'info' | 'warn' | 'plain'> = {
  'New Interested': 'info', 'In Conversation': 'info', 'Booked Meeting': 'accent', 'Completed Meeting': 'accent', 'Closed Deal': 'good', 'Closed -- Not Moving Forward': 'plain', Lost: 'plain',
};
const stageLabel = (s: string) => (s === 'Closed -- Not Moving Forward' ? 'Not moving forward' : s);

export function Pipeline() {
  const s = useLoad<PipelineT>('/portal/pipeline');
  return (
    <Page title="Pipeline" sub="Every lead we found for you, from the first yes to a closed deal (last 12 months)." state={s} kind="board">
      {(d) => {
        if (!d.total) return <Card><Empty icon="reply" title="No leads yet" sub="When a prospect says yes, they show up here." /></Card>;
        const shown = d.stages.filter((x) => x.leads.length || ['New Interested', 'Booked Meeting', 'Completed Meeting', 'Closed Deal'].includes(x.stage));
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['New Interested', 'Booked Meeting', 'Completed Meeting', 'Closed Deal'] as const).map((st) => (
                <Card key={st} className="p-4"><div className="text-xs text-muted">{stageLabel(st)}</div><div className={cx('tabular mt-1 text-2xl font-bold', st === 'Closed Deal' ? 'text-good' : 'text-fg')}>{num(d.stages.find((x) => x.stage === st)?.leads.length ?? 0)}</div></Card>
              ))}
            </div>
            {d.deals.count > 0 && <p className="text-sm text-fg-2"><Icon name="dollar" size={15} className="mr-1 inline text-good" />{d.deals.count} deal{d.deals.count === 1 ? '' : 's'} closed, worth {money(d.deals.value)} (as you recorded them).</p>}
            <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4">
              {shown.map((col) => (
                <section key={col.stage} className="w-[82%] shrink-0 snap-start md:w-auto">
                  <SectionHeader title={<>{stageLabel(col.stage)} <span className="tabular font-normal text-muted">{col.leads.length}</span></>} />
                  <div className="space-y-2">
                    {!col.leads.length && <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">None yet</div>}
                    {col.leads.slice(0, 30).map((l) => (
                      <Card key={l.key} className="p-3" onClick={() => go(`lead/${l.key}`)} label={`${l.name}, ${stageLabel(l.stage)}`}>
                        <div className="flex items-start gap-2.5">
                          <Initial name={l.name} className="h-8 w-8 text-xs" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-fg">{l.name}</div>
                            <div className="truncate text-xs text-muted">{l.company || '–'}</div>
                            <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
                              {l.bookedOn ? <span>Booked {niceDate(l.bookedOn)}</span> : l.date ? <span>Replied {niceDate(l.date)}</span> : null}
                              {l.feedback && <Pill tone="good">Feedback given</Pill>}
                              {l.deal && <Pill tone="good" icon="dollar">Deal</Pill>}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                    {col.leads.length > 30 && <div className="text-center text-xs text-muted">+{col.leads.length - 30} more in Leads</div>}
                  </div>
                </section>
              ))}
            </div>
            <Updated at={d.readAt} />
          </div>
        );
      }}
    </Page>
  );
}

type LeadFilter = 'all' | 'booked' | 'sent';
export function Leads() {
  const s = useLoad<{ leads: Lead[]; days: number; readAt: string }>('/portal/leads');
  const [f, setF] = useState<LeadFilter>('all');
  return (
    <Page title="Leads" sub={`People who said yes in the last ${s.d?.days ?? 90} days: meetings booked, and leads sent to you to follow up.`} state={s}>
      {(d) => {
        const counts = { all: d.leads.length, booked: d.leads.filter((l) => l.status === 'booked').length, sent: d.leads.filter((l) => l.status === 'sent').length };
        const rows = d.leads.filter((l) => f === 'all' || l.status === f);
        return (
          <div>
            <div className="mb-4"><Segmented label="Show" value={f} onChange={setF} options={[['all', <>All <span className="tabular text-muted">{counts.all}</span></>], ['booked', <>Booked <span className="tabular text-muted">{counts.booked}</span></>], ['sent', <>Sent to you <span className="tabular text-muted">{counts.sent}</span></>]] as const} /></div>
            {!rows.length ? <Card><Empty icon="reply" title="No leads here yet" sub="When a prospect says yes, they show up here." /></Card> : (
              <div className="grid gap-3 lg:grid-cols-2">
                {rows.map((l) => (
                  <Card key={l.key} className="flex flex-col p-4 sm:p-5" onClick={() => go(`lead/${l.key}`)} label={l.name}>
                    <div className="flex items-start gap-3">
                      <Initial name={l.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-semibold text-fg [overflow-wrap:anywhere]">{l.name}</span>{l.status === 'booked' ? <Pill tone="accent" icon="check">Meeting booked</Pill> : <Pill tone="info" icon="arrowRight">Sent to you</Pill>}</div>
                        {l.company && <div className="text-sm text-fg-2">{l.company}</div>}
                        <div className="mt-0.5 text-xs text-muted">{l.status === 'booked' && l.bookedOn ? `Booked ${niceDate(l.bookedOn)}` : `Replied ${niceDate(l.date)}`}</div>
                      </div>
                    </div>
                    {l.message && <Quote>{l.message.length > 280 ? `${l.message.slice(0, 279)}…` : l.message}</Quote>}
                  </Card>
                ))}
              </div>
            )}
            <Updated at={d.readAt} />
          </div>
        );
      }}
    </Page>
  );
}

export function LeadPage({ id }: { id: string }) {
  const s = useLoad<LeadDetail>(`/portal/lead/${encodeURIComponent(id)}`);
  const [form, setForm] = useState<'feedback' | 'deal' | null>(null);
  return (
    <div>
      <BackLink label="Pipeline" onClick={() => go('pipeline')} />
      <Page title={s.d?.name ?? 'Lead'} kicker={s.d?.company} state={s}>
        {(d) => (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-4">
              <Card>
                <div className="flex flex-wrap items-center gap-2"><Pill tone={STAGE_TONE[d.stage] ?? 'plain'}>{stageLabel(d.stage)}</Pill>{d.bookedOn && <span className="text-sm text-muted">Meeting booked {niceDate(d.bookedOn)}</span>}</div>
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
            <aside className="space-y-4">
              {form === 'feedback' ? <FeedbackForm d={d} onDone={() => { setForm(null); s.load(); }} />
                : form === 'deal' ? <DealForm d={d} onDone={() => { setForm(null); s.load(); }} />
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
