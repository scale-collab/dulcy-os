// v3 (2026-11-26): pages under Home (our past calls, Book a call, all tasks) and the Account sheets
// (onboarding answers, documents, access & logins, billing, notifications, getting started, profile).
// Booked meetings and call feedback moved to the Leads tab (Leads.tsx, the "Meetings" chip).
import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Button, Card, cx, Empty, ErrorBox, go, Icon, Markdown, Pill, Progress, SectionHeader } from '../ui';
import { BackTo, Done, Field, Files, inputCls, money, niceDate, Page, TextArea, Updated, useLoad } from './kit';
import type { Bill, Doc, Note, OnbField, OurMeeting, Session, Task } from './types';

/* ---------- Under Home: our calls with you, booking, all tasks ---------- */
export function OurMeetings() {
  const s = useLoad<{ upcoming: OurMeeting[]; past: OurMeeting[]; readAt: string }>('/portal/our-meetings');
  return (
    <>
    <BackTo tab="home" />
    <Page title="Calls with Dulcy" sub="Our calls with you: summaries and recordings." right={<Button icon="calendar" onClick={() => go('schedule')}>Book a call</Button>} state={s}>
      {(d) => (
        <div className="space-y-6">
          {d.upcoming.length > 0 && <section><SectionHeader title="Coming up" icon="calendar" /><div className="space-y-3">{d.upcoming.map((m) => <MeetingCard key={m.key} m={m} />)}</div></section>}
          <section>
            <SectionHeader title={`Past meetings · ${d.past.length}`} icon="history" />
            {!d.past.length ? <Card><Empty icon="calendar" title="No meeting notes yet" sub="After each call with us, the summary shows up here." /></Card> : <div className="space-y-3">{d.past.map((m) => <MeetingCard key={m.key} m={m} />)}</div>}
          </section>
          <Updated at={d.readAt} />
        </div>
      )}
    </Page>
    </>
  );
}
function MeetingCard({ m }: { m: OurMeeting }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="font-semibold text-fg">{m.title}</div><div className="text-sm text-muted">{niceDate(m.day, { weekday: true }) || 'Date not set'}</div></div>
        {m.recording && <a href={m.recording} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-fg-2 hover:bg-hover"><Icon name="film" size={15} />Recording</a>}
      </div>
      {m.summary && (
        <div className="mt-3">
          <div className={cx('text-[15px]', !open && 'line-clamp-3')}><Markdown text={m.summary} /></div>
          {m.summary.length > 200 && <button onClick={() => setOpen(!open)} className="mt-1 min-h-10 text-sm font-semibold text-accent-ink">{open ? 'Show less' : 'Read the summary'}</button>}
        </div>
      )}
    </Card>
  );
}

export function Schedule({ session }: { session: Session }) {
  const url = session.go.meeting;
  return (
    <div>
      <BackTo tab="home" />
      <h1 className="mb-1 text-[26px] font-bold leading-tight tracking-tight text-fg sm:text-[28px]">Book a call with us</h1>
      <p className="mb-6 text-[15px] text-muted">Pick a time that suits you. The booking page opens in a new tab.</p>
      <Card className="max-w-xl">
        {url ? (
          <Empty icon="calendar" tone="good" title="Book time with your Dulcy team">
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 font-semibold text-accent-fg shadow-card hover:bg-accent-hover"><Icon name="calendar" size={18} />Open the booking page<Icon name="external" size={15} /></a>
          </Empty>
        ) : <Empty icon="calendar" title="Booking page coming soon" sub="For now, reply to any email from your Dulcy team and we will find a time." />}
      </Card>
    </div>
  );
}

/* ---------- Tasks & onboarding ---------- */
export function Tasks({ onChange }: { onChange?: () => void }) {
  const s = useLoad<{ tasks: Task[]; readAt: string }>('/portal/tasks');
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const done = async (t: Task) => {
    setBusy(t.key); setError('');
    try { await api(`/portal/task/${t.key}/done`, { body: {} }); s.setD((d) => d && { ...d, tasks: d.tasks.map((x) => (x.key === t.key ? { ...x, stage: 'done' as const } : x)) }); onChange?.(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  return (
    <>
    <BackTo tab="home" />
    <Page title="Tasks for you" sub="What we need from you. When you finish one, mark it done here." state={s}>
      {(d) => {
        const open = d.tasks.filter((t) => t.stage !== 'done'); const closed = d.tasks.filter((t) => t.stage === 'done');
        return (
          <div className="space-y-6">
            {error && <ErrorBox error={error} />}
            {!open.length ? <Card><Empty icon="check" tone="good" title="Nothing needed from you" sub="New requests from your Dulcy team show up here." /></Card> : (
              <div className="space-y-3">
                {open.map((t) => (
                  <Card key={t.key}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="text-[17px] font-semibold text-fg">{t.name}</span>{t.stage === 'blocked' && <Pill tone="warn">Blocked</Pill>}</div>
                        {t.details && <div className="mt-1 text-[15px]"><Markdown text={t.details} /></div>}
                        <Files files={t.files} />
                      </div>
                      <Button tone="accent" icon="check" disabled={busy === t.key} onClick={() => done(t)} className="w-full sm:w-auto">{busy === t.key ? 'Saving…' : 'Mark done'}</Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {closed.length > 0 && (
              <details className="group">
                <summary className="min-h-11 cursor-pointer list-none text-sm font-semibold text-muted"><Icon name="chevronRight" size={15} className="mr-1 inline transition group-open:rotate-90" />Done · {closed.length}</summary>
                <Card className="mt-2 divide-y divide-line p-0">{closed.map((t) => <div key={t.key} className="flex items-center gap-3 px-4 py-3 text-fg-2 sm:px-5"><Icon name="check" size={16} className="text-good" /><span className="min-w-0 flex-1 truncate line-through decoration-faint">{t.name}</span></div>)}</Card>
              </details>
            )}
            <Updated at={d.readAt} />
          </div>
        );
      }}
    </Page>
    </>
  );
}

export function Onboarding() {
  const s = useLoad<{ ready: boolean; fields: OnbField[] }>('/portal/onboarding');
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const groups = useMemo(() => { const m = new Map<string, OnbField[]>(); for (const f of s.d?.fields ?? []) m.set(f.group, [...(m.get(f.group) ?? []), f]); return [...m.entries()]; }, [s.d]);
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit || !s.d) return;
    const values = Object.fromEntries(Object.entries(edit).filter(([k, v]) => s.d!.fields.find((f) => f.key === k)?.value !== v));
    setBusy(true); setError('');
    try { await api('/portal/onboarding', { body: { values } }); s.setD({ ...s.d, fields: s.d.fields.map((f) => ({ ...f, value: edit[f.key] ?? f.value })) }); setEdit(null); setSaved(true); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Page title="Onboarding answers" sub="Your company, offer and ideal clients: what we build your campaigns from. Keep it up to date." state={s}
      right={s.d?.ready && !edit ? <Button icon="pen" onClick={() => { setSaved(false); setEdit(Object.fromEntries(s.d!.fields.map((f) => [f.key, f.value]))); }}>Edit answers</Button> : undefined}>
      {(d) => !d.ready ? <Card><Empty icon="file" title="Your onboarding form is not set up yet" sub="Your Dulcy team will add it. Then your answers show up here and you can update them." /></Card> : (
        <form onSubmit={save} className="space-y-6">
          {saved && <div role="status" className="rounded-xl border border-good/40 bg-good-soft px-4 py-3 text-sm font-medium text-good">Saved. Thank you!</div>}
          {groups.map(([g, fields]) => (
            <Card key={g}>
              <SectionHeader title={g} />
              <div className="space-y-4">
                {fields.map((f) => edit ? (
                  <Field key={f.key} label={f.label}>
                    {f.kind === 'long' ? <TextArea value={edit[f.key] ?? ''} onChange={(v) => setEdit({ ...edit, [f.key]: v })} />
                      : f.kind === 'select' ? (
                        <select className={inputCls} value={edit[f.key] ?? ''} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })}>
                          <option value="">Not set</option>{f.choices.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : <input className={inputCls} type={f.kind === 'url' ? 'url' : f.kind === 'email' ? 'email' : 'text'} value={edit[f.key] ?? ''} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />}
                  </Field>
                ) : (
                  <div key={f.key}><div className="text-sm font-medium text-muted">{f.label}</div><div className={cx('mt-0.5 whitespace-pre-wrap text-[15px] [overflow-wrap:anywhere]', f.value ? 'text-fg' : 'text-faint')}>{f.value || 'Not answered yet'}</div></div>
                ))}
              </div>
            </Card>
          ))}
          {edit && (
            <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur sm:flex-row sm:justify-end">
              {error && <div className="flex-1"><ErrorBox error={error} /></div>}
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button type="submit" tone="accent" disabled={busy}>{busy ? 'Saving…' : 'Save answers'}</Button>
            </div>
          )}
        </form>
      )}
    </Page>
  );
}

export function Pathway() {
  const s = useLoad<{ steps: { step: string; done: boolean }[]; done: number }>('/portal/pathway');
  return (
    <Page title="Getting started" sub="The road from signing up to your first meetings." state={s}>
      {(d) => (
        <Card className="max-w-2xl">
          <Progress done={d.done} total={d.steps.length} />
          <ol className="mt-5 space-y-1">
            {d.steps.map((x, i) => (
              <li key={x.step} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold', x.done ? 'bg-accent text-accent-fg' : 'border border-line-strong text-muted')}>{x.done ? <Icon name="check" size={16} strokeWidth={2.6} /> : i + 1}</span>
                <span className={cx('text-[15px]', x.done ? 'font-medium text-fg' : 'text-fg-2')}>{x.step}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </Page>
  );
}

/* ---------- Docs & access ---------- */
export function Documents() {
  const s = useLoad<{ documents: Doc[]; readAt: string }>('/portal/documents');
  const [who, setWho] = useState<'all' | 'dulcy' | 'you'>('all');
  return (
    <Page title="Documents" sub="Scripts, decks, case studies and everything else we share with each other." state={s}>
      {(d) => {
        const rows = d.documents.filter((x) => who === 'all' || x.by === who);
        return (
          <div className="space-y-4">
            <div role="radiogroup" aria-label="Shared by" className="inline-flex gap-1 rounded-xl border border-line bg-sunken p-1">
              {([['all', 'All'], ['dulcy', 'From Dulcy'], ['you', 'From you']] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={who === k} onClick={() => setWho(k)} className={cx('min-h-10 rounded-lg px-3 text-sm font-medium', who === k ? 'bg-surface text-fg shadow-card' : 'text-muted')}>{l}</button>)}
            </div>
            {!rows.length ? <Card><Empty icon="folder" title="No documents here yet" sub="Anything we share with you shows up here." /></Card> : (
              <div className="grid gap-3 md:grid-cols-2">
                {rows.map((x) => (
                  <Card key={x.key} className="flex flex-col">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-muted"><Icon name="file" size={18} /></span>
                      <div className="min-w-0 flex-1"><div className="font-semibold text-fg [overflow-wrap:anywhere]">{x.title}</div><div className="text-xs text-muted">{x.by === 'you' ? 'From you' : 'From Dulcy'}{x.updated && ` · ${niceDate(x.updated)}`}</div></div>
                    </div>
                    {x.details && <div className="mt-2 text-sm"><Markdown text={x.details} small /></div>}
                    <Files files={x.files} />
                  </Card>
                ))}
              </div>
            )}
            <p className="text-sm text-muted">To share a file with us, send it to your Dulcy team and we add it here.</p>
            <Updated at={d.readAt} />
          </div>
        );
      }}
    </Page>
  );
}

export function Access() {
  const s = useLoad<{ blocks: { label: string; text: string }[] }>('/portal/access');
  const [shown, setShown] = useState(false);
  return (
    <Page title="Access & logins" sub="The sending accounts, domains and tool logins we keep for you. Only people with your portal login can see this." state={s}>
      {(d) => !d.blocks.length ? <Card><Empty icon="key" title="No logins stored yet" sub="When we create sending accounts for you, their logins show up here." /></Card> : (
        <div className="space-y-4">
          {!shown ? (
            <Card className="flex flex-col items-center py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sunken text-muted"><Icon name="lock" size={26} /></span>
              <div className="mt-4 font-semibold text-fg">Logins are hidden</div>
              <div className="mt-1 max-w-sm text-sm text-muted">Make sure no one is looking at your screen.</div>
              <Button tone="accent" icon="key" className="mt-5" onClick={() => setShown(true)}>Show logins</Button>
            </Card>
          ) : d.blocks.map((b, i) => (
            <Card key={i}>
              {b.label && <SectionHeader title={b.label} icon="key" />}
              <div className="select-text text-[15px]"><Markdown text={b.text} /></div>
            </Card>
          ))}
          {shown && <Button icon="lock" onClick={() => setShown(false)}>Hide logins</Button>}
        </div>
      )}
    </Page>
  );
}

/* ---------- Billing ---------- */
export function Billing() {
  const s = useLoad<{ items: Bill[]; readAt: string }>('/portal/billing');
  return (
    <Page title="Billing" sub="Your invoices and payments." state={s}>
      {(d) => !d.items.length ? <Card><Empty icon="dollar" title="No invoices yet" /></Card> : (
        <>
          <Card className="divide-y divide-line p-0">
            {d.items.map((b) => (
              <div key={b.key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', b.state === 'Paid' ? 'bg-good-soft text-good' : b.state === 'Cancelled' ? 'bg-sunken text-muted' : 'bg-warn-soft text-warn')}><Icon name={b.state === 'Paid' ? 'check' : 'dollar'} size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-fg">{b.number || 'Invoice'}</div>
                  <div className="text-sm text-muted">{niceDate(b.day)}{b.from && b.to ? ` · for ${niceDate(b.from)} to ${niceDate(b.to)}` : ''}</div>
                </div>
                <div className="shrink-0 text-right"><div className="tabular font-semibold text-fg">{money(b.amount, b.currency)}</div><Pill tone={b.state === 'Paid' ? 'good' : b.state === 'Cancelled' ? 'plain' : 'warn'}>{b.state}</Pill></div>
              </div>
            ))}
          </Card>
          <p className="mt-3 text-sm text-muted">Questions about an invoice? Reply to any email from your Dulcy team.</p>
          <Updated at={d.readAt} />
        </>
      )}
    </Page>
  );
}

/* ---------- Notifications ---------- */
export function Notifications({ onChange }: { onChange: () => void }) {
  const s = useLoad<{ items: Note[]; readAt: string }>('/portal/notifications');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dismiss = async () => {
    setBusy(true); setError('');
    try { await api('/portal/notifications/dismiss', { body: {} }); s.setD((d) => d && { ...d, items: [] }); onChange(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Page title="Notifications" sub="What's new: tasks, leads, campaigns and meetings." state={s}
      right={s.d?.items.length ? <Button icon="check" disabled={busy} onClick={dismiss}>{busy ? 'Clearing…' : 'Dismiss all'}</Button> : undefined}>
      {(d) => (
        <div className="space-y-3">
          {error && <ErrorBox error={error} />}
          {!d.items.length ? <Card><Empty icon="bell" tone="good" title="You're all caught up" /></Card> : d.items.map((n) => (
            <Card key={n.key} className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Icon name={NOTE_ICON[n.kind] ?? 'bell'} size={18} /></span>
              <div className="min-w-0 flex-1"><div className="font-semibold text-fg">{n.title}</div>{n.message && <div className="mt-0.5 whitespace-pre-wrap text-[15px] text-fg-2">{n.message}</div>}<div className="mt-1 text-xs text-muted">{niceDate(n.date)}</div></div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
const NOTE_ICON: Record<string, string> = { Task: 'list', Lead: 'reply', Campaign: 'megaphone', 'Booked Meeting': 'calendar', Document: 'file', 'Call Feedback': 'star', System: 'bell' };

/* ---------- Account ---------- */
export function Profile({ session, onRenamed }: { session: Session; onRenamed: (name: string) => void }) {
  const [name, setName] = useState(session.user.name);
  const [pw, setPw] = useState({ current: '', password: '', password2: '' });
  const [msg, setMsg] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const run = async (what: 'name' | 'password', body: Record<string, string>) => {
    setBusy(what); setError(''); setMsg('');
    try { await api('/portal/account', { body }); if (what === 'name') onRenamed(name.trim()); else setPw({ current: '', password: '', password2: '' }); setMsg(what === 'name' ? 'Name saved.' : 'Password changed. Other devices are signed out.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-[26px] font-bold leading-tight tracking-tight text-fg sm:text-[28px]">Profile & password</h1>
      <p className="mb-6 text-[15px] text-muted">{session.user.email} · {session.client.name}</p>
      {msg && <Done title={msg} />}
      {error && <div className="mb-4"><ErrorBox error={error} /></div>}
      <Card className="mb-4">
        <SectionHeader title="Your name" icon="users" />
        <form onSubmit={(e) => { e.preventDefault(); run('name', { name }); }} className="space-y-3">
          <Field label="Name"><input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
          <Button type="submit" disabled={busy === 'name' || !name.trim() || name.trim() === session.user.name}>Save name</Button>
        </form>
      </Card>
      <Card>
        <SectionHeader title="Password" icon="lock" />
        <form onSubmit={(e) => { e.preventDefault(); run('password', pw); }} className="space-y-3">
          <Field label="Current password" hint="Leave empty if you sign in with Google and never set one."><input className={inputCls} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password" hint="At least 12 characters."><input className={inputCls} type="password" autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></Field>
          <Field label="New password again"><input className={inputCls} type="password" autoComplete="new-password" value={pw.password2} onChange={(e) => setPw({ ...pw, password2: e.target.value })} /></Field>
          <Button type="submit" disabled={busy === 'password' || pw.password.length < 12 || pw.password !== pw.password2}>Change password</Button>
        </form>
      </Card>
    </div>
  );
}
