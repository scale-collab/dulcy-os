import { useCallback, useEffect, useState } from 'react';
import { api, type User } from './api';
import { cx, go, Loading, useRoute } from './ui';
import Login from './pages/Login';
import Today from './pages/Today';
import Decisions from './pages/Decisions';
import Tasks from './pages/Tasks';
import Agents from './pages/Agents';
import AgentPage from './pages/AgentPage';
import Chat from './pages/Chat';
import ReportPage from './pages/ReportPage';

const TABS = [
  { key: 'today', label: 'Today', icon: '☀️' },
  { key: 'decisions', label: 'Decisions', icon: '✅' },
  { key: 'tasks', label: 'To-do', icon: '📋' },
  { key: 'agents', label: 'Team', icon: '👥' },
  { key: 'chat', label: 'Chat', icon: '💬' },
];

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const route = useRoute();
  const load = useCallback(() => { api<{ user: User }>('/me').then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);
  useEffect(() => { load(); const out = () => setUser(null); window.addEventListener('hq:signed-out', out); return () => window.removeEventListener('hq:signed-out', out); }, [load]);

  if (user === undefined) return <Loading what="Opening HQ" />;
  if (!user) return <Login onIn={(u) => { setUser(u); go('today'); }} />;

  const [page, a, b] = route;
  const signOut = async () => { try { await api('/auth/logout', { body: {} }); } catch { /* signed out anyway */ } setUser(null); };
  let body;
  switch (page) {
    case 'decisions': body = <Decisions user={user} pile={a} />; break;
    case 'tasks': body = <Tasks />; break;
    case 'agents': body = a ? <AgentPage name={a} /> : <Agents />; break;
    case 'chat': body = <Chat user={user} agent={a || 'Ada'} threadId={b ? Number(b) : undefined} />; break;
    case 'report': body = <ReportPage id={Number(a)} />; break;
    default: body = <Today user={user} />;
  }
  const active = page === 'report' ? 'today' : TABS.some((t) => t.key === page) ? page : 'today';
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-stone-200/70 bg-[#f7f7f5]/85 backdrop-blur dark:border-white/10 dark:bg-[#0b0d12]/85">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <button onClick={() => go('today')} className="flex items-center gap-2 font-semibold tracking-tight"><span className="grid h-7 w-7 place-items-center rounded-lg bg-stone-900 text-xs text-emerald-200 dark:bg-white dark:text-stone-900">D</span> Dulcy HQ</button>
          <nav className="hidden gap-1 sm:flex">
            {TABS.map((t) => <button key={t.key} onClick={() => go(t.key)} className={cx('rounded-lg px-3 py-2 text-sm font-medium', active === t.key ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900' : 'text-stone-600 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-white/5')}>{t.label}</button>)}
          </nav>
          <button onClick={signOut} className="rounded-lg px-2 py-2 text-sm text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-white">Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:pb-12">{body}</main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-stone-200/70 bg-[#f7f7f5]/95 backdrop-blur sm:hidden dark:border-white/10 dark:bg-[#0b0d12]/95">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => go(t.key)} className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', active === t.key ? 'text-stone-900 dark:text-white' : 'text-stone-500 dark:text-stone-400')}>
              <span className={cx('text-lg leading-none', active !== t.key && 'opacity-60 grayscale')}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
