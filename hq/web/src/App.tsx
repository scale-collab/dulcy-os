import { useCallback, useEffect, useState } from 'react';
import { api, type User } from './api';
import { cx, go, Icon, IconButton, Loading, Logo, useCounts, useRoute, useTheme, type ThemeMode } from './ui';
import Login from './pages/Login';
import Today from './pages/Today';
import Decisions from './pages/Decisions';
import Tasks from './pages/Tasks';
import Agents from './pages/Agents';
import AgentPage from './pages/AgentPage';
import Chat from './pages/Chat';
import ReportPage from './pages/ReportPage';

const TABS = [
  { key: 'today', label: 'Today', icon: 'sun', count: '' },
  { key: 'decisions', label: 'Decisions', icon: 'inbox', count: 'decisions' },
  { key: 'tasks', label: 'To-do', icon: 'grid', count: 'doNow' },
  { key: 'agents', label: 'Team', icon: 'users', count: '' },
  { key: 'chat', label: 'Chat', icon: 'message', count: '' },
];
const THEMES: { mode: ThemeMode; icon: string; label: string }[] = [
  { mode: 'system', icon: 'monitor', label: 'System' },
  { mode: 'light', icon: 'sun', label: 'Light' },
  { mode: 'dark', icon: 'moon', label: 'Dark' },
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
  const viewKey = page === 'agents' ? `agents/${a ?? ''}` : page === 'report' ? `report/${a}` : page;
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">Skip to content</a>
      <Sidebar active={active} user={user} onSignOut={signOut} />
      <MobileHeader onSignOut={signOut} />
      <div className="md:pl-64">
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pb-14 md:pt-10 lg:px-10">
          <div key={viewKey} className="anim-in">{body}</div>
        </main>
      </div>
      <TabBar active={active} />
    </div>
  );
}

function Sidebar({ active, user, onSignOut }: { active: string; user: User; onSignOut: () => void }) {
  const c = useCounts();
  const [mode, setMode] = useTheme();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface/60 backdrop-blur md:flex">
      <button onClick={() => go('today')} className="mx-3 mt-4 flex min-h-12 items-center gap-3 rounded-xl px-2 text-left hover:bg-hover">
        <Logo className="h-8 w-8" />
        <div><div className="text-[15px] font-semibold leading-tight tracking-tight">Dulcy HQ</div><div className="text-xs text-muted">Operator</div></div>
      </button>
      <nav aria-label="Main" className="mt-6 flex flex-col gap-0.5 px-3">
        {TABS.map((t) => {
          const on = active === t.key;
          const n = t.count ? c[t.count] : undefined;
          return (
            <button key={t.key} onClick={() => go(t.key)} aria-current={on ? 'page' : undefined}
              className={cx('group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition', on ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg')}>
              <Icon name={t.icon} size={18} className={on ? 'text-fg' : 'text-muted group-hover:text-fg'} />
              <span className="flex-1 text-left">{t.label}</span>
              {!!n && <span className={cx('tabular rounded-full px-2 py-0.5 text-xs font-semibold', t.key === 'decisions' ? 'bg-ink text-ink-fg' : 'bg-sunken text-fg-2 border border-line')}>{n}</span>}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 p-3">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-sunken p-1">
          {THEMES.map((t) => (
            <button key={t.mode} role="radio" aria-checked={mode === t.mode} onClick={() => setMode(t.mode)} title={t.label}
              className={cx('flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition', mode === t.mode ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
              <Icon name={t.icon} size={14} />{t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sunken text-sm font-semibold text-fg-2 border border-line">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{user.name}</div><div className="truncate text-xs text-muted">{user.role === 'owner' ? 'Owner' : 'Member'}</div></div>
          <IconButton icon="logout" label="Sign out" onClick={onSignOut} />
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ onSignOut }: { onSignOut: () => void }) {
  const [mode, setMode] = useTheme();
  const i = THEMES.findIndex((t) => t.mode === mode);
  const next = THEMES[(i + 1) % THEMES.length];
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md md:hidden">
      <div className="flex h-14 items-center justify-between pl-4 pr-2">
        <button onClick={() => go('today')} className="flex min-h-11 items-center gap-2.5 font-semibold tracking-tight"><Logo className="h-7 w-7" />Dulcy HQ</button>
        <div className="flex items-center">
          <IconButton icon={THEMES[i].icon} label={`Theme: ${THEMES[i].label}. Switch to ${next.label}`} onClick={() => setMode(next.mode)} />
          <IconButton icon="logout" label="Sign out" onClick={onSignOut} />
        </div>
      </div>
    </header>
  );
}

function TabBar({ active }: { active: string }) {
  const c = useCounts();
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur-md md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const on = active === t.key;
          const n = t.key === 'decisions' ? c.decisions : 0;
          return (
            <button key={t.key} onClick={() => go(t.key)} aria-current={on ? 'page' : undefined}
              className={cx('relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition', on ? 'text-fg' : 'text-muted')}>
              {on && <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
              <span className="relative">
                <Icon name={t.icon} size={22} strokeWidth={on ? 2.1 : 1.8} />
                {!!n && <span className="tabular absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold leading-none text-surface">{n > 99 ? '99+' : n}</span>}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
