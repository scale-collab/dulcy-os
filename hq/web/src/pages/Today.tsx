// Today, round 2 (Alex, 2026-11-27 evening; desktop first). One decisions summary only: the decisions
// line in "Do now". Do now = the founder's to-do for today, the top of "Needs you" (the same ranked
// list). Then campaigns grouped by how they are doing (not by bounce alone), the weekly scorecard
// (this week vs the same days last week), Ada's brief, the team check (what each agent did in 24 h),
// Content (once a week, so under the team check) and the reports.
import { useCallback, useEffect, useState } from 'react';
import { api, type CampaignHow, type Need, type NeedCounts, type Report, type TeamLine, type TodayAgentDay, type TodayCampaigns, type TodayWeek, type User } from '../api';
import {
  Avatar, Button, Card, cleanLine, cx, ErrorBox, go, Icon, IconButton, Inline, Markdown, PageSkeleton, PageTitle,
  Pill, setCount, StatusDot, teamTone, timeAgo, type Tone,
} from '../ui';
import { ReportList } from './Reports';
import { NeedFace, whoLabel } from './Needs';
import { ContentCard } from './Content';
import { FixItButton } from '../fixIt';
import { dayAndDate } from '../dates';

interface TodayData {
  signups?: number;
  brief: { title: string; body: string; created: string; dryRun: boolean } | null;
  team: TeamLine[];
  activity?: TodayAgentDay[] | null;
  decisions: Record<string, number>;
  needs: { top: Need[]; counts: NeedCounts; errors: string[] };
  campaigns?: TodayCampaigns | null;
  week?: TodayWeek | null;
  blockErrors?: string[];
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
  const first = (user.name || '').split(' ')[0] || user.name;
  const actions = (
    <div className="flex items-center gap-2">
      <IconButton icon="refresh" label="Refresh" onClick={load} className={cx('border border-line bg-surface', refreshing && '[&_svg]:animate-spin')} />
      <span className="hidden sm:block"><Button icon="message" onClick={() => go('chat/Ada')}>Ask Ada</Button></span>
    </div>
  );
  const head = <PageTitle kicker={dayAndDate()} title={`${hello}, ${first}.`} right={actions} />;

  if (error && !d) return <>{head}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{head}<PageSkeleton kind="today" /></>;

  const reports = d.reports.filter((r) => r.kind !== 'brief');
  const suggestions = suggestionsOf(d);

  return (
    <div>
      {head}
      {error && <div className="mb-4"><ErrorBox error={error} retry={load} /></div>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          <Block icon="bell" tone="ink" title="Do now" sub={d.needs.counts.total ? `Your to-do for today · top ${d.needs.top.length} of ${d.needs.counts.total} in Needs you` : 'Your to-do for today'}>
            <DoNow items={d.needs.top} counts={d.needs.counts} piles={d.decisions} errors={d.needs.errors} />
          </Block>
          <Block icon="megaphone" tone="accent" title="Campaigns" sub={d.campaigns ? `${d.campaigns.live} live, grouped by how they are doing` : 'How the live campaigns are doing'}>
            <CampaignsBlock c={d.campaigns ?? null} />
          </Block>
          <Block icon="activity" tone="info" title="This week" sub={d.week ? `${d.week.thisWeek.label} vs last week (${d.week.lastWeek.label}, the same days)` : 'This week vs last week'}>
            <WeekBlock w={d.week ?? null} />
          </Block>
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
          {!!d.blockErrors?.length && <p className="text-xs text-muted">Could not read: {d.blockErrors.join(', ')}. The rest is up to date.</p>}
        </div>
        <div className="min-w-0 space-y-8">
          <Block icon="users" tone="good" title="Team check" sub="What each agent did in the last 24 hours">
            <TeamCheck team={d.team} activity={d.activity ?? null} />
          </Block>
          {user.role === 'owner' && <ContentCard />}
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

// ---------- Do now: the founder's to-do (the top of Needs you) ----------
function DoNow({ items, counts, piles, errors }: { items: Need[]; counts: NeedCounts; piles: Record<string, number>; errors: string[] }) {
  const open = (n: Need) => (n.action && !/^https:\/\//i.test(n.action.href) ? go(n.action.href) : go('needs'));
  const pileChips = Object.entries(piles).filter(([, n]) => n);
  return (
    <Card className="p-0">
      {items.length ? (
        <ol className="divide-y divide-line">
          {items.map((n, i) => (
            <li key={n.key} className="flex gap-3 px-4 py-3.5 sm:px-5">
              <span className="tabular mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-ink-fg">{i + 1}</span>
              <NeedFace n={n} size="sm" />
              <div className="min-w-0 flex-1">
                <button onClick={() => open(n)} className="block text-left text-[15px] font-semibold leading-snug text-fg hover:underline">{n.title}</button>
                {(n as Need & { todo?: string }).todo && <div className="mt-0.5 text-sm leading-snug text-fg-2">{(n as Need & { todo?: string }).todo}</div>}
                <div className="mt-0.5 text-xs text-muted">{whoLabel(n)}{n.why ? ` · ${n.why}` : ''}</div>
                {n.kind === 'decisions' && pileChips.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pileChips.map(([k, c]) => (
                      <button key={k} onClick={() => go(`decisions/${k}`)} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 text-[13px] font-medium text-fg-2 transition hover:border-line-strong hover:text-fg">
                        <Icon name={PILE_ICON[k] ?? 'layers'} size={14} className="text-muted" />{k}<span className="tabular font-semibold text-fg">{c}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {n.kind === 'decisions'
                ? <span className="hidden shrink-0 self-center sm:block"><Button tone="accent" icon="play" onClick={() => go('decisions/all')}>Start deciding</Button></span>
                : n.action && <span className="hidden shrink-0 self-center sm:block"><Button onClick={() => open(n)}>{n.action.label}</Button></span>}
            </li>
          ))}
        </ol>
      ) : <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted"><Icon name="check" size={15} />Nothing on your list right now.</div>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-5">
        <span className="text-xs text-muted">{errors.length ? `Not read: ${errors.join(', ')}` : 'Most important first. Done items drop off.'}</span>
        <Button onClick={() => go('needs')} icon="bell">{counts.total > items.length ? `See all ${counts.total}` : 'Open Needs you'}</Button>
      </div>
    </Card>
  );
}

// ---------- Campaigns, grouped by how they are doing ----------
const HOW_TONE: Record<CampaignHow, { dot: Tone; ring: string; icon: string }> = {
  look: { dot: 'bad', ring: 'hover:border-bad-line', icon: 'alert' },
  well: { dot: 'good', ring: 'hover:border-good/40', icon: 'trendUp' },
  pace: { dot: 'good', ring: 'hover:border-line-strong', icon: 'check' },
  time: { dot: 'idle', ring: 'hover:border-line-strong', icon: 'clock' },
};
const DISPLAY: CampaignHow[] = ['well', 'pace', 'time', 'look'];
/** Campaigns, filtered to one group (the Campaigns page reads ?how=). */
const howHref = (k: CampaignHow) => `campaigns/live?how=${k}`;
function CampaignsBlock({ c }: { c: TodayCampaigns | null }) {
  if (!c) return <Card><div className="text-sm text-muted">Campaigns could not be read just now. Refresh in a minute.</div></Card>;
  if (!c.live) return <Card><div className="text-sm text-muted">No live campaign right now.</div></Card>;
  const by = Object.fromEntries(c.groups.map((g) => [g.key, g]));
  const look = by.look?.campaigns ?? [];
  const well = by.well?.campaigns ?? [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {DISPLAY.map((k) => {
          const g = by[k];
          if (!g) return null;
          return (
            <button key={k} onClick={() => go(howHref(k))} title={g.sub}
              className={cx('min-w-0 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition', HOW_TONE[k].ring, k === 'look' && g.count > 0 && 'border-bad-line/60')}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted"><StatusDot tone={g.count ? HOW_TONE[k].dot : 'idle'} />{g.label}</div>
              <div className="tabular mt-1.5 text-[28px] font-bold leading-none tracking-tight text-fg">{g.count}</div>
              <div className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted">{g.sub}</div>
            </button>
          );
        })}
      </div>
      {(look.length > 0 || well.length > 0) && (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {[...look.slice(0, 4), ...well.slice(0, 3)].map((x) => (
              <li key={x.id}>
                <button onClick={() => go(`campaigns/${x.id}`)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-hover sm:px-5">
                  <Icon name={HOW_TONE[x.how].icon} size={16} className={cx('mt-0.5 shrink-0', x.how === 'look' ? 'text-bad' : 'text-good')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-fg">{x.name}<span className="font-normal text-muted"> · {x.client || 'no client'}</span></span>
                    <span className="block text-sm leading-snug text-fg-2">{x.why}</span>
                    {x.signals.length > 0 && <span className="mt-1 flex flex-wrap gap-1.5">{x.signals.map((s) => <Pill key={s} tone="warn">{s}</Pill>)}</span>}
                  </span>
                  <Pill tone={x.how === 'look' ? 'bad' : 'good'} className="shrink-0">{x.how === 'look' ? 'Needs a look' : 'Performing well'}</Pill>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted">Judged on interested replies and meetings for the emails sent{c.agencyPerThousand ? ` (agency average ${c.agencyPerThousand} interested per 1,000)` : ''}. Bounce over 4% always needs a look; 2.5–4% shows as a signal.</p>
    </div>
  );
}

// ---------- The weekly scorecard ----------
function WeekBlock({ w }: { w: TodayWeek | null }) {
  if (!w) return <Card><div className="text-sm text-muted">The scorecard could not be read just now. Refresh in a minute.</div></Card>;
  const tiles: { label: string; now: number | null; last: number | null }[] = [
    { label: 'Interested replies', now: w.thisWeek.interested, last: w.lastWeek.interested },
    { label: 'Meetings booked', now: w.thisWeek.booked, last: w.lastWeek.booked },
    { label: 'Emails sent', now: w.thisWeek.sent, last: w.lastWeek.sent },
  ];
  const n = (x: number | null) => (x === null ? '?' : x.toLocaleString('en-US'));
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => {
          const up = t.now !== null && t.last !== null && t.now > t.last, down = t.now !== null && t.last !== null && t.now < t.last;
          return (
            <div key={t.label} className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="truncate text-xs font-medium text-muted">{t.label}</div>
              <div className="tabular mt-1 text-[26px] font-bold leading-none tracking-tight text-fg">{n(t.now)}</div>
              <div className="mt-1.5 flex items-center gap-1 truncate text-xs text-muted">
                {(up || down) && <Icon name={up ? 'trendUp' : 'trendDown'} size={13} className={up ? 'text-good' : 'text-bad'} />}
                <span className="truncate">Last week: {n(t.last)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">This week = Monday to today; last week = the same days one week earlier. {w.sentNote}</p>
    </div>
  );
}

// ---------- Ada's brief (the parts Today does not already show) ----------
interface Suggestion { key: string; agent: string; title: string; detail: string; from: string }
/** What the agents flag: an agent whose runs failed (Riley fixes systems) and urgent reports (the writer fixes it). */
function suggestionsOf(d: TodayData): Suggestion[] {
  const failed = d.team.filter((t) => t.ok === false && teamTone(t.ok, t.line) === 'bad').map((t) => ({
    key: `team:${t.agent}`, agent: 'Riley', title: `${t.agent}'s runs failed: ${cleanLine(t.line)}`.slice(0, 200), detail: cleanLine(t.line), from: 'Team check',
  }));
  const urgent = d.reports.filter((r) => r.kind !== 'brief' && r.urgent).slice(0, 4).map((r) => ({
    key: `report:${r.id}`, agent: r.kind === 'account_health' ? 'Riley' : r.agent, title: r.title, detail: r.summary, from: `${r.agent}'s report · ${timeAgo(r.created)}`,
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
/** Brief parts Today already shows as their own blocks (decisions, campaigns, agents, the scorecard): left out here. */
const SHOWN_ELSEWHERE = /^(Waiting on you|Campaigns|Agents|What the agents did|Weekly scorecard)/i;

function Brief({ brief }: { brief: TodayData['brief'] }) {
  const [open, setOpen] = useState(false);
  if (!brief) {
    return (
      <Card>
        <div className="flex items-start gap-3"><Avatar name="Ada" /><div><div className="font-semibold">Ada's brief</div><div className="mt-0.5 text-sm text-muted">No brief yet. Ada writes it on weekday mornings (ADA_BRIEF=on).</div></div></div>
      </Card>
    );
  }
  const sections = briefSections(brief.body).filter((s) => !SHOWN_ELSEWHERE.test(s.title));
  const isKey = (s: BriefSection) => /^(Top \d|Overnight)/i.test(s.title);
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
      {s.title && <div className={cx('font-semibold', big ? 'text-[15px] text-fg' : 'text-sm text-fg')}>{s.title}</div>}
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

// ---------- Team check: what each agent did in the last 24 h ----------
function TeamCheck({ team, activity }: { team: TeamLine[]; activity: TodayAgentDay[] | null }) {
  const issues = team.filter((t) => t.ok === false);
  const by = new Map((activity ?? []).map((a) => [a.agent, a]));
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-2.5">
        <span className="text-xs text-muted">{activity ? 'From the Activity Log and the agents’ runs' : 'Runs only (the Activity Log could not be read)'}</span>
        <span className={cx('text-xs font-medium', issues.length ? 'text-bad' : 'text-good')}>{issues.length ? `${issues.length} failed` : 'all ran fine'}</span>
      </div>
      <ul className="divide-y divide-line">
        {team.map((t) => {
          const tone = teamTone(t.ok, t.line);
          const a = by.get(t.agent);
          const did = a?.count ? `${a.line}` : '';
          const line = tone === 'bad' ? cleanLine(t.line) : did || (tone === 'good' ? `Ran fine, nothing logged (${/\(([^)]+)\)/.exec(cleanLine(t.line))?.[1] ?? 'recently'})` : 'No runs in the last 14 days');
          return (
            <li key={t.agent}>
              <button onClick={() => go(`agents/${t.agent}`)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-hover">
                <span className="relative shrink-0">
                  <Avatar name={t.agent} size="sm" />
                  <StatusDot tone={tone} className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 ring-2 ring-surface" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-fg">{t.agent}</span>
                    {a && a.count > 0 && <span className="tabular shrink-0 text-xs text-muted">{a.count} {a.count === 1 ? "action" : "actions"}</span>}
                  </span>
                  <span className={cx('block text-[13px] leading-snug', tone === 'bad' ? 'text-bad' : 'text-fg-2')}>{line}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
