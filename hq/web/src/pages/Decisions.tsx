import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Decision, type Pile, type User } from '../api';
import { Button, Card, cx, Empty, ErrorBox, ExtLink, go, Label, Loading, PageTitle, Progress, Section, timeAgo } from '../ui';

const PILES: { key: Pile; who: string; icon: string }[] = [
  { key: 'Replies', who: 'Sean', icon: '💬' },
  { key: 'Campaigns', who: 'Atlas · Scribe · Scout', icon: '🚀' },
  { key: 'Fixes', who: 'Riley', icon: '🛠️' },
  { key: 'Money', who: 'Ledger', icon: '💵' },
  { key: 'Other', who: 'Ada · Cole · Sienna', icon: '📌' },
];

export default function Decisions({ user: _user, pile }: { user: User; pile?: string }) {
  const [data, setData] = useState<{ piles: Record<string, Decision[]>; order: Pile[] } | null>(null);
  const [error, setError] = useState('');
  const [handled, setHandled] = useState<string[]>([]);
  const [stats, setStats] = useState({ approved: 0, rejected: 0, skipped: 0 });
  const load = useCallback(() => { setError(''); api('/decisions').then(setData).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  useEffect(() => { setHandled([]); setStats({ approved: 0, rejected: 0, skipped: 0 }); }, [pile]);

  const all = useMemo(() => (data ? data.order.flatMap((p) => data.piles[p] ?? []) : []), [data]);
  if (error) return <><PageTitle title="Decisions" /><ErrorBox error={error} retry={load} /></>;
  if (!data) return <><PageTitle title="Decisions" /><Loading /></>;

  if (!pile) {
    return (
      <div>
        <PageTitle title="Decisions" kicker={all.length ? `${all.length} waiting on you` : 'Nothing waiting'} />
        <div className="grid gap-2 sm:grid-cols-2">
          {PILES.filter((p) => data.order.includes(p.key)).map((p) => {
            const n = data.piles[p.key]?.length ?? 0;
            return (
              <Card key={p.key} onClick={n ? () => go(`decisions/${p.key}`) : undefined} className={cx('p-4', !n && 'opacity-50')}>
                <div className="flex items-center justify-between">
                  <div><div className="font-semibold">{p.icon} {p.key}</div><div className="text-xs text-stone-500 dark:text-stone-400">{p.who}</div></div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-bold dark:bg-white/10">{n}</span>
                </div>
              </Card>
            );
          })}
        </div>
        <Button tone="primary" disabled={!all.length} onClick={() => go('decisions/all')} className="mt-4 w-full">Do them all ({all.length})</Button>
      </div>
    );
  }

  const source = pile === 'all' ? all : data.piles[pile] ?? [];
  const queue = source.filter((d) => !handled.includes(d.id));
  const total = source.length, done = total - queue.length;
  const current = queue[0];
  const back = <button onClick={() => go('decisions')} className="text-sm text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-white">← Piles</button>;
  if (!current) {
    return (
      <div>
        {back}
        <Empty icon="✅" title={pile === 'all' ? 'All decisions cleared' : `${pile} cleared`} sub={`${stats.approved} approved · ${stats.rejected} rejected · ${stats.skipped} skipped`} />
        <div className="flex gap-2"><Button onClick={() => { go('decisions'); load(); }} className="flex-1">Another pile</Button><Button tone="primary" onClick={() => go('tasks')} className="flex-1">Now my to-do →</Button></div>
      </div>
    );
  }
  const onDone = (kind: 'approved' | 'rejected' | 'skipped') => { setHandled((h) => [...h, current.id]); setStats((s) => ({ ...s, [kind]: s[kind] + 1 })); };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">{back}<span className="hidden text-xs text-stone-400 sm:inline">Keys: A approve · R reject · S skip</span></div>
      <Progress done={done} total={total} />
      <DecisionDeckCard key={current.id} d={current} onDone={onDone} />
    </div>
  );
}

function DecisionDeckCard({ d, onDone }: { d: Decision; onDone: (k: 'approved' | 'rejected' | 'skipped') => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [draft, setDraft] = useState(d.fix);
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
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || e.metaKey || e.ctrlKey) return;
      if (e.key === 'a') void send(edited ? 'edited' : 'approve'); else if (e.key === 'r') void send('reject'); else if (e.key === 's') void send('skip');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send, edited]);

  return (
    <>
      <Card className="mt-4">
        <div className="text-xs font-semibold text-stone-500 dark:text-stone-400">{d.agent || 'Agent'}{d.client ? ` · ${d.client}` : ''} · {timeAgo(d.created)}</div>
        <h2 className="mt-1 text-lg font-semibold leading-snug">{d.title}</h2>
        {d.isReply ? (
          <>
            {d.latestMessage ? <Section label="They wrote" text={d.latestMessage} /> : <Section label="They said" text={d.issue} />}
            {d.threadUrl && <div className="mt-2 text-sm"><ExtLink href={d.threadUrl}>Open the thread</ExtLink></div>}
            <Section label="Why this reply" text={d.checked} />
            <div className="mt-4">
              <div className="flex items-center justify-between"><Label>Draft reply{edited ? ' (edited)' : ''}</Label>{edited && <button onClick={() => setDraft(d.fix)} className="text-xs font-medium text-stone-500 underline">Undo my edits</button>}</div>
              {d.canEdit ? (
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(14, Math.max(5, draft.split('\n').length + 1))}
                  className="mt-1.5 w-full resize-y rounded-xl border border-stone-300 bg-stone-50 p-3 text-[15px] leading-6 outline-none focus:border-accent dark:border-white/15 dark:bg-white/5" />
              ) : <div className="mt-1.5 whitespace-pre-wrap border-l-4 border-accent pl-3 text-[15px] leading-6">{d.fix}</div>}
            </div>
          </>
        ) : (
          <>
            <Section label="Issue" text={d.issue} />
            <Section label="Checked" text={d.checked} />
            <Section label="Proposed" text={d.fix} />
            {d.action && d.action !== 'None' && <div className="mt-4 text-sm text-stone-600 dark:text-stone-300"><b>On approve:</b> {d.action}</div>}
          </>
        )}
        {d.details && !d.isReply && <button onClick={() => setMore((v) => !v)} className="mt-3 min-h-11 text-sm font-medium text-accent">{more ? 'Hide details' : 'More details'}</button>}
        {d.details && d.isReply && <button onClick={() => setMore((v) => !v)} className="mt-3 min-h-11 text-sm font-medium text-accent">{more ? 'Hide details' : 'Campaign and thread details'}</button>}
        {more && <Section label="Details" text={d.details} />}
        {error && <div className="mt-3"><ErrorBox error={error} /></div>}
      </Card>
      <div className="sticky bottom-[4.5rem] z-[5] -mx-4 mt-4 grid grid-cols-3 gap-2 bg-[#f7f7f5]/95 px-4 py-2 backdrop-blur sm:bottom-0 dark:bg-[#0b0d12]/95">
        <Button tone="danger" disabled={busy} onClick={() => void send('reject')}>{d.isReply ? 'Skip reply' : '✗ Reject'}</Button>
        <Button disabled={busy} onClick={() => void send('skip')}>Later</Button>
        <Button tone="good" disabled={busy} onClick={() => void send(edited ? 'edited' : 'approve')}>{d.isReply ? (edited ? '✓ Send edited' : '✓ Send') : '✓ Approve'}</Button>
      </div>
      {d.isReply && <p className="mt-2 text-center text-xs text-stone-500 dark:text-stone-400">The engine sends it from the right inbox and closes this card. "Later" keeps it for another time.</p>}
    </>
  );
}
