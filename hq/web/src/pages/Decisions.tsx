import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Client, type Decision, type Pile, type User } from '../api';
import { ClientPicker, rememberedClient, type ClientOption } from '../clientPicker';
import { findPlaceholders } from '../placeholders';
import { Avatar, BackLink, Button, Card, clientKey, cx, Empty, ErrorBox, ExtLink, go, Icon, Kbd, Label, Marked, PageSkeleton, PageTitle, Pill, Progress, setCount, showToast, timeAgo } from '../ui';

// The piles (Alex, 2026-11-27): no "Other". Money and Content are owner-only (the server leaves them out for members).
const PILES: { key: Pile; who: string; icon: string }[] = [
  // Same order as the team (Team / Chat).
  { key: 'Orchestrator', who: 'Ada', icon: 'sparkles' },
  { key: 'Campaigns', who: 'Atlas · Scribe · Scout', icon: 'megaphone' },
  { key: 'Replies', who: 'Echo', icon: 'reply' },
  { key: 'Fixes', who: 'Riley', icon: 'wrench' },
  { key: 'Sales', who: 'Cole', icon: 'trendUp' },
  { key: 'Money', who: 'Ledger', icon: 'dollar' },
  { key: 'Content', who: 'Sienna', icon: 'film' },
];
type Outcome = 'approved' | 'rejected' | 'skipped';
type Verdict = 'approve' | 'reject' | 'edited';
/** How long a Reject waits before it is saved, so Undo is free (nothing is sent by a reject). */
const UNDO_MS = 6000;

/** HQ is the one tool (RULES 2026-11-27): no Airtable record links on this screen. */
const noAirtable = (s: string) => s.split('\n').filter((l) => !/airtable\.com\//i.test(l)).join('\n').trim();

export default function Decisions({ user: _user, pile, client }: { user: User; pile?: string; client?: string }) {
  const [data, setData] = useState<{ piles: Record<string, Decision[]>; order: Pile[] } | null>(null);
  const [error, setError] = useState('');
  const [handled, setHandled] = useState<string[]>([]);
  const [decided, setDecided] = useState<string[]>([]);
  const [stats, setStats] = useState({ approved: 0, rejected: 0, skipped: 0 });
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [pick, setPick] = useState(() => rememberedClient('decisions', client));
  const load = useCallback(() => { setError(''); api<{ piles: Record<string, Decision[]>; order: Pile[] }>('/decisions').then((x) => { setData(x); setDecided([]); }).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  useEffect(() => { setHandled([]); setStats({ approved: 0, rejected: 0, skipped: 0 }); }, [pile, client]);
  // The client dropdown: active clients only (the Clients API answers active ones).
  useEffect(() => { api<{ clients: Client[] }>('/clients').then((r) => setClients(r.clients.filter((c) => c.active).map((c) => ({ key: c.key, name: c.name })))).catch(() => setClients([])); }, []);
  useEffect(() => { if (pile) setPick(client ?? ''); }, [pile, client]);

  // A Reject waits UNDO_MS before it is saved (Undo in the toast). Leaving the page saves it at once.
  const pending = useRef<{ id: string; timer: number; save: () => void } | null>(null);
  const flush = useCallback(() => { const p = pending.current; if (p) { window.clearTimeout(p.timer); pending.current = null; p.save(); } }, []);
  useEffect(() => { window.addEventListener('pagehide', flush); return () => { window.removeEventListener('pagehide', flush); flush(); }; }, [flush]);

  // Cards approved or rejected here leave every pile until the next load.
  const piles = useMemo(() => {
    if (!data) return {} as Record<string, Decision[]>;
    return Object.fromEntries(Object.entries(data.piles).map(([k, v]) => [k, v.filter((d) => !decided.includes(d.id))]));
  }, [data, decided]);
  const all = useMemo(() => (data ? data.order.flatMap((p) => piles[p] ?? []) : []), [data, piles]);
  useEffect(() => { if (data) setCount('decisions', all.length); }, [data, all.length]);
  const options = useMemo(() => clients.map((c) => ({ ...c, count: all.filter((d) => clientKey(d.client) === c.key).length })), [clients, all]);
  const mine = (d: Decision, k: string) => !k || clientKey(d.client) === k;

  const picker = (onChange: (k: string) => void, value: string) => clients.length > 0 && <ClientPicker screen="decisions" value={value} options={options} onChange={onChange} />;

  if (error && !data) return <><PageTitle title="Decisions" /><ErrorBox error={error} retry={load} /></>;
  if (!data) return <><PageTitle title="Decisions" /><PageSkeleton kind={pile ? 'deck' : 'grid'} /></>;

  if (!pile) {
    const shown = all.filter((d) => mine(d, pick));
    return (
      <div>
        <PageTitle title="Decisions" kicker={shown.length ? `${shown.length} waiting on you` : 'Nothing waiting'}
          right={shown.length > 0 && <Button tone="accent" icon="play" onClick={() => go(`decisions/all${pick ? `/${pick}` : ''}`)}>Go through all {shown.length}</Button>} />
        {clients.length > 0 && <div className="mb-4">{picker(setPick, pick)}</div>}
        {!shown.length && <Card className="mb-6"><Empty icon="check" tone="good" title="All clear" sub={pick ? 'No decisions waiting for this client.' : 'No decisions waiting on you. New cards land here when an agent needs your OK.'} /></Card>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PILES.filter((p) => data.order.includes(p.key)).map((p) => {
            const list = (piles[p.key] ?? []).filter((d) => mine(d, pick));
            const n = list.length;
            const body = (
              <>
                <div className="flex items-start gap-3">
                  <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line', n ? 'bg-sunken text-fg' : 'bg-sunken text-faint')}><Icon name={p.icon} size={19} /></span>
                  <div className="min-w-0 flex-1"><div className="font-semibold text-fg">{p.key}</div><div className="truncate text-xs text-muted">{p.who}</div></div>
                  <span className={cx('tabular rounded-full px-2.5 py-0.5 text-sm font-bold', n ? 'bg-ink text-ink-fg' : 'border border-line bg-sunken text-muted')}>{n}</span>
                </div>
                <div className="mt-4 min-h-10 space-y-1">
                  {list.slice(0, 2).map((d) => <div key={d.id} className="truncate text-sm text-fg-2">{d.title}</div>)}
                  {n > 2 && <div className="text-xs text-muted">+{n - 2} more</div>}
                  {!n && <div className="flex items-center gap-1.5 text-sm text-muted"><Icon name="check" size={14} />Clear</div>}
                </div>
              </>
            );
            return n ? <Card key={p.key} onClick={() => go(`decisions/${p.key}${pick ? `/${pick}` : ''}`)} label={`${p.key}: ${n} waiting`}>{body}</Card> : <Card key={p.key} className="opacity-70">{body}</Card>;
          })}
        </div>
      </div>
    );
  }

  // decisions/<pile>/<client key>: only that client's cards.
  const source = (pile === 'all' ? data.order.flatMap((p) => data.piles[p] ?? []) : data.piles[pile] ?? []).filter((d) => mine(d, client ?? ''));
  const queue = source.filter((d) => !handled.includes(d.id) && !(decided.includes(d.id)));
  const total = source.filter((d) => !decided.includes(d.id) || handled.includes(d.id)).length;
  const done = total - queue.length;
  const current = queue[0];
  const clientName = client ? options.find((o) => o.key === client)?.name || source[0]?.client || client : '';
  const title = `${pile === 'all' ? 'All decisions' : pile}${client ? ` · ${clientName}` : ''}`;
  const back = <BackLink label="Piles" onClick={() => go('decisions')} />;
  const changeClient = (k: string) => go(`decisions/${pile}${k ? `/${k}` : ''}`);

  if (!current) {
    const any = stats.approved + stats.rejected + stats.skipped > 0;
    return (
      <div className="mx-auto max-w-2xl">
        {back}
        <Card className="mt-2 flex flex-col items-center px-6 py-12 text-center">
          <span className="anim-pop grid h-20 w-20 place-items-center rounded-full bg-accent text-accent-fg shadow-pop"><Icon name="check" size={40} strokeWidth={2.6} /></span>
          <h1 className="mt-6 text-2xl font-bold tracking-tight anim-in">{pile === 'all' ? 'All decisions cleared' : `${pile} cleared`}</h1>
          <p className="mt-1.5 text-[15px] text-muted anim-in">{any ? 'Nice work. The engine runs what you approved.' : 'Nothing left in this pile.'}</p>
          {any && (
            <div className="mt-5 flex flex-wrap justify-center gap-2 anim-in">
              <Pill tone="good" icon="check" className="px-3 py-1 text-sm">{stats.approved} approved</Pill>
              <Pill tone="bad" icon="x" className="px-3 py-1 text-sm">{stats.rejected} rejected</Pill>
              <Pill icon="clock" className="px-3 py-1 text-sm">{stats.skipped} later</Pill>
            </div>
          )}
          <div className="mt-8 grid w-full max-w-sm grid-cols-2 gap-2">
            <Button onClick={() => { go('decisions'); load(); }}>Back to piles</Button>
            <Button tone="primary" onClick={() => go('needs')} icon="bell">Needs you</Button>
          </div>
        </Card>
      </div>
    );
  }

  const leave = (id: string, kind: Outcome) => {
    setHandled((h) => [...h, id]);
    if (kind !== 'skipped') setDecided((x) => [...x, id]);
    setStats((s) => ({ ...s, [kind]: s[kind] + 1 }));
  };
  const comeBack = (id: string, kind: Outcome) => {
    setHandled((h) => h.filter((x) => x !== id));
    setDecided((x) => x.filter((y) => y !== id));
    setStats((s) => ({ ...s, [kind]: Math.max(0, s[kind] - 1) }));
  };
  /** Approve / send: saved now, the toast says what happens next. Reject: the card leaves at once and is saved after the Undo window. */
  const decide = async (d: Decision, verdict: Verdict | 'skip', text?: string): Promise<boolean> => {
    flush();
    if (verdict === 'skip') {
      leave(d.id, 'skipped');
      showToast({ text: 'Moved to later. It stays in the pile.', undo: () => comeBack(d.id, 'skipped') });
      return true;
    }
    if (verdict === 'reject') {
      leave(d.id, 'rejected');
      const save = () => api(`/decisions/${d.id}`, { body: { verdict: 'reject' } }).catch((e) => {
        comeBack(d.id, 'rejected');
        showToast({ tone: 'bad', text: `Not rejected: ${(e as Error).message}` });
      });
      const timer = window.setTimeout(() => { if (pending.current?.id === d.id) { pending.current = null; void save(); } }, UNDO_MS);
      pending.current = { id: d.id, timer, save: () => void save() };
      showToast({
        text: d.isReply ? `Reply skipped: nothing is sent to ${d.title.replace(/^Reply to /, '')}.` : `Rejected: ${d.title}. Nothing runs.`,
        undo: () => { if (pending.current?.id === d.id) { window.clearTimeout(pending.current.timer); pending.current = null; } comeBack(d.id, 'rejected'); },
        ms: UNDO_MS,
      });
      return true;
    }
    try {
      await api(`/decisions/${d.id}`, { body: verdict === 'edited' ? { verdict, text } : { verdict } });
      leave(d.id, 'approved');
      showToast({ tone: 'good', text: d.isReply ? `${verdict === 'edited' ? 'Edited reply' : 'Reply'} approved: it goes out within a minute.` : `Approved: ${d.title}.${d.action && d.action !== 'None' ? ' The engine runs it now.' : ''}` });
      return true;
    } catch (e) {
      showToast({ tone: 'bad', text: `Not saved: ${(e as Error).message}`, ms: 8000 });
      return false;
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">{back}<span className="mb-3 text-sm font-semibold text-fg">{title}</span></div>
      {clients.length > 0 && <div className="mb-3">{picker(changeClient, client ?? '')}</div>}
      <Progress done={done} total={total} />
      <DecisionDeckCard key={current.id} d={current} decide={decide} position={`${done + 1} of ${total}`} />
    </div>
  );
}

function DecisionDeckCard({ d, decide, position }: { d: Decision; decide: (d: Decision, v: Verdict | 'skip', text?: string) => Promise<boolean>; position: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [draft, setDraft] = useState(d.fix);
  const box = useRef<HTMLTextAreaElement>(null);
  const edited = d.isReply && draft.trim() !== d.fix.trim();
  // Placeholder guard: what would go out must have no "[link]", "{{first_name}}", "<insert …>".
  const sends = d.isReply || d.action === 'Send Reply';
  const holes = useMemo(() => (sends ? findPlaceholders(d.isReply && d.canEdit ? draft : d.fix) : []), [sends, d.isReply, d.canEdit, draft, d.fix]);
  const blocked = holes.length > 0;
  const details = noAirtable(d.details);
  const noAction = !d.isReply && (!d.action || d.action === 'None');

  const send = useCallback(async (verdict: Verdict | 'skip') => {
    if (busy) return;
    if ((verdict === 'approve' || verdict === 'edited') && blocked) { setError(`Replace ${holes.length === 1 ? 'this' : 'these'} before sending: ${holes.join(', ')}`); return; }
    if (verdict === 'edited' && !draft.trim()) { setError('The reply is empty.'); return; }
    setBusy(true); setError('');
    const ok = await decide(d, verdict, verdict === 'edited' ? draft : undefined);
    if (!ok) setBusy(false);
  }, [busy, blocked, holes, draft, decide, d]);

  const editNow = useCallback((select?: string) => {
    const t = box.current;
    if (!t) return;
    t.focus();
    const at = select ? t.value.indexOf(select) : -1;
    if (at >= 0) t.setSelectionRange(at, at + select!.length); else t.setSelectionRange(t.value.length, t.value.length);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') { if (e.key === 'Escape') el?.blur(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'r') void send('reject');
      else if (k === 's') void send('skip');
      else if (k === 'a') void send(edited ? 'edited' : 'approve');
      else if (k === 'e' && d.isReply && d.canEdit) { e.preventDefault(); editNow(holes[0]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send, edited, d.isReply, d.canEdit, editNow, holes]);

  return (
    <>
      <Card className="mt-5 p-0 anim-in">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
          <Avatar name={d.agent || '?'} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><span className="font-semibold text-fg">{d.agent || 'Agent'}</span>{d.client && <Pill>{d.client}</Pill>}</div>
            <div className="text-xs text-muted">{d.pile} · {timeAgo(d.created)}</div>
          </div>
          <span className="tabular shrink-0 text-xs font-medium text-muted">{position}</span>
        </div>

        <div className="px-5 pb-6 pt-5 sm:px-6">
          <h2 className="text-xl font-semibold leading-snug tracking-tight text-fg sm:text-2xl">{d.title}</h2>

          {d.isReply ? (
            <>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Label>{d.latestMessage ? 'They wrote' : 'They said'}</Label>
                  {d.threadUrl && <ExtLink href={d.threadUrl} className="inline-flex min-h-8 items-center gap-1 text-sm"><Icon name="external" size={14} />Open thread</ExtLink>}
                </div>
                <div className="rounded-2xl rounded-tl-md border border-line bg-sunken px-4 py-3.5 text-base leading-relaxed text-fg whitespace-pre-wrap break-words">{d.latestMessage || d.issue}</div>
              </div>

              {d.checked && (
                <div className="mt-4 flex gap-2.5 rounded-xl bg-info-soft px-4 py-3 text-sm leading-relaxed text-fg-2">
                  <Icon name="sparkles" size={16} className="mt-0.5 text-info" />
                  <div className="min-w-0"><span className="font-semibold text-info">Why this reply · </span><span className="whitespace-pre-wrap">{d.checked}</span></div>
                </div>
              )}

              <div className="mt-6">
                <div className="mb-2 flex min-h-9 items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><Label>Your reply</Label>{edited && <Pill tone="accent" icon="pen">edited</Pill>}</div>
                  <div className="flex items-center gap-1">
                    {edited && <button onClick={() => setDraft(d.fix)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-fg"><Icon name="undo" size={13} />Undo edits</button>}
                    {d.canEdit && <button onClick={() => editNow(holes[0])} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"><Icon name="pen" size={14} />Edit</button>}
                  </div>
                </div>
                {blocked && <PlaceholderWarning holes={holes} onPick={d.canEdit ? editNow : undefined} canEdit={d.canEdit} />}
                {d.canEdit ? (
                  <div className="relative">
                    <textarea ref={box} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Your reply (you can edit it)" aria-invalid={blocked || undefined}
                      rows={Math.min(14, Math.max(5, draft.split('\n').length + 1))}
                      className={cx('w-full resize-y rounded-2xl border-2 bg-surface px-4 pb-8 pt-3.5 text-base leading-relaxed text-fg shadow-card outline-none transition focus:ring-4',
                        blocked ? 'border-warn focus:ring-warn-soft' : 'border-line-strong hover:border-accent/60 focus:border-accent focus:ring-accent-soft')} />
                    <span aria-hidden="true" className="pointer-events-none absolute bottom-3 right-4 flex items-center gap-1 text-xs text-muted"><Icon name="pen" size={12} />Tap to edit</span>
                  </div>
                ) : <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md border-l-2 border-accent bg-accent-soft/40 px-4 py-3.5 text-base leading-relaxed text-fg"><Marked text={d.fix} marks={holes} /></div>}
              </div>
            </>
          ) : (
            <div className="mt-5 space-y-4">
              <Block label="Issue" text={d.issue} />
              <Block label="Checked" text={d.checked} />
              <Block label="Proposed" text={d.fix} strong marks={holes} />
              {blocked && <PlaceholderWarning holes={holes} canEdit={false} />}
              {d.action && d.action !== 'None' && (
                <div className="flex gap-2.5 rounded-xl bg-info-soft px-4 py-3 text-sm text-fg-2"><Icon name="play" size={15} className="mt-0.5 text-info" /><div><span className="font-semibold text-info">On approve: </span>{d.action}</div></div>
              )}
              {noAction && d.fix && (
                <div className="flex gap-2.5 rounded-xl bg-info-soft px-4 py-3 text-sm text-fg-2"><Icon name="wrench" size={15} className="mt-0.5 text-info" /><div><span className="font-semibold text-info">On approve: </span>{d.agent || 'Ada'} does it (it goes on {d.agent || 'Ada'}'s list).</div></div>
              )}
            </div>
          )}

          {details && (
            <button onClick={() => setMore((v) => !v)} aria-expanded={more} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent-ink">
              {more ? 'Hide details' : d.isReply ? 'Campaign and thread details' : 'More details'}<Icon name="chevronDown" size={15} className={cx('transition', more && 'rotate-180')} />
            </button>
          )}
          {more && <div className="mt-1 whitespace-pre-wrap break-words rounded-xl border border-line bg-sunken px-4 py-3 text-sm leading-relaxed text-fg-2 anim-fade">{details}</div>}
        </div>
      </Card>

      {/* Buttons and keyboard hints in the same order: Reject, Later, Approve. */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-4 bg-bg/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:bottom-0 md:mx-0 md:rounded-2xl md:px-0">
        {error && <p role="alert" className="mb-2 text-center text-sm font-medium text-bad">{error}</p>}
        <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
          <Button tone="danger" disabled={busy} onClick={() => void send('reject')} icon="x" kbd="R" compact>{d.isReply ? 'Skip reply' : 'Reject'}</Button>
          <Button disabled={busy} onClick={() => void send('skip')} icon="clock" kbd="S" compact>Later</Button>
          <Button tone="accent" disabled={busy || blocked} title={blocked ? 'Replace the placeholder first' : undefined} onClick={() => void send(edited ? 'edited' : 'approve')} icon={d.isReply ? 'send' : 'check'} kbd="A" compact>
            {busy ? 'Saving…' : blocked ? 'Fill it in first' : d.isReply ? (edited ? 'Send edited' : 'Send') : 'Approve'}
          </Button>
        </div>
      </div>
      <div className="mt-2 hidden items-center justify-center gap-3 text-xs text-muted md:flex">
        <Icon name="keyboard" size={15} />
        <span className="flex items-center gap-1"><Kbd>R</Kbd> {d.isReply ? 'skip reply' : 'reject'}</span>
        <span className="flex items-center gap-1"><Kbd>S</Kbd> later</span>
        <span className="flex items-center gap-1"><Kbd>A</Kbd> {d.isReply ? 'send' : 'approve'}</span>
        {d.isReply && d.canEdit && <span className="flex items-center gap-1"><Kbd>E</Kbd> edit</span>}
        {d.isReply && d.canEdit && <span className="flex items-center gap-1"><Kbd>Esc</Kbd> stop editing</span>}
      </div>
      {d.isReply && <p className="mt-2 text-center text-xs text-muted">The engine sends it from the right inbox and closes this card. "Later" keeps it for another time.</p>}
    </>
  );
}

/** The placeholder guard, as the person sees it: what to replace, one tap to jump to it. */
function PlaceholderWarning({ holes, onPick, canEdit }: { holes: string[]; onPick?: (h: string) => void; canEdit: boolean }) {
  return (
    <div role="alert" className="mb-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-fg">
      <div className="flex items-center gap-2 font-semibold text-warn"><Icon name="alert" size={16} />Replace this before sending</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {holes.map((h) => onPick
          ? <button key={h} onClick={() => onPick(h)} className="min-h-9 max-w-full truncate rounded-lg border border-warn/40 bg-surface px-2.5 font-mono text-[13px] text-fg hover:border-warn">{h}</button>
          : <code key={h} className="max-w-full truncate rounded-lg border border-warn/40 bg-surface px-2.5 py-1.5 text-[13px] text-fg">{h}</code>)}
      </div>
      <div className="mt-2 text-xs text-fg-2">{canEdit ? 'Tap one to jump to it, type the real text, then Send.' : 'It cannot be sent like this. Reject it, or fix the draft in the Inbox.'}</div>
    </div>
  );
}

function Block({ label, text, strong, marks = [] }: { label: string; text: string; strong?: boolean; marks?: string[] }) {
  if (!text) return null;
  return (
    <div className={cx('rounded-xl px-4 py-3', strong ? 'border border-accent/30 bg-accent-soft/40' : 'border border-line bg-sunken')}>
      <Label>{label}</Label>
      <div className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg"><Marked text={text} marks={marks} /></div>
    </div>
  );
}
