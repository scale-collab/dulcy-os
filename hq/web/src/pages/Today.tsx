import { useCallback, useEffect, useState } from 'react';
import { api, type Need, type NeedCounts, type Report, type TeamLine, type User } from '../api';
import {
  Avatar, Button, Card, cleanLine, cx, ErrorBox, go, Icon, IconButton, Inline, Markdown, PageSkeleton, PageTitle,
  setCount, StatusDot, teamTone, timeAgo, toneLabel, type Tone,
} from '../ui';
import { ReportList } from './Reports';
import { NeedFace, whoLabel } from './Needs';
import { ContentCard } from './Content';
import { FixItButton } from '../fixIt';

interface TodayData {
  signups?: number;
  brief: { title: string; body: string; created: string; dryRun: boolean } | null;
  team: TeamLine[];
  decisions: Record<string, number>;
  needs: { top: Need[]; counts: NeedCounts; errors: string[] };
  reports: Report[];
}
export const PILE_ICON: Record<string, string> = { Replies: 'reply', Campaigns: 'megaphone', Fixes: 'wrench', Money: 'dollar', Sales: 'trendUp', Content: 'film', Orchestrator: 'sparkles' };

export default function Today({ user }: { user: User }) {
  const [d, setD] = useState<TodayData | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => {
    setError(''); setRefreshing(true);
    api<TodayData>('/today').then((x) => {
      setD(x);
      setCount('decisions', Object.values(x.decisions).reduce((a, b) => a + b, 0));
      setCount('needs', x.needs.counts.total);
      if (x.signups !== undefined) setCount('signups', x.signups);
    }).catch((e) => setError(e.message)).finally(() => setRefreshing(false));
  }, []);
  useEffect(load, [load]);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const first = (user.name || '').split(' ')[0] || user.name;
  const actions = (
    <div className="hidden items-center gap-2 sm:flex">
      <IconButton icon="refresh" label="Refresh" onClick={load} className={cx('border border-line bg-surface', refreshing && '[&_svg]:animate-spin')} />
      <Button icon="message" onClick={() => go('chat/Ada')}>Ask Ada</Button>
    </div>
  );

  if (error && !d) return <><PageTitle kicker={date} title={`${hello}, ${first}.`} right={actions} /><ErrorBox error={error} retry={load} /></>;
  if (!d) return <><PageTitle kicker={date} title={`${hello}, ${first}.`} right={actions} /><PageSkeleton kind="today" /></>;

  const waiting = Object.values(d.decisions).reduce((a, b) => a + b, 0);
  const reports = d.reports.filter((r) => r.kind !== 'brief');
  const suggestions = suggestionsOf(d);
  const needYou = d.needs.counts.total;
  const off = d.team.filter((t) => t.ok === false);

  return (
    <div>
      <PageTitle kicker={date} title={`${hello}, ${first}.`} right={actions}
        sub={<span className="mt-1 flex flex-wrap items-center gap-2">
          <Stat n={waiting} label={waiting === 1 ? 'decision' : 'decisions'} tone={waiting ? 'warn' : 'good'} />
          <Stat n={needYou} label={needYou === 1 ? 'needs you' : 'need you'} tone={needYou ? 'warn' : 'good'} />
          <Stat n={off.length} label={off.length === 1 ? 'agent needs a look' : 'agents need a look'} tone={off.length ? 'bad' : 'good'} />
          <button onClick={load} aria-label="Refresh" className="-my-2 grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg sm:hidden"><Icon name="refresh" size={17} className={refreshing ? 'animate-spin' : undefined} /></button>
        </span>} />

      {error && <div className="mb-4"><ErrorBox error={error} retry={load} /></div>}

      {/* Each block has its own heading, icon and colour, so it is clear what each part is (Alex, 2026-11-27). */}
      <Block icon="inbox" tone="ink" title="Decisions" sub="Cards waiting for your OK">
        <DecisionHero waiting={waiting} piles={d.decisions} />
      </Block>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <Block icon="sparkles" tone="accent" title="Ada's morning brief" sub="Top 3 and what happened overnight">
            <Brief brief={d.brief} />
          </Block>
          {suggestions.length > 0 && (
            <Block icon="wrench" tone="warn" title="Agent suggestions" sub="Hand it to the agent, or look yourself">
              <Suggestions items={suggestions} />
            </Block>
          )}
          <Block icon="file" tone="plain" title="Reports" sub="What the agents wrote" right={reports.length > 0 && <span className="text-xs text-muted">latest {reports.length}</span>}>
            <ReportList reports={reports} empty="No reports yet. They appear here as the agents write them." />
          </Block>
        </div>
        <div className="order-first min-w-0 space-y-8 lg:order-none">
          <Block icon="bell" tone="info" title="Do now" sub={d.needs.counts.total ? `Top ${Math.min(3, d.needs.top.length)} of ${d.needs.counts.total} in Needs you` : 'From Needs you'}>
            <NeedsNow items={d.needs.top} counts={d.needs.counts} />
          </Block>
          {user.role === 'owner' && <ContentCard />}
          <Block icon="users" tone="good" title="Team check" sub="Did every agent do its job?">
            <TeamCheck team={d.team} />
          </Block>
        </div>
      </div>
    </div>
  );
}

const TONES: Record<'ink' | 'accent' | 'warn' | 'info' | 'good' | 'plain', string> = {
  ink: 'bg-ink text-ink-fg', accent: 'bg-accent-soft text-accent-ink', warn: 'bg-warn-soft text-warn', info: 'bg-info-soft text-info', good: 'bg-good-soft text-good', plain: 'border border-line bg-sunken text-fg',
};
/** One Today block: icon, heading and a short line, then its card. */
function Block({ icon, tone, title, sub, right, children }: { icon: string; tone: keyof typeof TONES; title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-center gap-3">
        <span aria-hidden="true" className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', TONES[tone])}><Icon name={icon} size={18} strokeWidth={2} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold leading-tight tracking-tight text-fg">{title}</h2>
          {sub && <div className="truncate text-xs text-muted">{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

interface Suggestion { key: string; agent: string; title: string; detail: string; from: string }
/** What the agents flag: an agent whose runs failed (Riley fixes systems) and urgent reports (the writer fixes it). */
function suggestionsOf(d: TodayData): Suggestion[] {
  const failed = d.team.filter((t) => t.ok === false && teamTone(t.ok, t.line) === 'bad').map((t) => ({
    key: `team:${t.agent}`, agent: 'Riley', title: `${t.agent}'s runs failed: ${cleanLine(t.line)}`.slice(0, 200), detail: cleanLine(t.line), from: 'Team check',
  }));
  const urgent = d.reports.filter((r) => r.kind !== 'brief' && r.urgent).slice(0, 4).map((r) => ({
    key: `report:${r.id}`, agent: r.agent, title: r.title, detail: r.summary, from: `${r.agent}'s report · ${timeAgo(r.created)}`,
  }));
  return [...urgent, ...failed];
}

function Suggestions({ items }: { items: Suggestion[] }) {
  return (
    <Card className="divide-y divide-line p-0">
      {items.map((s) => (
        <div key={s.key} className="flex gap-3 px-5 py-4">
          <Avatar name={s.agent} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold leading-snug text-fg">{s.title}</div>
            {s.detail && s.detail !== s.title && <div className="mt-0.5 line-clamp-2 text-sm text-fg-2">{s.detail}</div>}
            <div className="mt-0.5 text-xs text-muted">{s.from}</div>
            <FixItButton agent={s.agent} title={s.title} detail={s.detail} className="mt-3" />
          </div>
        </div>
      ))}
    </Card>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: 'good' | 'warn' | 'bad' }) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-[13px] text-fg-2 shadow-card sm:min-h-8 sm:gap-2 sm:px-3 sm:text-sm">
      <StatusDot tone={n ? tone : 'good'} />
      <span className="tabular font-semibold text-fg">{n}</span>{label}
    </span>
  );
}

function DecisionHero({ waiting, piles }: { waiting: number; piles: Record<string, number> }) {
  const parts = Object.entries(piles).filter(([, n]) => n);
  if (!waiting) {
    return (
      <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-ink"><Icon name="check" size={24} strokeWidth={2.4} /></span>
        <div className="min-w-0 flex-1"><div className="text-lg font-semibold tracking-tight">You're all clear</div><div className="text-sm text-muted">No decisions waiting on you. The agents will add cards here when they need you.</div></div>
        <Button onClick={() => go('needs')} icon="bell">Needs you</Button>
      </Card>
    );
  }
  return (
    <section aria-label="Decisions waiting" className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 bg-[radial-gradient(closest-side,var(--accent-soft),transparent)]" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-muted"><Icon name="inbox" size={16} />Waiting on you</div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="tabular text-5xl font-bold tracking-tight sm:text-6xl">{waiting}</span>
            <span className="text-xl font-semibold text-fg-2">{waiting === 1 ? 'decision' : 'decisions'}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {parts.map(([k, n]) => (
              <button key={k} onClick={() => go(`decisions/${k}`)} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-raised px-3 text-sm font-medium text-fg-2 transition hover:border-line-strong hover:text-fg">
                <Icon name={PILE_ICON[k] ?? 'layers'} size={15} className="text-muted" />{k}<span className="tabular font-semibold text-fg">{n}</span>
              </button>
            ))}
          </div>
        </div>
        <Button tone="accent" size="lg" icon="play" onClick={() => go('decisions/all')} className="w-full sm:w-auto">Start deciding</Button>
      </div>
    </section>
  );
}

interface BriefSection { title: string; text: string; items: string[]; ordered: boolean }
/** Ada's brief ("**Heading:** text" lines) → sections. "Top 3" becomes a numbered list; "a · b · c" becomes bullets. */
export function briefSections(body: string): BriefSection[] {
  const out: BriefSection[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const h = /^\*\*([^*]+?)\*\*\s*(.*)$/.exec(line);
    if (h) {
      const title = h[1].replace(/:\s*$/, '').trim();
      const rest = h[2].replace(/^:\s*/, '').trim();
      const ordered = /^Top \d/i.test(title) && /\d+\.\s/.test(rest);
      const items = ordered ? rest.split(/\s*(?:^|\s)\d+\.\s+/).map((s) => s.trim()).filter(Boolean)
        : rest.includes(' · ') ? rest.split(' · ').map((s) => s.trim()).filter(Boolean) : [];
      out.push({ title, text: items.length ? '' : rest, items, ordered });
      continue;
    }
    const bullet = /^[•\-*]\s+(.*)$/.exec(line);
    const last = out[out.length - 1];
    if (bullet && last) { last.items.push(bullet[1]); continue; }
    if (last) last.text = [last.text, line].filter(Boolean).join('\n');
    else out.push({ title: '', text: line, items: [], ordered: false });
  }
  return out;
}

function Brief({ brief }: { brief: TodayData['brief'] }) {
  const [open, setOpen] = useState(false);
  if (!brief) {
    return (
      <Card>
        <div className="flex items-start gap-3"><Avatar name="Ada" /><div><div className="font-semibold">Ada's brief</div><div className="mt-0.5 text-sm text-muted">No brief yet. Ada writes it on weekday mornings (ADA_BRIEF=on).</div></div></div>
      </Card>
    );
  }
  const sections = briefSections(brief.body);
  const isKey = (s: BriefSection) => /^(Waiting on you|Top \d|Overnight)/i.test(s.title);
  const key = sections.filter(isKey);
  const rest = sections.filter((s) => !isKey(s));
  return (
    <Card className="p-0">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <Avatar name="Ada" />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-semibold leading-snug">{brief.title || "Ada's brief"}</div>
          <div className="text-xs text-muted">Ada's brief · {timeAgo(brief.created)}{brief.dryRun ? ' · dry run' : ''}</div>
        </div>
        <Icon name="sparkles" size={18} className="text-muted" />
      </div>
      <div className="space-y-5 px-5 py-5">
        {!sections.length && <Markdown text={brief.body} />}
        {(key.length ? key : sections.slice(0, 2)).map((s, i) => <BriefBlock key={i} s={s} big />)}
        {open && rest.length > 0 && (
          <div className="space-y-4 border-t border-line pt-5 anim-fade">{rest.map((s, i) => <BriefBlock key={i} s={s} />)}</div>
        )}
      </div>
      {rest.length > 0 && key.length > 0 && (
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-12 w-full items-center justify-center gap-1.5 border-t border-line text-sm font-semibold text-accent-ink transition hover:bg-hover">
          {open ? 'Show less' : `Read the whole brief (${rest.length} more)`}<Icon name="chevronDown" size={16} className={cx('transition', open && 'rotate-180')} />
        </button>
      )}
    </Card>
  );
}

function BriefBlock({ s, big }: { s: BriefSection; big?: boolean }) {
  return (
    <div>
      {s.title && <div className={cx('font-semibold', big ? 'text-[15px] text-fg' : 'text-[11px] uppercase tracking-[0.08em] text-muted')}>{s.title}</div>}
      {s.text && <div className={cx('mt-1 whitespace-pre-line leading-relaxed text-fg-2', big ? 'text-[15px]' : 'text-sm')}><Inline text={s.text} /></div>}
      {s.items.length > 0 && (s.ordered ? (
        <ol className="mt-2 space-y-2">
          {s.items.map((it, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-fg-2">
              <span className="tabular mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-ink-fg">{i + 1}</span>
              <span className="min-w-0"><Inline text={it} /></span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {s.items.map((it, i) => <li key={i} className={cx('flex gap-2 leading-relaxed text-fg-2', big ? 'text-[15px]' : 'text-sm')}><span aria-hidden="true" className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-faint" /><span className="min-w-0"><Inline text={it} /></span></li>)}
        </ul>
      ))}
    </div>
  );
}

/** The top 3 of "Needs you": tap one to do it (a route), or open the list. */
function NeedsNow({ items, counts }: { items: Need[]; counts: NeedCounts }) {
  const open = (n: Need) => (n.action && !/^https:\/\//i.test(n.action.href) ? go(n.action.href) : go('needs'));
  return (
    <Card className="p-0">
      {counts.total > 0 && (
        <div className="flex items-center justify-end px-5 pb-1 pt-3">
          <span className="tabular text-xs font-medium text-muted">{`${counts.total} need${counts.total === 1 ? 's' : ''} you`}</span>
        </div>
      )}
      {items.length ? (
        <ul className="px-2">
          {items.map((n) => (
            <li key={n.key}>
              <button onClick={() => open(n)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-hover">
                <NeedFace n={n} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug text-fg"><span className="font-semibold">{whoLabel(n)}:</span> {n.title}</span>
                  {n.why && <span className="mt-0.5 block truncate text-xs text-muted">{n.why}</span>}
                </span>
                <Icon name="chevronRight" size={16} className="text-faint" />
              </button>
            </li>
          ))}
        </ul>
      ) : <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted"><Icon name="check" size={15} />Nothing needs you right now.</div>}
      <div className="border-t border-line p-3"><Button onClick={() => go('needs')} className="w-full" icon="bell">{counts.total > items.length ? `See all ${counts.total}` : 'Open Needs you'}</Button></div>
    </Card>
  );
}

/** Short status for a team tile, from the team check line. */
function shortStatus(t: TeamLine, tone: Tone): string {
  const line = cleanLine(t.line);
  if (tone === 'good') return /\(([^)]+)\)/.exec(line)?.[1] ?? 'ran fine';
  if (tone === 'warn') { const n = /(\d+) decision/.exec(line)?.[1]; return n ? `${n} waiting` : 'needs you'; }
  if (tone === 'bad') return 'failed';
  return 'no runs';
}

function TeamCheck({ team }: { team: TeamLine[] }) {
  const issues = team.filter((t) => t.ok === false);
  return (
    <Card className="p-0">
      <div className="flex items-center justify-end px-5 pb-1 pt-3">
        <span className={cx('text-xs font-medium', issues.length ? 'text-warn' : 'text-good')}>{issues.length ? `${issues.length} need a look` : 'all fine'}</span>
      </div>
      <div className="grid grid-cols-3 gap-1 p-2">
        {team.map((t) => {
          const tone = teamTone(t.ok, t.line);
          return (
            <button key={t.agent} onClick={() => go(`agents/${t.agent}`)} title={cleanLine(t.line)} aria-label={`${t.agent}: ${toneLabel[tone]}. ${cleanLine(t.line)}`}
              className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-center transition hover:bg-hover">
              <span className="relative">
                <Avatar name={t.agent} />
                <StatusDot tone={tone} className="absolute -bottom-0.5 -right-0.5 h-3 w-3 ring-2 ring-surface" />
              </span>
              <span className="text-[13px] font-semibold leading-none text-fg">{t.agent}</span>
              <span className={cx('w-full truncate text-[11px] leading-none', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-muted')}>{shortStatus(t, tone)}</span>
            </button>
          );
        })}
      </div>
      {issues.length > 0 && (
        <ul className="border-t border-line px-2 py-2">
          {issues.map((t) => {
            const tone = teamTone(t.ok, t.line);
            return (
              <li key={t.agent}>
                <button onClick={() => go(`agents/${t.agent}`)} className="flex min-h-11 w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-hover">
                  <StatusDot tone={tone} className="mt-1.5" />
                  <span className="min-w-0 flex-1"><span className="font-semibold text-fg">{t.agent}</span> <span className="text-fg-2">{cleanLine(t.line)}</span></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
