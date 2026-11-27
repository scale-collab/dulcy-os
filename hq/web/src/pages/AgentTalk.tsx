// Round 3 (Alex 2026-11-27, Team): "where to see agents talking to each other (e.g. Ada ↔ Atlas)".
// #/agents/talk: agent-to-agent exchanges, newest first, filter by agent; tap one to read it (read
// only). Ada asking an agent from a chat, and Ada handing a stalled task back. The owner sees all;
// members see their own chats' exchanges and never Ledger or Sienna (the server decides).
import { useCallback, useEffect, useState } from 'react';
import { api, type AgentExchange, type AgentExchangeDetail } from '../api';
import { Avatar, BackLink, Card, cx, Empty, ErrorBox, go, Icon, PageSkeleton, PageTitle, Pill, timeAgo } from '../ui';
import { Select } from '../charts';
import { TeamTabs } from './AgentWork';

const AGENTS = ['Ada', 'Atlas', 'Scribe', 'Scout', 'Echo', 'Riley', 'Cole', 'Ledger', 'Sienna'];
const readQ = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');
const setQ = (agent: string, open: string) => {
  const q = new URLSearchParams(); if (agent) q.set('agent', agent); if (open) q.set('open', open);
  try { window.history.replaceState(null, '', `#/agents/talk${q.toString() ? `?${q}` : ''}`); } catch { /* display only */ }
};

export default function AgentTalk() {
  const [agent, setAgent] = useState(() => readQ().get('agent') ?? '');
  const [open, setOpen] = useState(() => readQ().get('open') ?? '');
  const [rows, setRows] = useState<AgentExchange[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api<{ conversations: AgentExchange[] }>(`/team/conversations${agent ? `?agent=${encodeURIComponent(agent)}` : ''}`).then((r) => setRows(r.conversations)).catch((e) => setError(e.message));
  }, [agent]);
  useEffect(load, [load]);
  useEffect(() => setQ(agent, open), [agent, open]);
  const title = <><PageTitle title="Team" kicker="Agent conversations" sub="Agents asking each other and handing work back. Read only." /><TeamTabs on="talk" /></>;
  if (error && !rows) return <>{title}<ErrorBox error={error} retry={load} /></>;
  if (!rows) return <>{title}<PageSkeleton kind="list" /></>;
  return (
    <div>
      {title}
      <div className="mb-3 flex items-center gap-2">
        <Select label="Agent" value={agent} onChange={(v) => { setAgent(v); setOpen(''); }} options={[{ value: '', label: 'Every agent' }, ...AGENTS.map((a) => ({ value: a, label: a }))]} />
        <span className="text-xs text-muted">{rows.length} conversation{rows.length === 1 ? '' : 's'}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="overflow-hidden p-0">
          {!rows.length ? <Empty icon="message" title="No agent conversations yet" sub="When Ada asks another agent or hands a task back, it shows here." /> : (
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setOpen(r.id)} aria-pressed={open === r.id} className={cx('flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-hover', open === r.id && 'bg-accent-soft')}>
                    <span className="flex shrink-0 items-center -space-x-1.5"><Avatar name={r.from} size="sm" /><Avatar name={r.to} size="sm" className="ring-2 ring-surface" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted"><span className="font-semibold text-fg-2">{r.from} → {r.to}</span><Pill tone={r.kind === 'ask' ? 'info' : 'warn'}>{r.kind === 'ask' ? 'Asked' : 'Hand-off'}</Pill><span>{timeAgo(r.at)}</span></span>
                      <span className="mt-0.5 block break-words text-[15px] font-medium leading-snug text-fg">{r.title}</span>
                      {r.preview && <span className="mt-0.5 line-clamp-2 block text-sm text-fg-2">{r.preview}</span>}
                    </span>
                    <Icon name="chevronRight" size={16} className="mt-1 shrink-0 text-faint" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="min-w-0">{open ? <Exchange id={open} onClose={() => setOpen('')} /> : <Card><Empty icon="message" title="Pick a conversation" sub="It opens here, read only." /></Card>}</div>
      </div>
    </div>
  );
}

function Exchange({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<AgentExchangeDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setD(null); setError(''); api<AgentExchangeDetail>(`/team/conversations/${encodeURIComponent(id)}`).then(setD).catch((e) => setError(e.message)); }, [id]);
  if (error) return <ErrorBox error={error} />;
  if (!d) return <PageSkeleton kind="list" />;
  return (
    <Card className="lg:sticky lg:top-4">
      <div className="lg:hidden"><BackLink label="All conversations" onClick={onClose} /></div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted"><span className="font-semibold text-fg">{d.exchange.from} → {d.exchange.to}</span><Pill tone={d.exchange.kind === 'ask' ? 'info' : 'warn'}>{d.exchange.kind === 'ask' ? 'Asked' : 'Hand-off'}</Pill><Pill icon="lock">Read only</Pill></div>
      <ol className="mt-3 space-y-3">
        {d.messages.map((m, i) => (
          <li key={i} className="flex items-start gap-3">
            <Avatar name={m.author} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted"><span className="font-semibold text-fg-2">{m.author}</span> · {m.role === 'question' ? (d.exchange.kind === 'ask' ? 'asked' : 'handed back') : m.role === 'answer' ? 'answered' : 'note'} · {timeAgo(m.at)}</div>
              <div className={cx('mt-1 whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm leading-relaxed text-fg', m.role === 'question' ? 'bg-sunken' : 'bg-accent-soft')}>{m.text}</div>
            </div>
          </li>
        ))}
      </ol>
      {d.parent && <button onClick={() => go(`chat/${d.parent!.agent}/${d.parent!.id}`)} className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-accent-ink hover:underline">Open the chat this came from<Icon name="chevronRight" size={15} /></button>}
    </Card>
  );
}
