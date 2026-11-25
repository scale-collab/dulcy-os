import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Decision, type Pile, type User } from '../api';
import { Avatar, BackLink, Button, Card, cx, Empty, ErrorBox, ExtLink, go, Icon, Kbd, Label, PageSkeleton, PageTitle, Pill, Progress, setCount, timeAgo } from '../ui';

const PILES: { key: Pile; who: string; icon: string }[] = [
  { key: 'Replies', who: 'Sean', icon: 'reply' },
  { key: 'Campaigns', who: 'Atlas · Scribe · Scout', icon: 'megaphone' },
  { key: 'Fixes', who: 'Riley', icon: 'wrench' },
  { key: 'Money', who: 'Ledger', icon: 'dollar' },
  { key: 'Other', who: 'Ada · Cole · Sienna', icon: 'layers' },
];
type Outcome = 'approved' | 'rejected' | 'skipped';

export default function Decisions({ user: _user, pile }: { user: User; pile?: string }) {
  const [data, setData] = useState<{ piles: Record<string, Decision[]>; order: Pile[] } | null>(null);
  const [error, setError] = useState('');
  const [handled, setHandled] = useState<string[]>([]);
  const [decided, setDecided] = useState<string[]>([]);
  const [stats, setStats] = useState({ approved: 0, rejected: 0, skipped: 0 });
  const load = useCallback(() => { setError(''); api<{ piles: Record<string, Decision[]>; order: Pile[] }>('/decisions').then((x) => { setData(x); setDecided([]); }).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  useEffect(() => { setHandled([]); setStats({ approved: 0, rejected: 0, skipped: 0 }); }, [pile]);

  // Cards approved or rejected here leave every pile until the next load.
  const piles = useMemo(() => {
    if (!data) return {} as Record<string, Decision[]>;
    return Object.fromEntries(Object.entries(data.piles).map(([k, v]) => [k, v.filter((d) => !decided.includes(d.id))]));
  }, [data, decided]);
  const all = useMemo(() => (data ? data.order.flatMap((p) => piles[p] ?? []) : []), [data, piles]);
  useEffect(() => { if (data) setCount('decisions', all.length); }, [data, all.length]);

  if (error && !data) return <><PageTitle title="Decisions" /><ErrorBox error={error} retry={load} /></>;
  if (!data) return <><PageTitle title="Decisions" /><PageSkeleton kind={pile ? 'deck' : 'grid'} /></>;

  if (!pile) {
    return (
      <div>
        <PageTitle title="Decisions" kicker={all.length ? `${all.length} waiting on you` : 'Nothing waiting'}
          right={all.length > 0 && <Button tone="accent" icon="play" onClick={() => go('decisions/all')}>Go through all {all.length}</Button>} />
        {!all.length && <Card className="mb-6"><Empty icon="check" tone="good" title="All clear" sub="No decisions waiting on you. New cards land here when an agent needs your OK." /></Card>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PILES.filter((p) => data.order.includes(p.key)).map((p) => {
            const list = piles[p.key] ?? [];
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
            return n ? <Card key={p.key} onClick={() => go(`decisions/${p.key}`)} label={`${p.key}: ${n} waiting`}>{body}</Card> : <Card key={p.key} className="opacity-70">{body}</Card>;
          })}
        </div>
      </div>
    );
  }

  const source = pile === 'all' ? data.order.flatMap((p) => data.piles[p] ?? []) : data.piles[pile] ?? [];
  const queue = source.filter((d) => !handled.includes(d.id) && !(decided.includes(d.id)));
  const total = source.filter((d) => !decided.includes(d.id) || handled.includes(d.id)).length;
  const done = total - queue.length;
  const current = queue[0];
  const title = pile === 'all' ? 'All decisions' : pile;
  const back = <BackLink label="Piles" onClick={() => go('decisions')} />;

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
            <Button tone="primary" onClick={() => go('tasks')} icon="grid">My to-do</Button>
          </div>
        </Card>
      </div>
    );
  }
  const onDone = (kind: Outcome) => {
    setHandled((h) => [...h, current.id]);
    if (kind !== 'skipped') setDecided((x) => [...x, current.id]);
    setStats((s) => ({ ...s, [kind]: s[kind] + 1 }));
  };
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-3">{back}<span className="mb-3 text-sm font-semibold text-fg">{title}</span></div>
      <Progress done={done} total={total} />
      <DecisionDeckCard key={current.id} d={current} onDone={onDone} position={`${done + 1} of ${total}`} />
    </div>
  );
}

function DecisionDeckCard({ d, onDone, position }: { d: Decision; onDone: (k: Outcome) => void; position: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [draft, setDraft] = useState(d.fix);
  const box = useRef<HTMLTextAreaElement>(null);
  const edited = d.isReply && draft.trim() !== d.fix.trim();

  const send = useCallback(async (verdict: 'approve' | 'reject' | 'edited' | 'skip') => {
    if (busy) return;
    if (verdict === 'skip') { onDone('skipped'); return; }
    if (verdict === 'edited' && !draft.trim()) { setError('The reply is empty.'); return; }
    setBusy(true); setError('');
    try {
      await api(`/decisions/${d.id}`, { body: verdict === 'edited' ? { verdict, text: draft } : { verdict } });
      onDone(verdict === 'reject' ? 'rejected' : 'approved');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [busy, d.id, draft, onDone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') { if (e.key === 'Escape') el?.blur(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'a') void send(edited ? 'edited' : 'approve');
      else if (k === 'r') void send('reject');
      else if (k === 's') void send('skip');
      else if (k === 'e' && d.isReply && d.canEdit && box.current) {
        e.preventDefault();
        const t = box.current; t.focus(); t.setSelectionRange(t.value.length, t.value.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send, edited, d.isReply, d.canEdit]);

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
                <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><Label>Your reply</Label>{edited && <Pill tone="accent" icon="pen">edited</Pill>}</div>
                  {edited && <button onClick={() => setDraft(d.fix)} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-fg"><Icon name="undo" size={13} />Undo edits</button>}
                </div>
                {d.canEdit ? (
                  <textarea ref={box} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Draft reply" rows={Math.min(14, Math.max(5, draft.split('\n').length + 1))}
                    className="w-full resize-y rounded-2xl rounded-tr-md border border-accent/40 bg-accent-soft/40 px-4 py-3.5 text-base leading-relaxed text-fg outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent-soft" />
                ) : <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md border-l-2 border-accent bg-accent-soft/40 px-4 py-3.5 text-base leading-relaxed text-fg">{d.fix}</div>}
              </div>
            </>
          ) : (
            <div className="mt-5 space-y-4">
              <Block label="Issue" text={d.issue} />
              <Block label="Checked" text={d.checked} />
              <Block label="Proposed" text={d.fix} strong />
              {d.action && d.action !== 'None' && (
                <div className="flex gap-2.5 rounded-xl bg-info-soft px-4 py-3 text-sm text-fg-2"><Icon name="play" size={15} className="mt-0.5 text-info" /><div><span className="font-semibold text-info">On approve: </span>{d.action}</div></div>
              )}
            </div>
          )}

          {d.details && (
            <button onClick={() => setMore((v) => !v)} aria-expanded={more} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent-ink">
              {more ? 'Hide details' : d.isReply ? 'Campaign and thread details' : 'More details'}<Icon name="chevronDown" size={15} className={cx('transition', more && 'rotate-180')} />
            </button>
          )}
          {more && <div className="mt-1 whitespace-pre-wrap break-words rounded-xl border border-line bg-sunken px-4 py-3 text-sm leading-relaxed text-fg-2 anim-fade">{d.details}</div>}
          {error && <div className="mt-4"><ErrorBox error={error} /></div>}
        </div>
      </Card>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-4 bg-bg/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:bottom-0 md:mx-0 md:rounded-2xl md:px-0">
        <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
          <Button tone="danger" disabled={busy} onClick={() => void send('reject')} icon="x" kbd="R" compact>{d.isReply ? 'Skip reply' : 'Reject'}</Button>
          <Button disabled={busy} onClick={() => void send('skip')} icon="clock" kbd="S" compact>Later</Button>
          <Button tone="accent" disabled={busy} onClick={() => void send(edited ? 'edited' : 'approve')} icon={d.isReply ? 'send' : 'check'} kbd="A" compact>
            {busy ? 'Saving…' : d.isReply ? (edited ? 'Send edited' : 'Send') : 'Approve'}
          </Button>
        </div>
      </div>
      <div className="mt-2 hidden items-center justify-center gap-3 text-xs text-muted md:flex">
        <Icon name="keyboard" size={15} />
        <span className="flex items-center gap-1"><Kbd>A</Kbd> {d.isReply ? 'send' : 'approve'}</span>
        <span className="flex items-center gap-1"><Kbd>R</Kbd> {d.isReply ? 'skip reply' : 'reject'}</span>
        <span className="flex items-center gap-1"><Kbd>S</Kbd> later</span>
        {d.isReply && d.canEdit && <span className="flex items-center gap-1"><Kbd>E</Kbd> edit</span>}
        {d.isReply && d.canEdit && <span className="flex items-center gap-1"><Kbd>Esc</Kbd> stop editing</span>}
      </div>
      {d.isReply && <p className="mt-2 text-center text-xs text-muted">The engine sends it from the right inbox and closes this card. "Later" keeps it for another time.</p>}
    </>
  );
}

function Block({ label, text, strong }: { label: string; text: string; strong?: boolean }) {
  if (!text) return null;
  return (
    <div className={cx('rounded-xl px-4 py-3', strong ? 'border border-accent/30 bg-accent-soft/40' : 'border border-line bg-sunken')}>
      <Label>{label}</Label>
      <div className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg">{text}</div>
    </div>
  );
}
