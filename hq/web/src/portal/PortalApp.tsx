// The client portal app (portal.dulcy.io; preview at hq.dulcy.io/portal). Its own bundle: none of
// HQ's internal screens are in it. Every number comes from /hq/api/portal/*, built on the server for
// the session's client only.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type User } from '../api';
import { cx, ErrorBox, go, Icon, IconButton, Loading, Logo, useRoute, useTheme, type ThemeMode } from '../ui';
import Auth, { type AuthMode } from './Auth';
import { AiCallerPage, DirectMail, Email, Home, Linkedin } from './Results';
import { CalendarPage, CampaignPage, Campaigns } from './Campaigns';
import { LeadPage, Leads, Pipeline } from './Leads';
import { Access, Account, Billing, Documents, FeedbackPage, Meetings, Notifications, Onboarding, OurMeetings, Pathway, Schedule, Tasks } from './More';
import type { Session } from './types';

interface NavItem { key: string; label: string; icon: string; badge?: keyof Session['badges']; off?: boolean; href?: string }
interface NavGroup { title: string; items: NavItem[] }
function navGroups(s: Session): NavGroup[] {
  return [
    { title: '', items: [{ key: 'home', label: 'Home', icon: 'home' }] },
    { title: 'Results', items: [
      { key: 'email', label: 'Email', icon: 'mail', off: !s.channels.email },
      { key: 'linkedin', label: 'LinkedIn', icon: 'users', off: !s.channels.linkedin },
      { key: 'ai-caller', label: 'AI caller', icon: 'phone', off: !s.channels.aiCaller },
      { key: 'mail', label: 'Direct mail', icon: 'send', off: !s.channels.directMail },
    ] },
    { title: 'Campaigns', items: [{ key: 'campaigns', label: 'Campaigns', icon: 'megaphone', badge: 'review' }, { key: 'calendar', label: 'Calendar', icon: 'calendar' }] },
    { title: 'Leads & pipeline', items: [{ key: 'pipeline', label: 'Pipeline', icon: 'layers' }, { key: 'leads', label: 'Leads', icon: 'reply' }] },
    { title: 'Meetings', items: [
      { key: 'meetings', label: 'Booked meetings', icon: 'check' }, { key: 'feedback', label: 'Call feedback', icon: 'star', badge: 'feedback' },
      { key: 'our-meetings', label: 'Meetings with us', icon: 'message' }, { key: 'schedule', label: 'Book a call', icon: 'calendar' },
    ] },
    { title: 'Tasks & onboarding', items: [{ key: 'tasks', label: 'Tasks for you', icon: 'list', badge: 'tasks' }, { key: 'onboarding', label: 'Onboarding form', icon: 'file' }, { key: 'pathway', label: 'Getting started', icon: 'flag' }] },
    { title: 'Docs & access', items: [
      { key: 'documents', label: 'Documents', icon: 'folder' }, { key: 'access', label: 'Access & logins', icon: 'key' },
      { key: 'esp', label: 'Dulcy ESP portal', icon: 'external', href: s.go.esp }, { key: 'partnership', label: 'Partnership info', icon: 'external', href: s.go.partnership },
    ] },
    { title: 'Billing & account', items: [{ key: 'billing', label: 'Billing', icon: 'dollar' }, { key: 'notifications', label: 'Notifications', icon: 'bell', badge: 'unread' }, { key: 'account', label: 'Account', icon: 'shield' }] },
  ];
}
/** Which nav item a route belongs to (detail pages light their list). */
const owner = (page: string) => (page === 'campaign' ? 'campaigns' : page === 'lead' ? 'pipeline' : page);
const BOTTOM = [{ key: 'home', label: 'Home', icon: 'home' }, { key: 'email', label: 'Results', icon: 'trendUp' }, { key: 'pipeline', label: 'Leads', icon: 'layers' }, { key: 'meetings', label: 'Meetings', icon: 'calendar' }] as const;
const THEMES: { mode: ThemeMode; icon: string; label: string }[] = [{ mode: 'system', icon: 'monitor', label: 'System' }, { mode: 'light', icon: 'sun', label: 'Light' }, { mode: 'dark', icon: 'moon', label: 'Dark' }];
const AUTH: AuthMode[] = ['login', 'signup', 'forgot', 'set-password'];

export default function PortalApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [error, setError] = useState('');
  const route = useRoute();
  const load = useCallback(() => {
    api<Session>('/portal/session').then((s) => { setSession(s); setError(''); })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) {
          // A Dulcy team login: its place is HQ.
          api<{ staffUrl: string }>('/auth/config').then((c) => window.location.assign(c.staffUrl)).catch(() => setSession(null));
          return;
        }
        if (e instanceof ApiError && e.status === 404) { setError(e.message); setSession(null); return; }
        setSession(null);
      });
  }, []);
  useEffect(() => { load(); const out = () => setSession(null); window.addEventListener('hq:signed-out', out); return () => window.removeEventListener('hq:signed-out', out); }, [load]);
  useEffect(() => { document.title = session ? `${session.client.name} · Dulcy` : 'Dulcy client portal'; }, [session]);

  const page = route[0] === 'today' ? 'home' : route[0];
  // A one-time set-password link works whoever is signed in on this device.
  if (page === 'set-password') return <Auth mode="set-password" onIn={() => { go('home'); load(); }} />;
  if (session === undefined) return <Loading what="Opening your portal" />;
  if (!session) {
    if (error) return <NotLinked error={error} onSignOut={async () => { try { await api('/auth/logout', { body: {} }); } catch { /* ok */ } setError(''); go('login'); }} />;
    return <Auth mode={AUTH.includes(page as AuthMode) ? (page as AuthMode) : 'login'} onIn={() => { go('home'); load(); }} />;
  }
  if (AUTH.includes(page as AuthMode)) { go('home'); }
  const signOut = async () => { try { await api('/auth/logout', { body: {} }); } catch { /* signed out anyway */ } setSession(null); go('login'); };
  const groups = navGroups(session);
  const refresh = () => api<Session>('/portal/session').then(setSession).catch(() => undefined);
  const [, a] = route;
  let body: ReactNode;
  switch (page) {
    case 'email': body = <Email />; break;
    case 'linkedin': body = <Linkedin />; break;
    case 'ai-caller': body = <AiCallerPage />; break;
    case 'mail': body = <DirectMail session={session} />; break;
    case 'campaigns': body = <Campaigns />; break;
    case 'campaign': body = <CampaignPage id={a ?? ''} />; break;
    case 'calendar': body = <CalendarPage />; break;
    case 'pipeline': body = <Pipeline />; break;
    case 'leads': body = <Leads />; break;
    case 'lead': body = <LeadPage id={a ?? ''} />; break;
    case 'meetings': body = <Meetings />; break;
    case 'feedback': body = <FeedbackPage />; break;
    case 'our-meetings': body = <OurMeetings />; break;
    case 'schedule': body = <Schedule session={session} />; break;
    case 'tasks': body = <Tasks />; break;
    case 'onboarding': body = <Onboarding />; break;
    case 'pathway': body = <Pathway />; break;
    case 'documents': body = <Documents />; break;
    case 'access': body = <Access />; break;
    case 'billing': body = <Billing />; break;
    case 'notifications': body = <Notifications onChange={refresh} />; break;
    case 'account': body = <Account session={session} onRenamed={(name) => setSession({ ...session, user: { ...session.user, name } })} />; break;
    case 'more': body = <MoreMenu groups={groups} session={session} />; break;
    default: body = <Home session={session} />;
  }
  const active = owner(page);
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">Skip to content</a>
      <Sidebar groups={groups} session={session} active={active} onSignOut={signOut} />
      <MobileHeader session={session} onSignOut={signOut} />
      <div className="md:pl-64">
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pb-14 md:pt-10 lg:px-10">
          <div key={`${page}/${a ?? ''}`} className="anim-in">{body}</div>
          <p className="mt-12 border-t border-line pt-4 text-center text-xs text-muted">Questions? Reply to any email from your Dulcy team.</p>
        </main>
      </div>
      <BottomBar active={active} groups={groups} session={session} />
    </div>
  );
}

function Badge({ n, strong }: { n: number; strong?: boolean }) {
  if (!n) return null;
  return <span className={cx('tabular rounded-full px-2 py-0.5 text-xs font-semibold', strong ? 'bg-accent text-accent-fg' : 'bg-sunken text-muted border border-line')}>{n}</span>;
}
function NavButton({ item, on, n }: { item: NavItem; on: boolean; n: number }) {
  const cls = cx('group flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium transition', on ? 'bg-accent-soft text-accent-ink' : 'text-fg-2 hover:bg-hover hover:text-fg');
  const inner = (<><Icon name={item.icon} size={17} className={on ? 'text-accent-ink' : 'text-muted group-hover:text-fg'} /><span className="flex-1 truncate text-left">{item.label}</span>{item.off && <span className="text-[11px] font-normal text-faint">not active</span>}<Badge n={n} strong={item.badge !== 'unread'} /></>);
  if (item.href) return <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>;
  return <button onClick={() => go(item.key)} aria-current={on ? 'page' : undefined} className={cls}>{inner}</button>;
}

function Sidebar({ groups, session, active, onSignOut }: { groups: NavGroup[]; session: Session; active: string; onSignOut: () => void }) {
  const [mode, setMode] = useTheme();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface/60 backdrop-blur md:flex">
      <button onClick={() => go('home')} className="mx-3 mt-4 flex min-h-12 items-center gap-3 rounded-xl px-2 text-left hover:bg-hover">
        <Logo className="h-8 w-8" />
        <div className="min-w-0"><div className="truncate text-[15px] font-semibold leading-tight tracking-tight">{session.client.name}</div><div className="text-xs text-muted">with Dulcy</div></div>
      </button>
      <nav aria-label="Main" className="mt-4 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.title || 'top'}>
            {g.title && <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{g.title}</div>}
            <div className="space-y-0.5">{g.items.map((it) => <NavButton key={it.key} item={it} on={active === it.key} n={it.badge ? session.badges[it.badge] : 0} />)}</div>
          </div>
        ))}
      </nav>
      <div className="space-y-3 border-t border-line p-3">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-sunken p-1">
          {THEMES.map((t) => (
            <button key={t.mode} role="radio" aria-checked={mode === t.mode} onClick={() => setMode(t.mode)} title={t.label}
              className={cx('flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition', mode === t.mode ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
              <Icon name={t.icon} size={14} />{t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-xl px-2 py-1">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-sunken text-sm font-semibold text-fg-2">{(session.user.name || session.user.email).slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{session.user.name}</div><div className="truncate text-xs text-muted">{session.user.email}</div></div>
          <IconButton icon="logout" label="Sign out" onClick={onSignOut} />
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [mode, setMode] = useTheme();
  const i = THEMES.findIndex((t) => t.mode === mode); const next = THEMES[(i + 1) % THEMES.length];
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md md:hidden">
      <div className="flex h-14 items-center gap-2 pl-4 pr-1">
        <button onClick={() => go('home')} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left"><Logo className="h-7 w-7" /><span className="truncate text-[15px] font-semibold tracking-tight">{session.client.name}</span></button>
        <span className="relative">
          <IconButton icon="bell" label={session.badges.unread ? `Notifications: ${session.badges.unread} new` : 'Notifications'} onClick={() => go('notifications')} />
          {!!session.badges.unread && <span aria-hidden="true" className="tabular pointer-events-none absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-fg">{session.badges.unread}</span>}
        </span>
        <IconButton icon={THEMES[i].icon} label={`Theme: ${THEMES[i].label}. Switch to ${next.label}`} onClick={() => setMode(next.mode)} />
        <IconButton icon="logout" label="Sign out" onClick={onSignOut} />
      </div>
    </header>
  );
}

const RESULTS = ['email', 'linkedin', 'ai-caller', 'mail'];
const LEADS = ['pipeline', 'leads'];
const MEETINGS = ['meetings', 'feedback', 'our-meetings', 'schedule'];
function BottomBar({ active, groups, session }: { active: string; groups: NavGroup[]; session: Session }) {
  const inTab = (k: string) => (k === 'email' ? RESULTS.includes(active) : k === 'pipeline' ? LEADS.includes(active) : k === 'meetings' ? MEETINGS.includes(active) : active === k);
  const onMore = !groups.slice(0, 1).concat(groups.filter((g) => ['Results', 'Leads & pipeline', 'Meetings'].includes(g.title))).some((g) => g.items.some((x) => x.key === active));
  const moreN = session.badges.tasks + session.badges.review;
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur-md md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {[...BOTTOM, { key: 'more', label: 'More', icon: 'menu' } as const].map((t) => {
          const on = t.key === 'more' ? onMore : inTab(t.key);
          const n = t.key === 'more' ? moreN : t.key === 'meetings' ? session.badges.feedback : 0;
          return (
            <button key={t.key} onClick={() => go(t.key)} aria-current={on ? 'page' : undefined}
              className={cx('relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition', on ? 'text-fg' : 'text-muted')}>
              {on && <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
              <span className="relative"><Icon name={t.icon} size={22} strokeWidth={on ? 2.1 : 1.8} />
                {!!n && <span className="tabular absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-fg">{n}</span>}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Phone: everything in one list (the bottom bar holds four). Sub-tabs of Results, Leads and Meetings are here too. */
function MoreMenu({ groups, session }: { groups: NavGroup[]; session: Session }) {
  return (
    <div>
      <h1 className="mb-5 text-[26px] font-bold leading-tight tracking-tight text-fg">Everything</h1>
      <div className="space-y-5">
        {groups.filter((g) => g.title).map((g) => (
          <section key={g.title}>
            <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{g.title}</div>
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
              {g.items.map((it) => {
                const n = it.badge ? session.badges[it.badge] : 0;
                const inner = (<><Icon name={it.icon} size={18} className="text-muted" /><span className="flex-1 text-left text-[15px] font-medium text-fg">{it.label}</span>{it.off && <span className="text-xs text-faint">not active</span>}<Badge n={n} strong />{!it.href && <Icon name="chevronRight" size={16} className="text-faint" />}</>);
                return it.href
                  ? <a key={it.key} href={it.href} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-3 px-4">{inner}</a>
                  : <button key={it.key} onClick={() => go(it.key)} className="flex min-h-12 w-full items-center gap-3 px-4">{inner}</button>;
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function NotLinked({ error, onSignOut }: { error: string; onSignOut: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm text-center anim-in">
        <Logo className="mx-auto h-12 w-12" />
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Almost there</h1>
        <div className="mt-4"><ErrorBox error={error} /></div>
        <button onClick={onSignOut} className="mt-5 min-h-11 text-sm font-semibold text-accent-ink">Sign out</button>
      </div>
    </div>
  );
}
