// Inbox (Step 3): every reply thread, every client. Echo drafts; you Send, Send edited or Skip,
// the same buttons as the Decisions reply card. Everything is rendered as escaped text.
// Inbox round (2026-11-28): the thread reads as one conversation (Email 1 / 2 / 3, the prospect's
// messages apart from ours, quoted text folded, newest at the bottom, Echo's draft last), each
// client's AI replier mode and settings link, "Old drafts with a link" (Have Echo redo it), Echo live.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type EchoLive, type InboxList, type InboxRow, type InboxTab, type InboxThread, type LinkDraftRow, type LinkDraftsReport, type Note, type RedoResult, type ReplierMode, type ThreadMsg } from '../api';
import { findPlaceholders } from '../placeholders';
import { slashDate, slashDateTime } from '../dates';
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

/** Dates in HQ use slashes (11/27). */
const dateLabel = (iso: string | null | undefined) => (iso ? slashDate(iso) : '');

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

/** Full page: #/inbox[/<tab>[/<client key>]]; #/inbox/links[/<client key>] = Old drafts with a link. */
export default function Inbox({ tab, client }: { tab?: string; client?: string }) {
  const links = tab === 'links';
  const t: InboxTab = isTab(tab) ? tab : 'approve';
  return <InboxPanel tab={t} links={links} client={client ?? ''} route={(nt, nc) => go(`inbox/${nt}${nc ? `/${encodeURIComponent(nc)}` : ''}`)} />;
}

/** The list (also the client hub's Inbox tab, with fixedClient). */
export function InboxPanel({ tab, client, route, fixedClient, links }: { tab: InboxTab; client: string; route: (tab: InboxTab | 'links', client: string) => void; fixedClient?: { key: string; name: string }; links?: boolean }) {
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
  const here = d?.replierClients.find((c) => c.key === key);
  const header = fixedClient ? null : (
    <PageTitle title="Inbox" kicker={d ? `${d.counts.approve} to approve${client && d.rows[0] ? ` · ${d.clients.find((c) => c.key === client)?.name ?? d.rows[0].client}` : ''}` : 'Every reply, every client'}
      sub="Echo drafts every answer. You send, edit or skip."
      right={d ? <ReplierLinks clients={d.replierClients} current={here} /> : undefined} />
  );
  return (
    <div>
      {header}
      {!fixedClient && <EchoLiveStrip />}
      {fixedClient && here && <div className="mb-3 flex justify-end"><ReplierLinks clients={[]} current={here} /></div>}
      <div role="tablist" aria-label="Inbox tabs" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {INBOX_TABS.map((x) => {
          const on = x.key === tab && !links, n = d?.counts[x.key];
          return (
            <button key={x.key} role="tab" aria-selected={on} onClick={() => route(x.key, client)}
              className={cx('flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition', on ? 'bg-ink text-ink-fg shadow-card' : 'text-muted hover:bg-hover hover:text-fg')}>
              <span className="sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.label}</span>
              {n !== undefined && <span className={cx('tabular rounded-full px-1.5 text-xs', on ? 'bg-ink-fg/15' : 'bg-sunken border border-line text-fg-2', x.key === 'approve' && n > 0 && !on && 'bg-accent text-accent-fg border-transparent')}>{n}</span>}
            </button>
          );
        })}
      </div>

      {!fixedClient && d && d.clients.length > 1 && !links && (
        <div aria-label="Filter by client" className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none]">
          <Chip on={!client} onClick={() => route(tab, '')}>All clients</Chip>
          {d.clients.map((c) => <Chip key={c.key} on={client === c.key} onClick={() => route(tab, client === c.key ? '' : c.key)}>{c.name} <span className="tabular opacity-70">{c.count}</span></Chip>)}
        </div>
      )}

      {!fixedClient && d && (tab === 'approve' || links) && (d.linkDrafts > 0 || links) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Filter:</span>
          <Chip on={!!links} onClick={() => route(links ? 'approve' : 'links', client)}><Icon name="link" size={13} />Old drafts with a link <span className="tabular opacity-70">{d.linkDrafts}</span></Chip>
        </div>
      )}

      {links ? <LinkDraftsPanel client={key} /> : (
        <>
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
        </>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} aria-pressed={on} className={cx('inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition', on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-fg-2 hover:bg-hover')}>{children}</button>;
}

/** "Replier settings": a direct link for the client in view, else a small menu of every client. */
function ReplierLinks({ clients, current }: { clients: { key: string; name: string; wsRec: string }[]; current?: { name: string; wsRec: string } }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (current) return <Button icon="wrench" onClick={() => go(`clients/${current.wsRec}/replier`)} className="min-h-10 px-3 text-sm">Replier settings<span className="hidden sm:inline">&nbsp;· {current.name}</span></Button>;
  if (!clients.length) return null;
  return (
    <div ref={box} className="relative">
      <Button icon="wrench" onClick={() => setOpen((v) => !v)} className="min-h-10 px-3 text-sm">Replier settings<Icon name="chevronDown" size={14} className={cx('transition', open && 'rotate-180')} /></Button>
      {open && (
        <ul role="menu" aria-label="AI replier settings per client" className="absolute right-0 z-30 mt-1.5 max-h-80 w-64 overflow-y-auto max-sm:left-0 max-sm:right-auto max-sm:max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-1 shadow-pop">
          {clients.map((c) => (
            <li key={c.key}><button role="menuitem" onClick={() => go(`clients/${c.wsRec}/replier`)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm text-fg hover:bg-hover">{c.name}<Icon name="chevronRight" size={15} className="text-faint" /></button></li>
          ))}
        </ul>
      )}
    </div>
  );
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

// ---------- Echo live (read only) ----------
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function EchoLiveStrip() {
  const [d, setD] = useState<EchoLive | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let stop = false;
    const tick = () => api<EchoLive>('/inbox/live').then((x) => { if (!stop) { setD(x); setError(''); } }).catch((e) => !stop && setError(e.message));
    tick();
    const h = window.setInterval(tick, 60_000);
    return () => { stop = true; window.clearInterval(h); };
  }, []);
  if (!d) return error ? <div className="mb-3 text-xs text-muted">Echo live: {error}</div> : null;
  const c = d.counts;
  const did = [c.drafted && plural(c.drafted, 'draft') + ' written', c.needInput && `${c.needInput} need${c.needInput === 1 ? 's' : ''} your input`, c.noReply && `${c.noReply} no reply needed`, c.leftToClient && `${c.leftToClient} left to the client`, c.redone && `${c.redone} redone`].filter(Boolean) as string[];
  const lastRun = [...d.lastRuns].sort((a, b) => b.at.localeCompare(a.at))[0];
  return (
    <section aria-label="Echo live" className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-dot-good opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-dot-good" /></span>
          <Avatar name={INBOX_FACE} size="xs" />Echo · last hour
        </span>
        <span className="text-sm text-fg-2">{did.length ? did.join(' · ') : 'No new drafts'}</span>
        <span className="text-sm text-fg-2"><span className="font-semibold text-fg tabular">{d.waiting}</span> waiting for approval{d.waitingOldest ? ` (oldest ${timeAgo(d.waitingOldest)})` : ''}</span>
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-fg">{open ? 'Hide' : 'What Echo did'}<Icon name="chevronDown" size={13} className={cx('transition', open && 'rotate-180')} /></button>
      </div>
      {c.dryRun > 0 && <p className="mt-1.5 text-xs text-warn">{plural(c.dryRun, 'run')} in dry run: Echo is not switched live, nothing was written.</p>}
      {open && (
        <div className="mt-3 border-t border-line pt-3">
          {d.recent.length ? (
            <ul className="space-y-1.5">
              {d.recent.map((x) => (
                <li key={`${x.id}${x.at}`}>
                  <button onClick={() => go(`thread/${x.id}`)} className="flex w-full min-w-0 items-baseline gap-2 rounded-lg px-1 py-1 text-left text-sm hover:bg-hover">
                    <span className="tabular w-16 shrink-0 text-xs text-muted">{timeAgo(x.at)}</span>
                    <span className="min-w-0 flex-1 truncate"><span className="font-medium text-fg">{x.prospect || 'A prospect'}</span>{x.client && <span className="text-muted"> · {x.client}</span>}<span className="text-fg-2"> · {LIVE_ACTION[x.action] ?? x.action}{x.kind === 'followup' ? ' (follow-up)' : x.kind === 'redo' ? ' (redo)' : ''}</span></span>
                    {x.waiting && <Pill tone="accent">waiting</Pill>}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Nothing in the last hour.</p>}
          {d.lastRuns.length > 0 && <p className="mt-2 text-xs text-muted">{d.lastRuns.map((r) => `${r.kind}: last run ${timeAgo(r.at)} (${r.status}${r.dryRun ? ', dry run' : ''})`).join(' · ')}</p>}
        </div>
      )}
      {!open && lastRun && <p className="mt-1 text-xs text-muted">Last run {timeAgo(lastRun.at)}. Read only; refreshes every minute.</p>}
    </section>
  );
}
const LIVE_ACTION: Record<string, string> = { reply: 'draft written', ask_alex: 'needs your input', skip: 'no reply needed', client_off: 'left to the client', complete: 'follow-ups finished', answered: 'they answered' };

// ---------- Old drafts with a link (read only report + Have Echo redo it) ----------
function LinkDraftsPanel({ client }: { client: string }) {
  const [d, setD] = useState<LinkDraftsReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback((refresh = false) => {
    setError('');
    api<LinkDraftsReport>(`/inbox/link-drafts?${new URLSearchParams({ ...(client ? { client } : {}), ...(refresh ? { refresh: '1' } : {}) })}`).then(setD).catch((e) => setError(e.message));
  }, [client]);
  useEffect(() => load(), [load]);
  const redo = async (ids: string[] | 'all', label: string) => {
    setBusy(label); setMsg(''); setError(''); setConfirmAll(false);
    try {
      const r = await api<RedoResult>('/inbox/redo', { body: { ids } });
      const dry = r.queued.some((x) => x.dryRun);
      setMsg(`${r.queued.length ? `${plural(r.queued.length, 'draft')} on Echo's list${dry ? ' (dry run: Echo is not switched live, nothing changes yet)' : ''}` : 'Nothing queued'}${r.skipped.length ? `; ${r.skipped.length} left as they are (${[...new Set(r.skipped.map((s) => s.why))].slice(0, 2).join('; ')})` : ''}. Nothing is sent: redone drafts still need approval.`);
      load(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  if (error && !d) return <div className="mt-4"><ErrorBox error={error} retry={() => load()} /></div>;
  if (!d) return <div className="mt-4"><PageSkeleton kind="list" /></div>;
  const can = d.rows.filter((r) => !r.blocked && r.task?.status !== 'in_progress');
  return (
    <div className="mt-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg">{d.total} of {d.pending} pending drafts offer a booking link, not two times</h2>
            <p className="mt-1 text-sm text-fg-2">{d.byClient.map((c) => `${c.name} ${c.count}`).join(' · ') || 'None'}</p>
            <p className="mt-1 text-sm text-muted">Alex's rule: two specific times from the client's calendar; a link only if they asked for one. Echo can redraft each with real times. Nothing is sent: the new draft waits for approval.</p>
          </div>
          {can.length > 0 && (confirmAll
            ? <div className="flex flex-wrap gap-2"><Button tone="accent" icon="sparkles" disabled={!!busy} onClick={() => void redo('all', 'all')}>Yes, redo {plural(can.length, 'draft')}</Button><Button tone="ghost" onClick={() => setConfirmAll(false)}>Cancel</Button></div>
            : <Button tone="accent" icon="sparkles" disabled={!!busy} onClick={() => setConfirmAll(true)}>{busy === 'all' ? 'Adding…' : `Have Echo redo all (${can.length})`}</Button>)}
        </div>
        {msg && <p role="status" className="mt-3 rounded-xl bg-good-soft px-3 py-2 text-sm font-medium text-good">{msg}</p>}
        {error && <div className="mt-3"><ErrorBox error={error} /></div>}
      </Card>
      <Card className="mt-3 overflow-hidden p-0">
        {d.rows.length ? <ul className="divide-y divide-line">{d.rows.map((r) => <LinkDraftItem key={r.id} r={r} busy={busy === r.id} disabled={!!busy} redo={() => void redo([r.id], r.id)} />)}</ul>
          : <Empty icon="check" tone="good" title="No drafts with a link" sub="Every pending draft offers times (or there are none)." />}
      </Card>
      <p className="mt-3 text-xs text-muted">Read only, from Airtable (Emails), read {timeAgo(d.readAt) || 'just now'}. Each redo is a task on Echo's list (Team → Echo).</p>
    </div>
  );
}

function LinkDraftItem({ r, busy, disabled, redo }: { r: LinkDraftRow; busy: boolean; disabled: boolean; redo: () => void }) {
  const host = (u: string) => u.replace(/^https?:\/\//, '').split('/')[0];
  const taskLine = r.task ? (r.task.status === 'done' ? `Echo: ${r.task.note}` : r.task.status === 'in_progress' ? `Echo is on it: ${r.task.note}` : `On Echo's list: ${r.task.note}`) : '';
  return (
    <li className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
      <button onClick={() => go(`thread/${r.id}`)} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0 truncate text-[15px] font-semibold text-fg">{r.prospect}{r.company && <span className="font-normal text-muted"> · {r.company}</span>}</div>
          <span className="tabular shrink-0 text-xs text-muted">{dateLabel(r.at)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Pill>{r.client}</Pill>
          {r.kind === 'followup' && <Pill tone="info">Follow-up</Pill>}
          <Pill tone="warn" icon="link">{host(r.links[0])}</Pill>
          {r.times === 1 && <Pill>1 time only</Pill>}
          {r.noTimesThen && <Pill>No calendar times when drafted</Pill>}
          {r.askedForLink && <Pill tone="info">They asked for a link</Pill>}
          {r.gap && <Pill tone="warn">Needs a fact</Pill>}
        </div>
        {taskLine && <p className="mt-1.5 text-sm text-fg-2">{taskLine}</p>}
        {r.blocked && <p className="mt-1.5 text-sm text-muted">Can't redo: {r.blocked}.</p>}
      </button>
      <div className="flex shrink-0 gap-2 sm:pt-0.5">
        <Button onClick={() => go(`thread/${r.id}`)} className="min-h-10 px-3 text-sm">Open</Button>
        <Button tone="accent" icon="sparkles" disabled={disabled || !!r.blocked || r.task?.status === 'in_progress'} onClick={redo} className="min-h-10 px-3 text-sm">{busy ? 'Adding…' : 'Have Echo redo it'}</Button>
      </div>
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
  const timeline = t.timeline?.length ? t.timeline : (t.latest || r.theySaid) ? [{ who: 'them', name: r.prospect, email: r.email, at: r.at, body: t.latest || r.theySaid, quoted: '', kind: 'reply', step: null, stepFrom: null, latest: true } as ThreadMsg] : [];

  return (
    <>
      <Card className="p-0 anim-in">
        <div className="flex items-start gap-3 px-5 py-4 sm:px-6">
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
        {t.replier && <ReplierPanel m={t.replier} />}
      </Card>

      {(r.bookedLine || status || (!done && t.notes.length > 0)) && (
        <div className="mt-4 space-y-3">
          {r.bookedLine && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-good-soft px-4 py-3 text-sm font-medium text-good">
              <Icon name="calendar" size={15} />{r.bookedLine}
              {r.bookedUrl && <a href={r.bookedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center underline underline-offset-2">Open</a>}
            </div>
          )}
          {status && <div className="rounded-xl bg-sunken px-4 py-3 text-sm text-fg-2">{status}</div>}
          <NoteList notes={done ? [] : t.notes} />
        </div>
      )}

      <Conversation msgs={timeline} campaign={t.campaign} fromCopy={t.stepsFromCopy} threadUrl={t.threadUrl} />

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
        <section aria-label="Echo's draft" className="mt-4 rounded-2xl border-2 border-dashed border-accent/50 bg-surface p-4 shadow-card sm:p-5">
          <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Avatar name={INBOX_FACE} size="sm" />
              <div><div className="text-sm font-semibold text-fg">{act ? "Echo's draft: your reply" : "Echo's draft"}</div><div className="text-xs text-muted">{act ? 'Not sent. Edit it here, then Send or Skip.' : done ? 'Handled.' : 'Not waiting for approval.'}</div></div>
              {edited && <Pill tone="accent" icon="pen">edited</Pill>}
            </div>
            {edited && act && <button onClick={() => setDraft(t.draft)} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-fg"><Icon name="undo" size={13} />Undo edits</button>}
          </div>
          {t.offeredTimes.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm"><span className="font-medium text-fg-2">Offered times:</span>{t.offeredTimes.map((x) => <Pill key={x} tone="good" icon="clock">{x}</Pill>)}</div>
          )}
          {act ? (
            <textarea ref={box} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Reply" rows={Math.min(16, Math.max(5, draft.split('\n').length + 1))}
              className="w-full resize-y rounded-xl border border-accent/40 bg-accent-soft/40 px-4 py-3.5 text-base leading-relaxed text-fg outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent-soft" />
          ) : <div className="whitespace-pre-wrap break-words rounded-xl border-l-2 border-accent bg-accent-soft/40 px-4 py-3.5 text-base leading-relaxed text-fg">{done === 'edited' ? draft : t.draft || '(no draft)'}</div>}
          {act && edited && live.link && <p className="mt-2 flex items-center gap-1.5 text-sm text-warn"><Icon name="link" size={14} />Still a booking link: two specific times book far more calls.</p>}
          {act && live.gap && <p className="mt-2 flex items-center gap-1.5 text-sm text-warn"><Icon name="alert" size={14} />Replace this before sending: {live.holes.slice(0, 3).join(', ')}</p>}
          {error && <div className="mt-4"><ErrorBox error={error} /></div>}
        </section>
      )}
      {error && !(t.draft || t.canAct) && <div className="mt-4"><ErrorBox error={error} /></div>}

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
          <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-3 bg-bg/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:bottom-0 md:mx-0 md:rounded-2xl md:px-0">
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
    </>
  );
}

/** Which AI replier mode applies to this client, and the link to its settings. Read only. */
const MODE_TONE: Record<ReplierMode['mode'], 'plain' | 'good' | 'warn' | 'info' | 'accent'> = { off: 'plain', 'draft-only': 'warn', approval: 'good', auto: 'info' };
function ReplierPanel({ m }: { m: ReplierMode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line bg-sunken/60 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="min-w-0 text-sm">
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-fg">AI replier</span><Pill tone={MODE_TONE[m.mode]}>{m.label}</Pill></div>
        <p className="mt-1 text-fg-2">{m.why}</p>
        {m.lines.length > 0 && <p className="mt-0.5 text-muted">{m.lines.join(' ')}</p>}
      </div>
      <Button icon="wrench" onClick={() => go(`clients/${m.clientId}/replier`)} className="min-h-10 shrink-0 self-start px-3 text-sm">Replier settings</Button>
    </div>
  );
}

/** The conversation, oldest first; long ones open scrolled to the newest message. */
function Conversation({ msgs, campaign, fromCopy, threadUrl }: { msgs: ThreadMsg[]; campaign: string; fromCopy: boolean; threadUrl: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const seq = msgs.filter((m) => m.kind === 'sequence');
  useLayoutEffect(() => { const s = scroller.current; if (s) s.scrollTop = s.scrollHeight; }, [msgs]);
  const byOrder = seq.some((m) => m.stepFrom === 'order');
  return (
    <section aria-label="Conversation" className="mt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon name="history" size={16} className="text-muted" />Conversation · {plural(msgs.length, 'message')}</h2>
        {msgs.length > 3 && <span className="text-xs text-muted">Oldest at the top · newest at the bottom</span>}
      </div>
      {msgs.length ? (
        <div ref={scroller} tabIndex={0} aria-label="Messages, scroll up for older ones" className="max-h-[min(72vh,960px)] space-y-4 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-sunken/50 p-3 outline-none focus-visible:ring-4 focus-visible:ring-accent-soft sm:p-4">
          {msgs.map((m, i) => <Message key={i} m={m} />)}
        </div>
      ) : <Card className="text-sm text-muted">No messages saved on this thread. {threadUrl ? 'Open it in EmailBison for the full history.' : ''}</Card>}
      {(campaign || seq.length > 0) && (
        <p className="mt-2 text-xs text-muted">
          {campaign && <>Campaign: {campaign}. </>}
          {seq.length > 0 && (byOrder ? 'Email numbers follow the order they were sent (the campaign copy could not be matched).' : fromCopy ? 'Email numbers come from the campaign\'s step copy.' : '')}
        </p>
      )}
    </section>
  );
}

function Message({ m }: { m: ThreadMsg }) {
  const [open, setOpen] = useState(false);
  const us = m.who === 'us';
  const label = m.kind === 'sequence' ? (m.step ? `Email ${m.step}` : 'Our cold email') : us ? 'Our reply' : m.who === 'them' ? 'Prospect' : 'Message';
  const who = m.name || m.email || (us ? 'Us' : 'Prospect');
  return (
    <article className={cx('rounded-2xl border px-4 py-3.5 shadow-card', us ? 'border-accent/25 bg-accent-soft/40 sm:ml-12' : 'border-line bg-surface sm:mr-12', !us && 'border-l-4 border-l-info', m.latest && 'ring-2 ring-info/40')}>
      <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line/70 pb-2">
        <Avatar name={who} size="sm" round />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-semibold text-fg">{who}</span>
            <Pill tone={m.kind === 'sequence' ? 'accent' : us ? 'plain' : 'info'}>{label}</Pill>
            {m.latest && <Pill tone="info">Latest</Pill>}
          </div>
          {m.email && m.name && <div className="truncate text-xs text-muted">{m.email}</div>}
        </div>
        <time dateTime={m.at || undefined} className="tabular shrink-0 text-xs text-muted" title={m.kind === 'sequence' && m.at ? 'From the quoted header (time zone not given)' : undefined}>{m.at ? slashDateTime(m.at) : 'Time unknown'}</time>
      </header>
      {m.body && <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg">{m.body}</div>}
      {m.quoted && (
        <>
          <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-xs font-medium text-muted hover:text-fg">{open ? 'Hide earlier quoted text' : 'Show earlier quoted text'}<Icon name="chevronDown" size={13} className={cx('transition', open && 'rotate-180')} /></button>
          {open && <div className="mt-1 max-h-96 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-muted">{m.quoted.replace(/^(?:[ \t]*[│>][ \t]?)+/gm, '').replace(/\n{3,}/g, '\n\n')}</div>}
        </>
      )}
    </article>
  );
}
