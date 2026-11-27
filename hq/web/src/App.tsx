import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, setViewAsMember, switchViewAsMember, viewingAsMember, type PortalMe, type User } from './api';
import { cx, go, Icon, IconButton, Loading, Logo, setCount, Toaster, useCounts, useRoute, useTheme, type ThemeMode } from './ui';
import Login from './pages/Login';
import Today from './pages/Today';
import Decisions from './pages/Decisions';
import Tasks from './pages/Tasks';
import Needs from './pages/Needs';
import Agents from './pages/Agents';
import AgentPage from './pages/AgentPage';
import Chat from './pages/Chat';
import ReportPage from './pages/ReportPage';
import Clients from './pages/Clients';
import ClientPage from './pages/ClientPage';
import Users from './pages/Users';
import Inbox, { ThreadPage } from './pages/Inbox';
import Campaigns from './pages/Campaigns';
import Deliverability from './pages/Deliverability';
import Content from './pages/Content';
import Sales from './pages/Sales';

// Menu order (Alex, 2026-11-27): agency first, Content at the bottom, then Users (owner).
const TABS: { key: string; label: string; icon: string; count: string; ownerOnly?: boolean }[] = [
  { key: 'today', label: 'Today', icon: 'sun', count: '' },
  { key: 'decisions', label: 'Decisions', icon: 'inbox', count: 'decisions' },
  { key: 'inbox', label: 'Inbox', icon: 'reply', count: 'inbox' },
  { key: 'needs', label: 'Needs you', icon: 'bell', count: 'needs' },
  { key: 'clients', label: 'Clients', icon: 'briefcase', count: '' },
  // Sales: owner only (money). Phone: reached from the Clients page (the header is full at 390 px).
  { key: 'sales', label: 'Sales', icon: 'dollar', count: 'sales', ownerOnly: true },
  { key: 'campaigns', label: 'Campaigns', icon: 'megaphone', count: 'campaigns' },
  { key: 'deliverability', label: 'Deliverability', icon: 'mail', count: 'deliverability' },
  { key: 'agents', label: 'Team', icon: 'users', count: '' },
  { key: 'chat', label: 'Chat', icon: 'message', count: '' },
  // Content is Alex-only (members get 403). On the phone it is a card on Today, not a 7th header icon.
  { key: 'content', label: 'Content', icon: 'film', count: 'content', ownerOnly: true },
];
const THEMES: { mode: ThemeMode; icon: string; label: string }[] = [
  { mode: 'system', icon: 'monitor', label: 'System' },
  { mode: 'light', icon: 'sun', label: 'Light' },
  { mode: 'dark', icon: 'moon', label: 'Dark' },
];

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  // "View as member": the owner sees what a member (Josh) sees, read only. The server decides (X-HQ-View).
  const [viewing, setViewing] = useState(false);
  const route = useRoute();
  const load = useCallback(() => {
    api<{ user: User; signups?: number; viewing?: string }>('/me').then((r) => {
      setUser(r.user); setCount('signups', r.signups ?? 0);
      const on = r.viewing === 'member';
      if (!on && viewingAsMember()) setViewAsMember(false); // not an owner (or the server said no): forget it
      setViewing(on);
    })
      // A client login gets 403 on every HQ route: it has the portal instead (/portal/me).
      .catch((e) => (e instanceof ApiError && e.status === 403 ? api<PortalMe>('/portal/me').then((r) => setUser(r.user)) : Promise.reject(e)))
      .catch(() => setUser(null));
  }, []);
  useEffect(() => { load(); const out = () => setUser(null); window.addEventListener('hq:signed-out', out); return () => window.removeEventListener('hq:signed-out', out); }, [load]);

  if (user === undefined) return <Loading what="Opening HQ" />;
  if (!user) return <Login onIn={(u) => { setUser(u); go(u.role === 'client' ? 'overview' : 'today'); }} />;

  const [page, a, b, c] = route;
  const signOut = async () => { try { await api('/auth/logout', { body: {} }); } catch { /* signed out anyway */ } setUser(null); };
  // Client logins: their own app, the portal (its own bundle; the server refuses them everything else).
  if (user.role === 'client') { window.location.replace(window.location.pathname.startsWith('/hq/') ? '/hq/portal/' : '/portal/'); return <Loading what="Opening your portal" />; }
  let body;
  switch (page) {
    case 'decisions': body = <Decisions user={user} pile={a} client={b} />; break;
    case 'clients': body = a ? <ClientPage id={a} user={user} tab={b} sub={c} /> : <Clients user={user} />; break;
    case 'inbox': body = <Inbox tab={a} client={b} />; break;
    case 'deliverability': body = <Deliverability tab={a} client={b} status={c} />; break;
    case 'thread': body = <ThreadPage id={a ?? ''} />; break;
    case 'campaigns': body = <Campaigns a={a} b={b} />; break;
    case 'content': body = user.role === 'owner' ? <Content a={a} b={b} c={c} /> : <Today user={user} />; break;
    case 'sales': body = <Sales user={user} a={a} b={b} />; break;
    case 'users': body = <Users user={user} />; break;
    case 'needs': body = <Needs user={user} />; break;
    // The old Eisenhower to-do (Airtable Tasks): still at #/tasks, out of the main navigation.
    case 'tasks': body = <Tasks />; break;
    case 'agents': body = a ? <AgentPage name={a} /> : <Agents />; break;
    case 'chat': body = <Chat user={user} agent={a || 'Ada'} threadId={b ? Number(b) : undefined} />; break;
    case 'report': body = <ReportPage id={Number(a)} />; break;
    default: body = <Today user={user} />;
  }
  const active = page === 'report' ? 'today' : page === 'thread' ? 'inbox' : page === 'users' ? 'users' : page === 'tasks' ? 'needs' : TABS.some((t) => t.key === page) ? page : 'today';
  const viewKey = page === 'agents' || page === 'clients' || page === 'thread' || page === 'campaigns' || page === 'sales' ? `${page}/${a ?? ''}` : page === 'report' ? `report/${a}` : page;
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">Skip to content</a>
      <Sidebar active={active} user={user} onSignOut={signOut} viewing={viewing} />
      <MobileHeader onSignOut={signOut} owner={user.role === 'owner'} active={active} />
      <div className="md:pl-64">
        {viewing && <ViewingBanner />}
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pb-14 md:pt-10 lg:px-10">
          <div key={viewKey} className="anim-in">{body}</div>
        </main>
      </div>
      <TabBar active={active === 'sales' ? 'clients' : active} />
      <Toaster />
    </div>
  );
}

function ViewingBanner() {
  return (
    <div role="status" className="sticky top-14 z-20 border-b border-warn/40 bg-warn-soft md:top-0">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 sm:px-6 lg:px-10">
        <Icon name="user" size={17} className="shrink-0 text-warn" />
        <span className="min-w-0 flex-1 text-sm font-medium text-fg">Viewing as a member (what Josh sees). Read only.</span>
        <button onClick={() => switchViewAsMember(false)} className="min-h-10 shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-ink-fg hover:bg-ink-hover">Exit</button>
      </div>
    </div>
  );
}

function Sidebar({ active, user, onSignOut, viewing }: { active: string; user: User; onSignOut: () => void; viewing: boolean }) {
  const c = useCounts();
  const [mode, setMode] = useTheme();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface/60 backdrop-blur md:flex">
      <button onClick={() => go('today')} className="mx-3 mt-4 flex min-h-12 items-center gap-3 rounded-xl px-2 text-left hover:bg-hover">
        <Logo className="h-8 w-8" />
        <div><div className="text-[15px] font-semibold leading-tight tracking-tight">Dulcy HQ</div><div className="text-xs text-muted">Operator</div></div>
      </button>
      <nav aria-label="Main" className="mt-6 flex flex-col gap-0.5 px-3">
        {TABS.filter((t) => !t.ownerOnly || user.role === 'owner').map((t) => {
          const on = active === t.key;
          const n = t.count ? c[t.count] : undefined;
          return (
            <button key={t.key} onClick={() => go(t.key)} aria-current={on ? 'page' : undefined}
              className={cx('group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition', on ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg')}>
              <Icon name={t.icon} size={18} className={on ? 'text-fg' : 'text-muted group-hover:text-fg'} />
              <span className="flex-1 text-left">{t.label}</span>
              {!!n && <span className={cx('tabular rounded-full px-2 py-0.5 text-xs font-semibold', t.key === 'decisions' ? 'bg-ink text-ink-fg' : t.key === 'deliverability' ? 'bg-bad-soft text-bad' : t.key === 'needs' || t.key === 'inbox' || t.key === 'campaigns' || t.key === 'content' || t.key === 'sales' ? 'bg-accent text-accent-fg' : 'bg-sunken text-fg-2 border border-line')}>{n}</span>}
            </button>
          );
        })}
        {user.role === 'owner' && (
          <button onClick={() => go('users')} aria-current={active === 'users' ? 'page' : undefined}
            className={cx('group mt-3 flex min-h-11 items-center gap-3 rounded-xl border-t border-line px-3 pt-px text-[15px] font-medium transition', active === 'users' ? 'bg-hover text-fg' : 'text-muted hover:bg-hover hover:text-fg')}>
            <Icon name="shield" size={18} className={active === 'users' ? 'text-fg' : 'text-muted group-hover:text-fg'} />
            <span className="flex-1 text-left">Users</span>
            {!!c.signups && <span className="tabular rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-ink-fg" aria-label={`${c.signups} sign-up${c.signups === 1 ? '' : 's'} waiting`}>{c.signups}</span>}
          </button>
        )}
      </nav>
      <div className="mt-auto space-y-3 p-3">
        {(user.role === 'owner' || viewing) && (
          <button onClick={() => switchViewAsMember(!viewing)} aria-pressed={viewing}
            className={cx('flex min-h-10 w-full items-center gap-2.5 rounded-xl border px-3 text-sm font-medium transition', viewing ? 'border-warn/40 bg-warn-soft text-fg' : 'border-line text-muted hover:bg-hover hover:text-fg')}>
            <Icon name="user" size={16} /><span className="flex-1 text-left">{viewing ? 'Exit member view' : 'View as member'}</span>
          </button>
        )}
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
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{user.name}</div><div className="truncate text-xs text-muted">{viewing ? 'Owner, viewing as member' : user.role === 'owner' ? 'Owner' : 'Member'}</div></div>
          <IconButton icon="logout" label="Sign out" onClick={onSignOut} />
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ onSignOut, owner, active }: { onSignOut: () => void; owner: boolean; active: string }) {
  const [mode, setMode] = useTheme();
  const c = useCounts();
  const i = THEMES.findIndex((t) => t.mode === mode);
  const next = THEMES[(i + 1) % THEMES.length];
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md md:hidden">
      <div className="flex h-14 items-center justify-between pl-4 pr-2">
        <button onClick={() => go('today')} className="flex min-h-11 items-center gap-2.5 font-semibold tracking-tight"><Logo className="h-7 w-7" /><span className="sr-only">Dulcy HQ</span></button>
        <div className="flex items-center">
          <IconButton icon="megaphone" label="Campaigns" active={active === 'campaigns'} onClick={() => go('campaigns')} />
          <IconButton icon="users" label="Team" active={active === 'agents'} onClick={() => go('agents')} />
          <IconButton icon="mail" label={c.deliverability ? `Deliverability: ${c.deliverability} sick` : 'Deliverability'} active={active === 'deliverability'} onClick={() => go('deliverability')} />
          {owner && (
            <span className="relative">
              <IconButton icon="shield" label={c.signups ? `Users: ${c.signups} sign-up${c.signups === 1 ? '' : 's'} waiting` : 'Users'} onClick={() => go('users')} />
              {!!c.signups && <span aria-hidden="true" className="tabular pointer-events-none absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold leading-none text-surface">{c.signups}</span>}
            </span>
          )}
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
      <div className="mx-auto grid max-w-lg grid-cols-6">
        {/* Phone: Team, Campaigns and Deliverability are icons in the top bar (six tabs fit). */}
        {TABS.filter((t) => t.key !== 'agents' && t.key !== 'campaigns' && t.key !== 'deliverability' && t.key !== 'content' && t.key !== 'sales').map((t) => {
          const on = active === t.key;
          const n = t.key === 'decisions' || t.key === 'needs' || t.key === 'inbox' ? c[t.key] : 0;
          return (
            <button key={t.key} onClick={() => go(t.key)} aria-current={on ? 'page' : undefined}
              className={cx('relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition', on ? 'text-fg' : 'text-muted')}>
              {on && <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
              <span className="relative">
                <Icon name={t.icon} size={22} strokeWidth={on ? 2.1 : 1.8} />
                {!!n && <span className={cx('tabular absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold leading-none', t.key === 'needs' || t.key === 'inbox' ? 'bg-accent text-accent-fg' : 'bg-bad text-surface')}>{n > 99 ? '99+' : n}</span>}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
