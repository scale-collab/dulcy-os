// Inbox (Step 3): every reply thread, every client. Echo drafts; you Send, Send edited or Skip,
// the same buttons as the Decisions reply card. Everything is rendered as escaped text.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type InboxList, type InboxMsg, type InboxRow, type InboxTab, type InboxThread, type Note } from '../api';
import { findPlaceholders } from '../placeholders';
import { Avatar, BackLink, Button, Card, cx, Empty, ErrorBox, ExtLink, go, Icon, IconButton, Kbd, Label, PageSkeleton, PageTitle, Pill, setCount, timeAgo } from '../ui';

/** The inbox agent's face (renamed Echo by Alex; the face file is still the old name until the rename lands). */
const INBOX_FACE = 'Echo';

export const INBOX_TABS: { key: InboxTab; label: string; short: string; empty: string }[] = [
  { key: 'approve', label: 'To approve', short: 'To approve', empty: 'Nothing waiting for your OK. New drafts land here.' },
  { key: 'waiting', label: 'Waiting on prospect', short: 'Waiting', empty: 'No threads where we wrote last with a follow-up planned.' },
  { key: 'booked', label: 'Booked', short: 'Booked', empty: 'No meetings booked in the last 60 days.' },
  { key: 'handed', label: 'Handed to client', short: 'Handed', empty: 'No threads handed to a client in the last 30 days.' },
  { key: 'skipped', label: 'Skipped', short: 'Skipped', empty: 'Nothing skipped in the last 30 days.' },
];
const isTab = (t?: string): t is InboxTab => INBOX_TABS.some((x) => x.key === t);

const dateLabel = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '');

/** Problem → Data → Fix, one or two short lines each. */
export function NoteList({ notes, className }: { notes: Note[]; className?: string }) {
  if (!notes.length) return null;
  return (
    <ul className={cx('space-y-2', className)}>
      {notes.map((n) => (
        <li key={n.problem} className="flex gap-2.5 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm leading-snug">
          <Icon name="alert" size={16} className="mt-0.5 text-warn" />
          <div className="min-w-0">
            <div className="font-semibold text-fg">{n.problem}</div>
            <div className="mt-0.5 text-fg-2"><span className="text-muted">{n.data}</span>{n.fix && <><span aria-hidden="true" className="px-1.5 text-faint">→</span><span>{n.fix}</span></>}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Full page: #/inbox[/<tab>[/<client key>]]. */
export default function Inbox({ tab, client }: { tab?: string; client?: string }) {
  const t: InboxTab = isTab(tab) ? tab : 'approve';
  return <InboxPanel tab={t} client={client ?? ''} route={(nt, nc) => go(`inbox/${nt}${nc ? `/${encodeURIComponent(nc)}` : ''}`)} />;
}

/** The list (also the client hub's Inbox tab, with fixedClient). */
export function InboxPanel({ tab, client, route, fixedClient }: { tab: InboxTab; client: string; route: (tab: InboxTab, client: string) => void; fixedClient?: { key: string; name: string } }) {
  const [d, setD] = useState<InboxList | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const key = fixedClient?.key ?? client;
  const load = useCallback((refresh = false) => {
    setBusy(true); setError('');
    const qs = new URLSearchParams({ tab, page: String(page), ...(key ? { client: key } : {}), ...(search ? { q: search } : {}), ...(refresh ? { refresh: '1' } : {}) });
    api<InboxList>(`/inbox?${qs}`).then((x) => { setD(x); if (!key) setCount('inbox', x.counts.approve); }).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, [tab, page, key, search]);
  useEffect(() => load(), [load]);
  useEffect(() => setPage(1), [tab, key, search]);
  useEffect(() => { const h = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(h); }, [q]);

  const info = INBOX_TABS.find((x) => x.key === tab)!;
  const header = fixedClient ? null : (
    <PageTitle title="Inbox" kicker={d ? `${d.counts.approve} to approve${client && d.rows[0] ? ` · ${d.clients.find((c) => c.key === client)?.name ?? d.rows[0].client}` : ''}` : 'Every reply, every client'}
      sub="Echo drafts every answer. You send, edit or skip." />
  );
  return (
    <div>
      {header}
      <div role="tablist" aria-label="Inbox tabs" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {INBOX_TABS.map((x) => {
          const on = x.key === tab, n = d?.counts[x.key];
          return (
            <button key={x.key} role="tab" aria-selected={on} onClick={() => route(x.key, client)}
              className={cx('flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition', on ? 'bg-ink text-ink-fg shadow-card' : 'text-muted hover:bg-hover hover:text-fg')}>
              <span className="sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.label}</span>
              {n !== undefined && <span className={cx('tabular rounded-full px-1.5 text-xs', on ? 'bg-ink-fg/15' : 'bg-sunken border border-line text-fg-2', x.key === 'approve' && n > 0 && !on && 'bg-accent text-accent-fg border-transparent')}>{n}</span>}
            </button>
          );
        })}
      </div>

      {!fixedClient && d && d.clients.length > 1 && (
        <div aria-label="Filter by client" className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none]">
          <Chip on={!client} onClick={() => route(tab, '')}>All clients</Chip>
          {d.clients.map((c) => <Chip key={c.key} on={client === c.key} onClick={() => route(tab, client === c.key ? '' : c.key)}>{c.name} <span className="tabular opacity-70">{c.count}</span></Chip>)}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Search prospects</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, words" maxLength={100}
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft" />
        </label>
        {<IconButton icon="refresh" label="Refresh" onClick={() => load(true)} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />}
      </div>

      {error && <div className="mt-4"><ErrorBox error={error} retry={() => load()} /></div>}
      {!d && !error && <div className="mt-4"><PageSkeleton kind="list" /></div>}
      {d && (
        <>
          <NoteList notes={d.notes} className="mt-4" />
          <Card className="mt-4 overflow-hidden p-0">
            {d.rows.length ? (
              <ul className="divide-y divide-line">
                {d.rows.map((r) => <Row key={r.id} r={r} showClient={!fixedClient && !client} />)}
              </ul>
            ) : <Empty icon={tab === 'approve' ? 'check' : 'inbox'} tone={tab === 'approve' ? 'good' : 'plain'} title={search ? 'No match' : tab === 'approve' ? 'All clear' : `No threads in ${info.label}`} sub={search ? `Nothing in ${info.label} matches "${search}".` : info.empty} />}
          </Card>
          {d.pages > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm text-muted">
              <Button disabled={d.page <= 1} onClick={() => setPage(d.page - 1)} icon="arrowLeft">Newer</Button>
              <span className="tabular">Page {d.page} of {d.pages} · {d.total}</span>
              <Button disabled={d.page >= d.pages} onClick={() => setPage(d.page + 1)}>Older<Icon name="arrowRight" size={17} /></Button>
            </div>
          )}
          <p className="mt-4 text-xs text-muted">From Airtable (Emails), read {timeAgo(d.readAt) || 'just now'}; kept for 1 minute.</p>
        </>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} aria-pressed={on} className={cx('inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition', on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-fg-2 hover:bg-hover')}>{children}</button>;
}

function RowPills({ r }: { r: InboxRow }) {
  return (
    <>
      {r.followup > 0 && <Pill tone="info">Follow-up {r.followup}{r.followupType === 'Out of Office' ? ' · back from OOO' : ''}</Pill>}
      {r.pressed && <Pill tone="good" icon={r.pressed === 'Skip' ? 'x' : 'send'}>{r.pressed === 'Skip' ? 'Skipping…' : 'Sending…'}</Pill>}
      {!r.pressed && r.error && <Pill tone="bad" icon="alert">Not sent</Pill>}
      {r.bookingLink && !r.pressed && <Pill tone="warn" icon="link">Link, not times</Pill>}
      {r.booksAt && <Pill tone="accent" icon="calendar">Books {r.booksAt}</Pill>}
      {r.bookedLine && <Pill tone="good" icon="calendar">{r.bookedLine}</Pill>}
      {r.gap && !r.pressed && <Pill tone="warn">Needs a fact</Pill>}
    </>
  );
}

function Row({ r, showClient }: { r: InboxRow; showClient: boolean }) {
  const when = r.tab === 'waiting' ? (r.nextFollowUp ? `follow-up ${dateLabel(r.nextFollowUp)}` : 'no date') : r.tab === 'booked' && r.bookedAt ? `booked ${dateLabel(r.bookedAt)}` : timeAgo(r.at);
  return (
    <li>
      <button onClick={() => go(`thread/${r.id}`)} className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-hover sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 break-words text-[15px] font-semibold text-fg sm:truncate">{r.prospect}{r.company && <span className="font-normal text-muted"> · {r.company}</span>}</div>
            <span className={cx('tabular shrink-0 text-xs', r.tab === 'waiting' ? 'font-medium text-fg-2' : 'text-muted')}>{when}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {showClient && <Pill>{r.client}</Pill>}
            {r.intent && <Pill tone={/interest|meeting|info/i.test(r.intent) ? 'accent' : 'plain'}>{r.intent}</Pill>}
            <RowPills r={r} />
          </div>
          {r.theySaid && <div className="mt-1.5 line-clamp-2 text-sm leading-snug text-fg-2 sm:line-clamp-1"><span className="text-muted">They said: </span>{r.theySaid}</div>}
        </div>
        <Icon name="chevronRight" size={18} className="mt-1 text-faint group-hover:text-muted" />
      </button>
    </li>
  );
}

// ---------- Thread ----------
const BOOKING = /https?:\/\/[^\s)>\]"']*(?:calendly\.com|cal\.com|hubspot\.com\/meetings|meetings[^\s/]*\.hubspot\.com|leadconnectorhq\.com\/widget\/booking|savvycal\.com|zcal\.co|tidycal\.com|acuityscheduling\.com|youcanbook\.me|calendar\.app\.google|calendar\.google\.com\/calendar\/appointments)/i;

export function ThreadPage({ id }: { id: string }) {
  const [t, setT] = useState<InboxThread | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<InboxThread>(`/inbox/${encodeURIComponent(id)}`).then(setT).catch((e) => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  const back = <BackLink label="Inbox" onClick={() => (window.history.length > 1 ? window.history.back() : go('inbox'))} />;
  if (error && !t) return <div className="mx-auto max-w-3xl">{back}<ErrorBox error={error} retry={load} /></div>;
  if (!t) return <div className="mx-auto max-w-3xl">{back}<PageSkeleton kind="deck" /></div>;
  return <div className="mx-auto max-w-3xl">{back}<ThreadBody key={t.row.id} t={t} reload={load} /></div>;
}

type Done = '' | 'sent' | 'edited' | 'skipped';
function ThreadBody({ t, reload }: { t: InboxThread; reload: () => void }) {
  const r = t.row;
  const [draft, setDraft] = useState(t.draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done>('');
  const box = useRef<HTMLTextAreaElement>(null);
  const edited = draft.trim() !== t.draft.trim();
  const live = useMemo(() => { const holes = findPlaceholders(draft); return { link: BOOKING.test(draft), gap: holes.length > 0, holes }; }, [draft]);
  const act = t.canAct && !done;
  // The reply box grows with the text (no inner scroll on a phone).
  useEffect(() => { const b = box.current; if (b) { b.style.height = 'auto'; b.style.height = `${Math.min(b.scrollHeight + 2, 900)}px`; } }, [draft, act]);

  const send = useCallback(async (verdict: 'approve' | 'edited' | 'reject') => {
    if (busy || !act) return;
    if (verdict === 'edited' && !draft.trim()) { setError('The reply is empty.'); return; }
    setBusy(true); setError('');
    try {
      await api(`/inbox/${r.id}`, { body: verdict === 'edited' ? { verdict, text: draft } : { verdict } });
      setDone(verdict === 'reject' ? 'skipped' : verdict === 'edited' ? 'edited' : 'sent');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [busy, act, draft, r.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ['TEXTAREA', 'INPUT', 'SELECT'].includes(el.tagName)) { if (e.key === 'Escape') el.blur(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'a' && !live.gap) void send(edited ? 'edited' : 'approve');
      else if (k === 'r') void send('reject');
      else if (k === 'e' && box.current) { e.preventDefault(); const b = box.current; b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send, edited, live.gap]);

  const status = r.tab === 'waiting' ? `We wrote last. Next follow-up ${t.dueAt ? dateLabel(t.dueAt) : 'not set'}.`
    : r.tab === 'booked' ? `Booked${r.bookedAt ? ` ${dateLabel(r.bookedAt)}` : ''}.` : r.tab === 'handed' ? 'The client handles this thread; Dulcy does not send here.'
    : r.tab === 'skipped' ? 'Skipped: nothing was sent.' : r.state === 'Sent' ? `Sent${t.sentAt ? ` ${timeAgo(t.sentAt)}` : ''}.` : '';

  return (
    <>
      <Card className="p-0 anim-in">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-xl font-semibold leading-snug tracking-tight text-fg sm:text-2xl">{r.prospect}{r.company && <span className="font-normal text-muted"> · {r.company}</span>}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Pill>{r.client}</Pill>
              {r.intent && <Pill tone="accent">{r.intent}</Pill>}
              <RowPills r={{ ...r, pressed: done ? (done === 'skipped' ? 'Skip' : 'Approve Draft') : r.pressed, bookingLink: false, gap: false }} />
              <span className="text-xs text-muted">{timeAgo(r.at)}</span>
            </div>
            {(t.subject || r.email) && <div className="mt-1.5 break-words text-xs text-muted [overflow-wrap:anywhere] sm:truncate">{[r.email, t.subject && `“${t.subject}”`].filter(Boolean).join(' · ')}</div>}
          </div>
          {t.threadUrl && <ExtLink href={t.threadUrl} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm"><Icon name="external" size={14} /><span className="hidden sm:inline">Open in EmailBison</span><span className="sm:hidden">EmailBison</span></ExtLink>}
        </div>

        <div className="px-5 pb-6 pt-5 sm:px-6">
          {r.bookedLine && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-good-soft px-4 py-3 text-sm font-medium text-good">
              <Icon name="calendar" size={15} />{r.bookedLine}
              {r.bookedUrl && <a href={r.bookedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center underline underline-offset-2">Open</a>}
            </div>
          )}
          {status && <div className="mb-4 rounded-xl bg-sunken px-4 py-3 text-sm text-fg-2">{status}</div>}
          <NoteList notes={done ? [] : t.notes} className="mb-4" />

          <Label>Their latest message</Label>
          <div className="mt-2 whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-line bg-sunken px-4 py-3.5 text-base leading-relaxed text-fg">{t.latest || r.theySaid || '(empty)'}</div>

          {(t.reason || t.question) && (
            <div className="mt-4 space-y-2">
              {t.reason && (
                <div className="flex gap-2.5 rounded-xl bg-info-soft px-4 py-3 text-sm leading-relaxed text-fg-2">
                  <Avatar name={INBOX_FACE} size="xs" className="mt-0.5" />
                  <div className="min-w-0"><span className="font-semibold text-info">Echo · why this reply: </span><span className="whitespace-pre-wrap">{t.reason}</span></div>
                </div>
              )}
              {t.question && <div className="flex gap-2.5 rounded-xl bg-warn-soft px-4 py-3 text-sm leading-relaxed text-fg-2"><Icon name="alert" size={16} className="mt-0.5 text-warn" /><div><span className="font-semibold text-warn">Echo needs from you: </span>{t.question}</div></div>}
            </div>
          )}

          {(t.draft || t.canAct) && (
            <div className="mt-6">
              <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Label>{act ? 'Your reply' : 'Draft'}</Label>{edited && <Pill tone="accent" icon="pen">edited</Pill>}</div>
                {edited && act && <button onClick={() => setDraft(t.draft)} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-fg"><Icon name="undo" size={13} />Undo edits</button>}
              </div>
              {t.offeredTimes.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm"><span className="font-medium text-fg-2">Offered times:</span>{t.offeredTimes.map((x) => <Pill key={x} tone="good" icon="clock">{x}</Pill>)}</div>
              )}
              {act ? (
                <textarea ref={box} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Reply" rows={Math.min(16, Math.max(5, draft.split('\n').length + 1))}
                  className="w-full resize-y rounded-2xl rounded-tr-md border border-accent/40 bg-accent-soft/40 px-4 py-3.5 text-base leading-relaxed text-fg outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent-soft" />
              ) : <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md border-l-2 border-accent bg-accent-soft/40 px-4 py-3.5 text-base leading-relaxed text-fg">{done === 'edited' ? draft : t.draft || '(no draft)'}</div>}
              {act && edited && live.link && <p className="mt-2 flex items-center gap-1.5 text-sm text-warn"><Icon name="link" size={14} />Still a booking link: two specific times book far more calls.</p>}
              {act && live.gap && <p className="mt-2 flex items-center gap-1.5 text-sm text-warn"><Icon name="alert" size={14} />Replace this before sending: {live.holes.slice(0, 3).join(', ')}</p>}
            </div>
          )}
          {error && <div className="mt-4"><ErrorBox error={error} /></div>}
        </div>
      </Card>

      {done && (
        <Card className="mt-4 flex flex-col items-center gap-3 py-6 text-center anim-in">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-fg"><Icon name={done === 'skipped' ? 'x' : 'check'} size={24} strokeWidth={2.4} /></span>
          <div className="text-lg font-semibold">{done === 'skipped' ? 'Skipped. Nothing is sent.' : done === 'edited' ? 'Your edit goes out within a minute.' : 'It goes out within a minute.'}</div>
          <div className="text-sm text-muted">The engine sends from the right inbox, then closes the decision.</div>
          <div className="mt-1 flex gap-2"><Button onClick={() => go('inbox')} icon="inbox">Back to Inbox</Button><Button onClick={reload} icon="refresh">Refresh</Button></div>
        </Card>
      )}

      {act && (
        <>
          <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-4 bg-bg/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:bottom-0 md:mx-0 md:rounded-2xl md:px-0">
            <div className="grid grid-cols-[1fr_1.4fr] gap-2">
              <Button tone="danger" disabled={busy} onClick={() => void send('reject')} icon="x" kbd="R">Skip reply</Button>
              <Button tone="accent" disabled={busy || live.gap} onClick={() => void send(edited ? 'edited' : 'approve')} icon="send" kbd="A">{busy ? 'Saving…' : edited ? 'Send edited' : 'Send'}</Button>
            </div>
          </div>
          <div className="mt-2 hidden items-center justify-center gap-3 text-xs text-muted md:flex">
            <Icon name="keyboard" size={15} /><span className="flex items-center gap-1"><Kbd>A</Kbd> send</span><span className="flex items-center gap-1"><Kbd>R</Kbd> skip reply</span><span className="flex items-center gap-1"><Kbd>E</Kbd> edit</span><span className="flex items-center gap-1"><Kbd>Esc</Kbd> stop editing</span>
          </div>
        </>
      )}

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon name="history" size={16} className="text-muted" />Earlier in the thread · {t.messages.length}</h2>
        {t.messages.length ? <div className="space-y-2.5">{t.messages.map((m, i) => <Message key={i} m={m} />)}</div>
          : <Card className="text-sm text-muted">No earlier messages saved on this thread. Open it in EmailBison for the full history.</Card>}
        {t.campaign && <p className="mt-3 text-xs text-muted">Campaign: {t.campaign}</p>}
      </section>
    </>
  );
}

function Message({ m }: { m: InboxMsg }) {
  const [open, setOpen] = useState(false);
  const us = m.who === 'us';
  return (
    <div className={cx('rounded-2xl border px-4 py-3', us ? 'border-accent/25 bg-accent-soft/30 sm:ml-10' : 'border-line bg-surface sm:mr-10')}>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs font-semibold text-muted"><span className={us ? 'text-accent-ink' : 'text-fg-2'}>{us ? 'Us' : m.who === 'them' ? 'Them' : 'Message'}</span>{m.head && m.head !== 'Us' && m.head !== 'Prospect' && <span className="font-normal">{m.head}</span>}</div>
      {m.body && <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg">{m.body}</div>}
      {m.quoted && (
        <>
          <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-muted hover:text-fg">{open ? 'Hide quoted text' : 'Show quoted text'}<Icon name="chevronDown" size={13} className={cx('transition', open && 'rotate-180')} /></button>
          {open && <div className="mt-1 whitespace-pre-wrap break-words border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-muted">{m.quoted}</div>}
        </>
      )}
    </div>
  );
}
