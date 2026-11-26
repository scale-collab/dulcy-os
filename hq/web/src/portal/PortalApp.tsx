// The client portal app (portal.dulcy.io; preview at hq.dulcy.io/portal). Its own bundle: none of
// HQ's internal screens are in it. Every number comes from /hq/api/portal/*, built on the server for
// the session's client only.
//
// v3 (2026-11-26, Alex: "simpler to read, so not like 4 different sections"): three tabs.
//   Home    "How it's going": results, our next call, Needs you, campaigns (+ the pages under it)
//   Leads   "Your leads": one list with stage chips and a Meetings chip, and each lead's page
//   Account "Your account": rows that open sheets (onboarding, documents, logins, billing, ...)
// Every older route still lands on the right screen, so an old link or bookmark keeps working.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../api';
import { cx, ErrorBox, go, Icon, IconButton, Loading, Logo, useRoute, useTheme, type ThemeMode } from '../ui';
import Auth, { type AuthMode } from './Auth';
import { AiCallerPage, DirectMail, Email, Linkedin } from './Results';
import { CampaignPage, Campaigns } from './Campaigns';
import { Home } from './Home';
import { LEAD_CHIPS, LeadPage, Leads, type LeadChip } from './Leads';
import { OurMeetings, Schedule, Tasks } from './More';
import { AccountTab, SHEETS, type SheetKey } from './Account';
import type { Session } from './types';

type Tab = 'home' | 'leads' | 'account';
const TABS: { key: Tab; label: string; icon: string }[] = [{ key: 'home', label: 'Home', icon: 'home' }, { key: 'leads', label: 'Leads', icon: 'users' }, { key: 'account', label: 'Account', icon: 'user' }];
const LEAD_PAGES = ['leads', 'lead', 'pipeline', 'meetings', 'feedback'];
const isSheet = (x: string): x is SheetKey => (SHEETS as readonly string[]).includes(x);
const tabOf = (page: string): Tab => (LEAD_PAGES.includes(page) ? 'leads' : page === 'account' || page === 'more' || isSheet(page) ? 'account' : 'home');
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
  const refresh = () => api<Session>('/portal/session').then(setSession).catch(() => undefined);
  const [, a, b] = route;
  const tab = tabOf(page);
  let body: ReactNode;
  switch (page) {
    // Under Home
    case 'campaigns': body = <Campaigns view="list" />; break;
    case 'calendar': body = <Campaigns view="calendar" />; break;
    case 'campaign': body = <CampaignPage id={a ?? ''} review={b === 'review'} />; break;
    case 'email': body = <Email />; break;
    case 'linkedin': body = <Linkedin />; break;
    case 'ai-caller': body = <AiCallerPage />; break;
    case 'mail': body = <DirectMail session={session} />; break;
    case 'our-meetings': body = <OurMeetings />; break;
    case 'schedule': body = <Schedule session={session} />; break;
    case 'tasks': body = <Tasks onChange={refresh} />; break;
    // Leads (the old Pipeline, Booked meetings and Call feedback pages are chips now)
    case 'leads': body = <Leads chip={LEAD_CHIPS.includes(a as LeadChip) ? (a as LeadChip) : 'all'} />; break;
    case 'pipeline': body = <Leads chip="all" />; break;
    case 'meetings': case 'feedback': body = <Leads chip="meetings" />; break;
    case 'lead': body = <LeadPage id={a ?? ''} open={b === 'feedback' || b === 'deal' ? b : undefined} />; break;
    default:
      if (tab === 'account') {
        const sheet = page === 'account' ? (a && isSheet(a) ? a : null) : isSheet(page) ? page : null;
        body = <AccountTab session={session} sheet={sheet} onSignOut={signOut} onChanged={refresh} onRenamed={(name) => setSession({ ...session, user: { ...session.user, name } })} />;
      } else body = <Home session={session} onChanged={refresh} />;
  }
  // The Account list stays put while a sheet opens over it; a Leads chip change keeps the list loaded.
  const viewKey = tab === 'account' ? 'account' : page === 'leads' || page === 'pipeline' || page === 'meetings' || page === 'feedback' ? 'leads' : `${page}/${a ?? ''}`;
  const needs = session.badges.needs ?? 0;
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">Skip to content</a>
      <Header session={session} tab={tab} needs={needs} />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pb-14 md:pt-8 lg:px-10">
        <div key={viewKey} className="anim-in">{body}</div>
        <p className="mt-12 border-t border-line pt-4 text-center text-xs text-muted">Questions? Reply to any email from your Dulcy team.</p>
      </main>
      <BottomBar tab={tab} needs={needs} />
    </div>
  );
}

/** The one count badge in the portal: what waits on the client (the Home "Needs you" card). */
function NeedsBadge({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return <span aria-hidden="true" className={cx('tabular grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold leading-none text-accent-fg', className)}>{n}</span>;
}
const tabLabel = (t: { key: Tab; label: string }, needs: number) => (t.key === 'home' && needs ? `${t.label}: ${needs} thing${needs === 1 ? '' : 's'} need${needs === 1 ? 's' : ''} you` : t.label);

/** Top bar: the client's name; on a computer also the three tabs. The bell opens Account → Notifications. */
function Header({ session, tab, needs }: { session: Session; tab: Tab; needs: number }) {
  const [mode, setMode] = useTheme();
  const i = THEMES.findIndex((t) => t.mode === mode); const next = THEMES[(i + 1) % THEMES.length];
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 pl-4 pr-1 sm:pl-6 sm:pr-4 md:h-16 lg:px-10">
        <button onClick={() => go('home')} className="flex min-h-11 min-w-0 items-center gap-2.5 text-left md:mr-4">
          <Logo className="h-7 w-7 md:h-8 md:w-8" />
          <span className="min-w-0"><span className="block truncate text-[15px] font-semibold leading-tight tracking-tight">{session.client.name}</span><span className="hidden text-xs text-muted md:block">with Dulcy</span></span>
        </button>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => go(t.key)} aria-current={tab === t.key ? 'page' : undefined} aria-label={tabLabel(t, needs)}
              className={cx('flex min-h-10 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition', tab === t.key ? 'bg-accent-soft text-accent-ink' : 'text-fg-2 hover:bg-hover hover:text-fg')}>
              <Icon name={t.icon} size={17} />{t.label}{t.key === 'home' && <NeedsBadge n={needs} />}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center">
          <span className="relative">
            <IconButton icon="bell" label={session.badges.unread ? `Notifications: ${session.badges.unread} new` : 'Notifications'} onClick={() => go('account/notifications')} />
            {!!session.badges.unread && <span aria-hidden="true" className="pointer-events-none absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent ring-2 ring-bg" />}
          </span>
          <IconButton icon={THEMES[i].icon} label={`Theme: ${THEMES[i].label}. Switch to ${next.label}`} onClick={() => setMode(next.mode)} />
        </div>
      </div>
    </header>
  );
}

/** Phone: the same three tabs at the bottom. */
function BottomBar({ tab, needs }: { tab: Tab; needs: number }) {
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur-md md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-3">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => go(t.key)} aria-current={on ? 'page' : undefined} aria-label={tabLabel(t, needs)}
              className={cx('relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition', on ? 'text-fg' : 'text-muted')}>
              {on && <span aria-hidden="true" className="absolute top-0 h-0.5 w-10 rounded-full bg-accent" />}
              <span className="relative"><Icon name={t.icon} size={23} strokeWidth={on ? 2.1 : 1.8} />
                {t.key === 'home' && <NeedsBadge n={needs} className="absolute -right-3 -top-1.5" />}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
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
