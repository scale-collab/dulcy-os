// "Needs you": only what the agents need from you, each with why and one action.
// Phone: one column, the action full width at the bottom of each card. Computer: Do now | When you can.
import { useCallback, useEffect, useState } from 'react';
import { api, type Need, type NeedCounts, type NeedLink, type User } from '../api';
import { Avatar, Button, cx, Empty, ErrorBox, go, Icon, IconButton, Label, Markdown, PageSkeleton, PageTitle, setCount, timeAgo } from '../ui';

interface NeedsData { items: Need[]; counts: NeedCounts; errors: string[] }

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
/** "Sean", "Riley", or the label for a non-agent item ("HQ" → "Sign-ups"). */
export const whoLabel = (n: Pick<Need, 'agent' | 'kind'>) => (n.kind === 'signups' ? 'Sign-ups' : n.agent);

export default function Needs({ user }: { user: User }) {
  const [d, setD] = useState<NeedsData | null>(null);
  const [error, setError] = useState('');
  const [gone, setGone] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => {
    setError(''); setRefreshing(true);
    api<NeedsData>('/needs').then((x) => { setD(x); setGone([]); setCount('needs', x.counts.total); }).catch((e) => setError(e.message)).finally(() => setRefreshing(false));
  }, []);
  useEffect(load, [load]);
  const items = (d?.items ?? []).filter((i) => !gone.includes(i.key));
  useEffect(() => { if (d) setCount('needs', items.length); }, [d, items.length]);

  const act = async (n: Need, what: 'done' | 'tomorrow' | 'monday') => {
    setGone((g) => [...g, n.key]);
    const [kind, id] = n.key.split(':');
    const path = kind === 'ask' ? `/asks/${id}/${what === 'done' ? 'done' : 'snooze'}` : `/needs/issue/${id}/snooze`;
    try { await api(path, { body: what === 'done' ? {} : { until: what } }); } catch (e) { setGone((g) => g.filter((x) => x !== n.key)); setError((e as Error).message); }
  };

  const refresh = <span className="hidden sm:block"><IconButton icon="refresh" label="Refresh" onClick={load} className={cx('border border-line bg-surface', refreshing && '[&_svg]:animate-spin')} /></span>;
  const refreshPhone = <button onClick={load} aria-label="Refresh" className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover hover:text-fg sm:hidden"><Icon name="refresh" size={17} className={refreshing ? 'animate-spin' : undefined} /></button>;
  const title = 'Needs you';
  if (error && !d) return <><PageTitle title={title} right={refresh} /><ErrorBox error={error} retry={load} /></>;
  if (!d) return <><PageTitle title={title} right={refresh} /><PageSkeleton kind="list" /></>;

  const now = items.filter((i) => i.group === 'now');
  const later = items.filter((i) => i.group === 'later');
  const first = (user.name || '').split(' ')[0] || 'you';
  return (
    <div>
      <PageTitle title={title} right={refresh}
        kicker={<span className="flex items-center justify-between gap-2"><span>{items.length ? `${items.length} thing${items.length === 1 ? '' : 's'} the team needs from ${first}` : 'Nothing waiting'}</span>{refreshPhone}</span>}
        sub={items.length ? 'Only what needs your hands. Each card says why, and the one thing to do.' : undefined} />
      {error && <div className="mb-4"><ErrorBox error={error} /></div>}
      {d.errors.length > 0 && (
        <div role="status" className="mb-4 flex items-start gap-2.5 rounded-xl border border-line bg-warn-soft px-4 py-3 text-sm text-warn">
          <Icon name="alert" size={16} className="mt-0.5" />
          <span className="min-w-0">Couldn't read {d.errors.join(' and ')}. The rest is up to date.</span>
        </div>
      )}

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
            {n.at && <><span aria-hidden="true">·</span><span>{timeAgo(n.at)}</span></>}
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
