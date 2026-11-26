// The client portal (Step 4): a client login's whole app. Its own small shell (the Dulcy logo and
// the client's name, three tabs, no HQ sections). Read only. Every number and line comes from
// /hq/api/portal/*, which the server builds for the session's client only.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type PortalCampaign, type PortalHealth, type PortalLead, type PortalMe, type PortalMeeting, type PortalOverview, type User } from '../api';
import { Card, cx, Empty, ErrorBox, go, Icon, IconButton, Logo, PageSkeleton, PageTitle, Pill, SectionHeader, StatusDot, timeAgo, useTheme, type ThemeMode } from '../ui';

const PAGES = [
  { key: 'overview', label: 'Overview', icon: 'trendUp' },
  { key: 'leads', label: 'Leads', icon: 'reply' },
  { key: 'meetings', label: 'Meetings', icon: 'clock' },
] as const;
type PageKey = (typeof PAGES)[number]['key'];
const THEMES: { mode: ThemeMode; icon: string; label: string }[] = [
  { mode: 'system', icon: 'monitor', label: 'System' },
  { mode: 'light', icon: 'sun', label: 'Light' },
  { mode: 'dark', icon: 'moon', label: 'Dark' },
];

/** A date for people: "Nov 24" (with the year when it is not this year). A plain date (YYYY-MM-DD) stays that day. */
export function niceDate(iso: string): string {
  if (!iso) return '';
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}
const num = (x: number) => x.toLocaleString('en-US');
const HEALTH: Record<PortalHealth, { tone: 'good' | 'warn' | 'bad'; label: string }> = {
  healthy: { tone: 'good', label: 'Healthy' },
  watching: { tone: 'warn', label: 'Watching' },
  fixing: { tone: 'bad', label: 'Being fixed' },
};

export default function Portal({ user, page, onSignOut }: { user: User; page: string; onSignOut: () => void }) {
  const [client, setClient] = useState('');
  useEffect(() => { api<PortalMe>('/portal/me').then((r) => setClient(r.client.name)).catch(() => undefined); }, []);
  const active: PageKey = PAGES.some((p) => p.key === page) ? (page as PageKey) : 'overview';
  useEffect(() => { document.title = client ? `${client} · Dulcy` : 'Dulcy'; }, [client]);
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">Skip to content</a>
      <Header client={client} user={user} active={active} onSignOut={onSignOut} />
      <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 md:pt-8">
        <div key={active} className="anim-in">
          {active === 'leads' ? <Leads /> : active === 'meetings' ? <Meetings /> : <Overview />}
        </div>
        <p className="mt-10 border-t border-line pt-4 text-center text-xs text-muted">Questions about your results? Reply to any email from your Dulcy team.</p>
      </main>
    </div>
  );
}

function Header({ client, user, active, onSignOut }: { client: string; user: User; active: PageKey; onSignOut: () => void }) {
  const [mode, setMode] = useTheme();
  const i = THEMES.findIndex((t) => t.mode === mode);
  const next = THEMES[(i + 1) % THEMES.length];
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
        <button onClick={() => go('overview')} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
          <Logo className="h-9 w-9" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight tracking-tight text-fg">{client || 'Your results'}</span>
            <span className="block truncate text-xs text-muted">with Dulcy</span>
          </span>
        </button>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {PAGES.map((p) => <TabLink key={p.key} p={p} on={active === p.key} />)}
        </nav>
        <div className="flex shrink-0 items-center">
          <span className="mr-2 hidden max-w-40 truncate text-sm text-muted lg:inline">{user.name}</span>
          <IconButton icon={THEMES[i].icon} label={`Theme: ${THEMES[i].label}. Switch to ${next.label}`} onClick={() => setMode(next.mode)} />
          <IconButton icon="logout" label="Sign out" onClick={onSignOut} />
        </div>
      </div>
      <nav aria-label="Main" className="mx-auto grid max-w-5xl grid-cols-3 gap-1 px-4 pb-2 md:hidden">
        {PAGES.map((p) => <TabLink key={p.key} p={p} on={active === p.key} />)}
      </nav>
    </header>
  );
}

function TabLink({ p, on }: { p: (typeof PAGES)[number]; on: boolean }) {
  return (
    <button onClick={() => go(p.key)} aria-current={on ? 'page' : undefined}
      className={cx('flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition', on ? 'bg-surface text-fg shadow-card border border-line' : 'text-muted hover:bg-hover hover:text-fg')}>
      <Icon name={p.icon} size={16} />{p.label}
    </button>
  );
}

function useLoad<T>(path: string) {
  const [d, setD] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<T>(path).then(setD).catch((e) => setError(e.message)); }, [path]);
  useEffect(load, [load]);
  return { d, error, load };
}

/* ---------- Overview ---------- */
function Overview() {
  const { d, error, load } = useLoad<PortalOverview>('/portal/overview');
  const title = <PageTitle kicker={d?.client.name} title="Your results" sub="Replies and meetings from your cold email campaigns." />;
  if (error && !d) return <>{title}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{title}<PageSkeleton kind="grid" /></>;
  const r = d.results;
  const h = HEALTH[d.health.status];
  return (
    <div>
      {title}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Interested replies" when="Last 7 days" n={r.interested7} />
        <Stat label="Interested replies" when="Last 30 days" n={r.interested30} />
        <Stat label="Meetings booked" when="Last 7 days" n={r.booked7} strong />
        <Stat label="Meetings booked" when="Last 30 days" n={r.booked30} strong />
      </div>

      <Card className="mt-3 flex items-start gap-3">
        <StatusDot tone={h.tone} className="mt-1.5 h-2.5 w-2.5" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg">Deliverability: {d.health.text}</div>
          <div className="mt-0.5 text-sm text-muted">Deliverability means your emails land in the inbox, not in spam. We check it every day.</div>
        </div>
      </Card>

      <section className="mt-8">
        <SectionHeader title={`Live campaigns · ${d.campaigns.length}`} icon="megaphone" />
        {!d.campaigns.length ? (
          <Card><Empty icon="megaphone" title="No live campaign right now" sub="Your next campaign will show here as soon as it starts sending." /></Card>
        ) : (
          <>
            <Card className="hidden p-0 md:block">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="w-2/5 px-5 py-3 font-semibold">Campaign</th><th className="px-3 py-3 text-right font-semibold">Sent</th><th className="px-3 py-3 text-right font-semibold">Replies</th>
                  <th className="px-3 py-3 text-right font-semibold">Interested</th><th className="px-3 py-3 text-right font-semibold">Booked</th><th className="px-5 py-3 font-semibold">Deliverability</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {d.campaigns.map((c, i) => (
                    <tr key={`${c.name}-${i}`}>
                      <td className="max-w-0 px-5 py-3 font-medium text-fg"><div className="truncate">{c.name}</div></td>
                      <td className="tabular px-3 py-3 text-right text-fg-2">{num(c.sent)}</td>
                      <td className="tabular px-3 py-3 text-right text-fg-2">{num(c.replies)}</td>
                      <td className="tabular px-3 py-3 text-right text-fg-2">{num(c.interested)}</td>
                      <td className="tabular px-3 py-3 text-right font-semibold text-fg">{num(c.booked)}</td>
                      <td className="px-5 py-3"><HealthPill h={c.deliverability} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <div className="grid gap-3 md:hidden">{d.campaigns.map((c, i) => <CampaignCard key={`${c.name}-${i}`} c={c} />)}</div>
          </>
        )}
      </section>
      <p className="mt-4 text-xs text-muted">Updated {timeAgo(d.readAt) || 'just now'}. Numbers refresh every minute.</p>
    </div>
  );
}

function Stat({ label, when, n, strong }: { label: string; when: string; n: number; strong?: boolean }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="text-xs font-medium text-muted">{when}</div>
      <div className={cx('tabular mt-1 text-3xl font-bold tracking-tight sm:text-4xl', strong ? 'text-accent-ink' : 'text-fg')}>{num(n)}</div>
      <div className="mt-1 text-sm font-medium text-fg-2">{label}</div>
    </Card>
  );
}

function HealthPill({ h }: { h: PortalHealth }) {
  const x = HEALTH[h];
  return <Pill tone={x.tone}><StatusDot tone={x.tone} className="h-1.5 w-1.5" />{x.label}</Pill>;
}

function CampaignCard({ c }: { c: PortalCampaign }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 font-semibold text-fg [overflow-wrap:anywhere]">{c.name}</div>
        <HealthPill h={c.deliverability} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {([['Sent', c.sent], ['Replies', c.replies], ['Interested', c.interested], ['Booked', c.booked]] as const).map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl bg-sunken px-1 py-2">
            <div className={cx('tabular text-base font-semibold', k === 'Booked' ? 'text-accent-ink' : 'text-fg')}>{num(v)}</div>
            <div className="truncate text-[11px] text-muted">{k}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- Leads ---------- */
type LeadFilter = 'all' | 'booked' | 'sent';
function Leads() {
  const { d, error, load } = useLoad<{ leads: PortalLead[]; days: number; readAt: string }>('/portal/leads');
  const [f, setF] = useState<LeadFilter>('all');
  const title = <PageTitle title="Leads" sub={`People who said yes, in the last ${d?.days ?? 90} days: meetings booked, and leads sent to you to follow up.`} />;
  if (error && !d) return <>{title}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{title}<PageSkeleton kind="list" /></>;
  const counts = { all: d.leads.length, booked: d.leads.filter((l) => l.status === 'booked').length, sent: d.leads.filter((l) => l.status === 'sent').length };
  const rows = d.leads.filter((l) => f === 'all' || l.status === f);
  return (
    <div>
      {title}
      <div role="radiogroup" aria-label="Show" className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-line bg-sunken p-1 sm:inline-grid sm:w-auto">
        {([['all', 'All'], ['booked', 'Booked'], ['sent', 'Sent to you']] as const).map(([k, label]) => (
          <button key={k} role="radio" aria-checked={f === k} onClick={() => setF(k)}
            className={cx('min-h-10 rounded-lg px-3 text-sm font-medium transition', f === k ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
            {label} <span className="tabular text-muted">{counts[k]}</span>
          </button>
        ))}
      </div>
      {!rows.length ? (
        <Card><Empty icon="reply" title="No leads here yet" sub="When a prospect says yes, they show up here." /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">{rows.map((l) => <LeadCard key={l.key} l={l} />)}</div>
      )}
      <p className="mt-4 text-xs text-muted">Updated {timeAgo(d.readAt) || 'just now'}.</p>
    </div>
  );
}

function LeadCard({ l }: { l: PortalLead }) {
  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-sunken text-sm font-semibold text-fg-2">{(l.name || '?').slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-fg [overflow-wrap:anywhere]">{l.name}</span>
            {l.status === 'booked' ? <Pill tone="accent" icon="check">Meeting booked</Pill> : <Pill tone="info" icon="arrowRight">Sent to you</Pill>}
          </div>
          {l.company && <div className="text-sm text-fg-2 [overflow-wrap:anywhere]">{l.company}</div>}
          <div className="mt-0.5 text-xs text-muted">{l.status === 'booked' && l.bookedOn ? `Booked ${niceDate(l.bookedOn)}` : `Replied ${niceDate(l.date)}`}</div>
        </div>
      </div>
      {l.message && <Quote>{l.message}</Quote>}
      {l.email && (
        <a href={`mailto:${l.email}`} className="mt-3 inline-flex min-h-11 items-center gap-2 self-start rounded-xl px-1 text-sm font-medium text-accent-ink hover:underline [overflow-wrap:anywhere]">
          <Icon name="mail" size={16} />{l.email}
        </a>
      )}
    </Card>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="mt-3 whitespace-pre-line rounded-xl border-l-4 border-line-strong bg-sunken px-3 py-2 text-[15px] leading-relaxed text-fg-2 [overflow-wrap:anywhere]">{children}</blockquote>;
}

/* ---------- Meetings ---------- */
function Meetings() {
  const { d, error, load } = useLoad<{ meetings: PortalMeeting[]; days: number; readAt: string }>('/portal/meetings');
  const title = <PageTitle title="Meetings" sub={`Meetings booked for you in the last ${d?.days ?? 90} days.`} />;
  if (error && !d) return <>{title}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{title}<PageSkeleton kind="list" /></>;
  return (
    <div>
      {title}
      {!d.meetings.length ? (
        <Card><Empty icon="clock" title="No meetings booked yet" sub="Booked meetings show up here." /></Card>
      ) : (
        <Card className="divide-y divide-line p-0">
          {d.meetings.map((m) => (
            <div key={m.key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Icon name="check" size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-fg">{m.name}</div>
                <div className="truncate text-sm text-muted">{m.company || 'Company not given'}</div>
              </div>
              <div className="shrink-0 text-right text-sm text-fg-2">Booked<div className="font-medium text-fg">{niceDate(m.bookedOn)}</div></div>
            </div>
          ))}
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">The date is the day the meeting was booked. Updated {timeAgo(d.readAt) || 'just now'}.</p>
    </div>
  );
}
