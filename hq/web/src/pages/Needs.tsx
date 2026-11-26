// "Needs you": only what the agents need from you, each with why and one action.
// Phone: one column, the action full width at the bottom of each card. Computer: Do now | When you can.
// Day switcher (Alex 2026-11-25): Yesterday = what got handled; Today = what is due now, ranked
// (money and client-facing first, then the oldest); Tomorrow = back from "Not now" + due tomorrow.
import { useCallback, useEffect, useState } from 'react';
import { api, type Need, type NeedCounts, type NeedDay, type NeedLink, type User } from '../api';
import { Avatar, Button, cx, Empty, ErrorBox, go, Icon, IconButton, Label, Markdown, PageSkeleton, PageTitle, Pill, setCount, timeAgo, useRoute } from '../ui';

interface NeedsData { day?: NeedDay; date?: string; items: Need[]; counts: NeedCounts; errors: string[] }
const DAYS: NeedDay[] = ['yesterday', 'today', 'tomorrow'];
const DAY_LABEL: Record<NeedDay, string> = { yesterday: 'Yesterday', today: 'Today', tomorrow: 'Tomorrow' };
/** "Wed, Nov 25" for a YYYY-MM-DD (New York) date. */
const dateLabel = (ymd?: string) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
const nyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const shift = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function DaySwitch({ day, onPick }: { day: NeedDay; onPick: (d: NeedDay) => void }) {
  const today = nyToday();
  return (
    <div role="tablist" aria-label="Day" className="mb-5 grid grid-cols-3 gap-1 rounded-2xl border border-line bg-sunken p-1 sm:inline-grid sm:w-auto sm:min-w-[420px]">
      {DAYS.map((d, i) => {
        const on = d === day;
        return (
          <button key={d} role="tab" aria-selected={on} onClick={() => onPick(d)}
            className={cx('flex min-h-12 flex-col items-center justify-center rounded-xl px-2 leading-tight transition', on ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
            <span className="text-[15px] font-semibold">{DAY_LABEL[d]}</span>
            <span className="text-[11px] font-medium text-muted">{dateLabel(shift(today, i - 1))}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Small tags on Today's cards: why it ranks first. */
function Tags({ n }: { n: Need }) {
  if (!n.money && !n.clientFacing) return null;
  return <>{n.money && <Pill tone="warn" className="px-2 py-0">Money</Pill>}{n.clientFacing && !n.money && <Pill tone="info" className="px-2 py-0">Client</Pill>}</>;
}

/** An action link: an https:// link opens in a new tab; anything else is an HQ route. */
export const isExternal = (href: string) => /^https:\/\//i.test(href);
export function follow(l: NeedLink) {
  if (isExternal(l.href)) window.open(l.href, '_blank', 'noopener,noreferrer');
  else go(l.href.replace(/^#?\/?/, ''));
}

export function NeedFace({ n, size = 'md' }: { n: Pick<Need, 'agent' | 'icon'>; size?: 'sm' | 'md' }) {
  if (n.icon) {
    return (
      <span aria-hidden="true" className={cx('grid shrink-0 place-items-center bg-accent-soft text-accent-ink', size === 'sm' ? 'h-7 w-7 rounded-lg' : 'h-11 w-11 rounded-xl')}>
        <Icon name={n.icon} size={size === 'sm' ? 15 : 20} />
      </span>
    );
  }
  return <Avatar name={n.agent} size={size === 'sm' ? 'sm' : 'lg'} />;
}
/** "Echo", "Riley", or the label for a non-agent item ("HQ" → "Sign-ups"). */
export const whoLabel = (n: Pick<Need, 'agent' | 'kind'>) => (n.kind === 'signups' ? 'Sign-ups' : n.agent);

export default function Needs({ user }: { user: User }) {
  const route = useRoute();
  const day: NeedDay = DAYS.includes(route[1] as NeedDay) ? (route[1] as NeedDay) : 'today';
  const [d, setD] = useState<NeedsData | null>(null);
  const [error, setError] = useState('');
  const [gone, setGone] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => {
    setError(''); setRefreshing(true);
    api<NeedsData>(`/needs${day === 'today' ? '' : `?day=${day}`}`).then((x) => { setD({ ...x, day }); setGone([]); if (day === 'today') setCount('needs', x.counts.total); })
      .catch((e) => setError(e.message)).finally(() => setRefreshing(false));
  }, [day]);
  useEffect(() => { setD(null); load(); }, [load]);
  const items = (d?.items ?? []).filter((i) => !gone.includes(i.key));
  useEffect(() => { if (d && day === 'today') setCount('needs', items.length); }, [d, day, items.length]);
  const pick = (x: NeedDay) => go(x === 'today' ? 'needs' : `needs/${x}`);

  const act = async (n: Need, what: 'done' | 'tomorrow' | 'monday') => {
    setGone((g) => [...g, n.key]);
    const [kind, id] = n.key.split(':');
    const path = kind === 'ask' ? `/asks/${id}/${what === 'done' ? 'done' : 'snooze'}` : `/needs/issue/${id}/snooze`;
    try { await api(path, { body: what === 'done' ? {} : { until: what } }); } catch (e) { setGone((g) => g.filter((x) => x !== n.key)); setError((e as Error).message); }
  };

  const refresh = <span className="hidden sm:block"><IconButton icon="refresh" label="Refresh" onClick={load} className={cx('border border-line bg-surface', refreshing && '[&_svg]:animate-spin')} /></span>;
  const refreshPhone = <button onClick={load} aria-label="Refresh" className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg sm:hidden"><Icon name="refresh" size={17} className={refreshing ? 'animate-spin' : undefined} /></button>;
  const title = 'Needs you';
  const switcher = <DaySwitch day={day} onPick={pick} />;
  if (error && !d) return <><PageTitle title={title} right={refresh} />{switcher}<ErrorBox error={error} retry={load} /></>;
  if (!d || d.day !== day) return <><PageTitle title={title} right={refresh} />{switcher}<PageSkeleton kind="list" /></>;

  const now = items.filter((i) => i.group === 'now');
  const later = items.filter((i) => i.group === 'later');
  const first = (user.name || '').split(' ')[0] || 'you';
  const kicker = day === 'yesterday' ? `${items.length ? `${items.length} thing${items.length === 1 ? '' : 's'}` : 'Nothing'} handled on ${dateLabel(d.date)}`
    : day === 'tomorrow' ? `${items.length ? `${items.length} thing${items.length === 1 ? '' : 's'}` : 'Nothing'} coming up on ${dateLabel(d.date)}`
      : items.length ? `${items.length} thing${items.length === 1 ? '' : 's'} the team needs from ${first}` : 'Nothing waiting';
  const sub = day === 'yesterday' ? 'What you and the team finished, so nothing gets asked twice.'
    : day === 'tomorrow' ? 'What comes back from "Not now", and what is due.'
      : items.length ? 'Only what needs your hands. Money and client work first, then the oldest.' : undefined;
  const warn = d.errors.length > 0 && (
    <div role="status" className="mb-4 flex items-start gap-2.5 rounded-xl border border-line bg-warn-soft px-4 py-3 text-sm text-warn">
      <Icon name="alert" size={16} className="mt-0.5" />
      <span className="min-w-0">Couldn't read {d.errors.join(' and ')}. The rest is up to date.</span>
    </div>
  );
  if (day !== 'today') {
    return (
      <div>
        <PageTitle title={title} right={refresh} kicker={<span className="flex items-center justify-between gap-2"><span>{kicker}</span>{refreshPhone}</span>} sub={sub} />
        {switcher}
        {error && <div className="mb-4"><ErrorBox error={error} /></div>}
        {warn}
        {!items.length ? (
          <div className="rounded-3xl border border-line bg-surface shadow-card">
            {day === 'yesterday'
              ? <Empty icon="history" title="Nothing was handled yesterday" sub="Decisions you made, asks you finished, Riley's fixes and the tasks the agents closed show up here." />
              : <Empty icon="clock" tone="good" title="Nothing lined up for tomorrow" sub={'What you put off with "Not now" and what is due tomorrow shows up here.'} />}
          </div>
        ) : day === 'yesterday' ? (
          <ul className="grid items-start gap-3 lg:grid-cols-2">{items.map((n) => <li key={n.key} className="min-w-0"><HandledCard n={n} /></li>)}</ul>
        ) : (
          <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-6">
            <Group title="Due tomorrow" dot="bg-dot-warn" items={now} empty="Nothing due tomorrow." onAct={act} />
            <Group title="Back tomorrow" dot="bg-dot-idle" items={later} empty="Nothing comes back tomorrow." onAct={act} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <PageTitle title={title} right={refresh}
        kicker={<span className="flex items-center justify-between gap-2"><span>{kicker}</span>{refreshPhone}</span>}
        sub={sub} />
      {switcher}
      {error && <div className="mb-4"><ErrorBox error={error} /></div>}
      {warn}

      {!items.length ? (
        <div className="rounded-3xl border border-line bg-surface shadow-card">
          <Empty icon="check" tone="good" title="Nothing needs you right now" sub="The team is on it. When an agent needs your OK or your hands, it shows up here with why and what to do." />
        </div>
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-6">
          <Group title="Do now" dot="bg-dot-bad" items={now} empty="Nothing urgent. Good." onAct={act} />
          <Group title="When you can" dot="bg-dot-idle" items={later} empty="Nothing else waiting." onAct={act} />
        </div>
      )}
    </div>
  );
}

function Group({ title, dot, items, empty, onAct }: { title: string; dot: string; items: Need[]; empty: string; onAct: (n: Need, what: 'done' | 'tomorrow' | 'monday') => void }) {
  return (
    <section aria-label={title} className="min-w-0">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span aria-hidden="true" className={cx('h-2 w-2 rounded-full', dot)} />
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        <span className="tabular text-sm text-muted">{items.length}</span>
      </div>
      {items.length ? (
        <ul className="space-y-3">{items.map((n) => <li key={n.key}><NeedCard n={n} onAct={onAct} /></li>)}</ul>
      ) : (
        <div className="flex min-h-16 items-center gap-2 rounded-2xl border border-dashed border-line px-4 text-sm text-muted"><Icon name="check" size={15} />{empty}</div>
      )}
    </section>
  );
}

const TRAILING = new Set(['arrowRight', 'external']);
/** Secondary buttons: outlined on the phone (so they read as buttons without icons), plain on a computer. */
const SECONDARY = 'border border-line sm:border-transparent';

function NeedCard({ n, onAct }: { n: Need; onAct: (n: Need, what: 'done' | 'tomorrow' | 'monday') => void }) {
  const [open, setOpen] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const hasSteps = !!n.steps.trim();
  const later = n.group === 'later';

  // The one primary action: the link; else "See steps"; else (steps open) the second link or Done.
  let primary: { label: string; icon: string; run: () => void } | null = null;
  if (n.action) primary = { label: n.action.label, icon: isExternal(n.action.href) ? 'external' : 'arrowRight', run: () => follow(n.action!) };
  else if (hasSteps && !open) primary = { label: 'See steps', icon: 'list', run: () => setOpen(true) };
  else if (n.link) primary = { label: n.link.label, icon: isExternal(n.link.href) ? 'external' : 'arrowRight', run: () => follow(n.link!) };
  else if (n.canDone) primary = { label: 'Done', icon: 'check', run: () => onAct(n, 'done') };
  const primaryIsDone = !n.action && !n.link && n.canDone && (!hasSteps || open);
  const toggleSteps = hasSteps && (n.action || open);

  return (
    <article aria-label={`${whoLabel(n)}: ${n.title}`} className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-3">
        <NeedFace n={n} />
        <div className="min-w-0 flex-1">
          <div className="flex min-h-5 flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <span className="font-semibold text-fg-2">{whoLabel(n)}</span>
            {n.outcome ? <><span aria-hidden="true">·</span><span className="font-medium text-fg-2">{n.outcome}</span></> : n.at && <><span aria-hidden="true">·</span><span>{timeAgo(n.at)}</span></>}
            <span className="ml-0.5 inline-flex gap-1"><Tags n={n} /></span>
          </div>
          <h3 className="mt-0.5 break-words text-base font-semibold leading-snug text-fg">{n.title}</h3>
          {n.why && <p className="mt-1 break-words text-sm leading-relaxed text-muted">{n.why}</p>}
        </div>
        {typeof n.count === 'number' && n.count > 0 && n.kind === 'decisions' && (
          <span className="tabular shrink-0 rounded-full bg-ink px-2.5 py-0.5 text-sm font-bold text-ink-fg" aria-hidden="true">{n.count}</span>
        )}
      </div>

      {open && hasSteps && (
        <div className="mt-4 rounded-xl border border-line bg-sunken px-4 py-3.5 anim-fade">
          <Label>Steps</Label>
          <Markdown small text={n.steps} className="mt-1" />
          {n.kind === 'issue' && <p className="mt-3 border-t border-line pt-3 text-xs text-muted">{n.link ? 'When it is done, approve its decision in Fixes so Riley checks it worked.' : 'When it is done, tell Riley so it checks it worked.'}</p>}
        </div>
      )}

      {snoozing ? (
        <div className="mt-4 anim-fade">
          <div className="mb-2 text-sm font-medium text-fg-2">Hide it until…</div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:flex sm:justify-end">
            <Button onClick={() => onAct(n, 'tomorrow')} icon="clock">Tomorrow</Button>
            <Button onClick={() => onAct(n, 'monday')} icon="clock">Monday</Button>
            <IconButton icon="x" label="Cancel" onClick={() => setSnoozing(false)} className="border border-line" />
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {(n.canSnooze || (n.canDone && !primaryIsDone) || toggleSteps) && (
            <div className="grid auto-cols-fr grid-flow-col gap-2 sm:flex">
              {toggleSteps && <Button tone="ghost" compact icon={open ? 'chevronDown' : 'list'} onClick={() => setOpen((v) => !v)} className={cx(SECONDARY, open && '[&_svg]:rotate-180')}>{open ? 'Hide steps' : 'Steps'}</Button>}
              {n.canSnooze && <Button tone="ghost" compact className={SECONDARY} icon="clock" onClick={() => setSnoozing(true)}>Not now</Button>}
              {n.canDone && !primaryIsDone && <Button tone="ghost" compact className={SECONDARY} icon="check" onClick={() => onAct(n, 'done')}>Done</Button>}
            </div>
          )}
          {primary && (
            <Button tone={later ? 'quiet' : 'accent'} icon={TRAILING.has(primary.icon) ? undefined : primary.icon} onClick={primary.run} className="w-full sm:w-auto">
              {primary.label}{TRAILING.has(primary.icon) && <Icon name={primary.icon} size={17} strokeWidth={2.1} />}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

/** Yesterday: one thing that got handled (read only). Steps (an agent's closed tasks) fold open. */
function HandledCard({ n }: { n: Need }) {
  const [open, setOpen] = useState(false);
  const hasSteps = !!n.steps.trim();
  return (
    <article aria-label={`${whoLabel(n)}: ${n.title}`} className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-3">
        <NeedFace n={n} />
        <div className="min-w-0 flex-1">
          <div className="flex min-h-5 flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <span className="font-semibold text-fg-2">{whoLabel(n)}</span>
            {n.when && <><span aria-hidden="true">·</span><span>{new Date(n.when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}</span></>}
          </div>
          <h3 className="mt-0.5 break-words text-base font-semibold leading-snug text-fg">{n.title}</h3>
          {n.why && <p className="mt-1 break-words text-sm leading-relaxed text-muted">{n.why}</p>}
          {n.outcome && <div className="mt-2"><Pill tone="good" icon="check">{n.outcome}</Pill></div>}
        </div>
      </div>
      {hasSteps && (
        <>
          {open && <div className="mt-4 rounded-xl border border-line bg-sunken px-4 py-3 anim-fade"><Markdown small text={n.steps} /></div>}
          <div className="mt-3 flex justify-end">
            <Button tone="ghost" compact icon="list" onClick={() => setOpen((v) => !v)} className={cx('border border-line sm:border-transparent', open && '[&_svg]:rotate-180')}>{open ? 'Hide' : 'See each one'}</Button>
          </div>
        </>
      )}
    </article>
  );
}
