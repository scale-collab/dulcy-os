// Content. Batch 5 (2026-11-27): laid out like the Airtable Content Center, cleaner.
//   Needs you — what Alex must decide (ideas per channel, final clips, other steps), most important first.
//   Content   — the Content Center's main view: every item with its Next step, its script and all its steps.
//   Calendar  — the Content Center's recording, publishing and posted calendar.
//   Friday    — recording day: one idea per screen with the script and hooks.
// Round 4 (Alex, 2026-11-28): the "This week" tab is gone (its data problems are one line on Needs you,
// with one "Have Sienna fix it"); the ideas per channel fold closed; the real channel names ("Alex Woung",
// "Alex Woung Raw"); dates with slashes. Old #/content/week links open Needs you.
// The only write is the idea decision (the Content Center's own Approve & schedule / Reject idea fields).
// No Airtable record links (RULES 2026-11-27); the one link left is the Content Center page for the
// steps HQ cannot do (clip approval, the n8n buttons). Everything is rendered as escaped text.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type ContentCenterView, type ContentIdea, type FridayIdea } from '../api';
import { Button, Card, cx, Empty, ErrorBox, ExtLink, go, Icon, IconButton, Label, PageSkeleton, PageTitle, Pill, SectionHeader, setCount, timeAgo } from '../ui';
import { FixItButton } from '../fixIt';
import ContentItems from './content/ContentItems';
import ContentCalendar from './content/ContentCalendar';
import { DecideButtons, GammaBlock, Head, Notes, dateOnly, day, shortLabel } from './content/shared';

const VIEWS = [
  { key: 'needs', label: 'Needs you', short: 'Needs' },
  { key: 'items', label: 'Content', short: 'Content' },
  { key: 'calendar', label: 'Calendar', short: 'Calendar' },
  { key: 'friday', label: 'Friday', short: 'Friday' },
] as const;
type View = (typeof VIEWS)[number]['key'];
const isView = (x?: string): x is View => VIEWS.some((v) => v.key === x);

/** #/content[/needs | items[/<rec>] | calendar | friday[/main|raw[/<n>]]]; the old #/content/pipeline opens Content, #/content/week opens Needs you. */
export default function Content({ a, b, c }: { a?: string; b?: string; c?: string }) {
  const view: View = a === 'pipeline' ? 'items' : isView(a) ? a : 'needs';
  const [d, setD] = useState<ContentCenterView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback((refresh = false) => {
    setBusy(true); setError('');
    api<ContentCenterView>(`/content${refresh ? '?refresh=1' : ''}`).then((x) => { setD(x); setCount('content', x.counts.total); }).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, []);
  useEffect(() => load(), [load]);

  const fri = d?.friday;
  const kicker = fri ? `Friday ${dateOnly(fri.date)} · ${fri.channels.map((x) => `${x.label} ${x.ready}/${x.target} ready`).join(' · ')}` : 'Alex Woung and Alex Woung Raw';
  return (
    <div>
      <PageTitle title="Content" kicker={kicker} sub="Ideas, recording, editing, publishing and clips in one place."
        right={<IconButton icon="refresh" label="Refresh" onClick={() => load(true)} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />} />
      <div role="tablist" aria-label="Content views" className="grid grid-cols-4 gap-1 rounded-2xl border border-line bg-sunken p-1 sm:inline-flex">
        {VIEWS.map((x) => {
          const on = x.key === view;
          const n = x.key === 'needs' ? d?.counts.total ?? 0 : 0;
          return (
            <button key={x.key} role="tab" aria-selected={on} onClick={() => go(`content/${x.key}`)} aria-label={n ? `${x.label}, ${n}` : undefined}
              className={cx('relative flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-0.5 text-[13px] font-semibold transition sm:px-3.5 sm:text-sm', on ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
              <span className="truncate sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.label}</span>
              {/* On a phone the count sits on the corner so "Needs" is not cut off. */}
              {x.key === 'needs' && n > 0 && <span className="tabular absolute -right-0.5 -top-1 min-w-5 rounded-full bg-accent px-1 text-center text-[11px] leading-5 text-accent-fg sm:static sm:px-1.5 sm:text-xs sm:leading-normal">{n}</span>}
            </button>
          );
        })}
      </div>
      {error && <div className="mt-4"><ErrorBox error={error} retry={() => load()} /></div>}
      {!d && !error && <div className="mt-4"><PageSkeleton kind="list" /></div>}
      {d && (
        <div className="mt-5">
          {view === 'needs' && <NeedsView d={d} />}
          {view === 'items' && <ContentItems d={d} id={b} onChanged={() => load(true)} />}
          {view === 'calendar' && <ContentCalendar d={d} />}
          {view === 'friday' && <FridayView d={d} channel={b} index={Number(c) || 1} />}
          <p className="mt-8 text-xs text-muted">From the Content Center's tables, read {timeAgo(d.readAt) || 'just now'}; kept for 1 minute. HQ never posts, schedules or deletes.</p>
        </div>
      )}
    </div>
  );
}

/* ---------- Needs you: Alex's to-do for content, most important first ---------- */
function NeedsView({ d }: { d: ContentCenterView }) {
  const [gone, setGone] = useState<Record<string, string>>({});
  const nIdeas = d.needs.ideas.reduce((a, g) => a + g.items.filter((i) => !gone[i.id]).length, 0);
  const nothing = !nIdeas && !d.needs.finals.length && !d.needs.alexSteps.length;
  return (
    <div className="space-y-8">
      {/* The data problems (they were the "This week" tab): one line; open it for the list and one Fix it button. */}
      {d.notes.length > 0 && (
        <details className="group rounded-xl border border-warn/25 bg-warn-soft text-sm">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 font-medium text-fg [&::-webkit-details-marker]:hidden">
            <Icon name="alert" size={16} className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1 truncate">{d.notes.length} data problem{d.notes.length === 1 ? '' : 's'} · {d.notes[0].problem}</span>
            <Icon name="chevronDown" size={16} className="shrink-0 text-muted transition group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-warn/20 px-3 pb-3 pt-3">
            <Notes notes={d.notes} />
            <FixItButton agent="Sienna" title={`Content data problems (${d.notes.length})`} detail={d.notes.map((x) => `${x.problem}: ${x.data}. Fix (${x.owner}): ${x.fix}`).join('\n')} />
          </div>
        </details>
      )}
      {nothing && <Card><Empty icon="check" tone="good" title="Nothing needs you" sub="No ideas to decide and no final videos to check. Sienna adds ideas Friday at 7 AM." /></Card>}

      {/* Ideas per channel: one dropdown each, closed (Alex, round 4: "one big list is elongated to read"). */}
      {d.needs.ideas.some((g) => g.items.length) && (
        <section>
          <Head title="Ideas to approve" icon="sparkles" sub="Open a channel. Approve puts the idea on the calendar and Sienna writes the script within 30 minutes; Reject keeps it in the history." />
          <div className="space-y-2">
            {d.needs.ideas.filter((g) => g.items.length).map((g) => {
              const left = g.items.filter((i) => !gone[i.id]).length;
              return (
                <details key={g.key} className="group rounded-2xl border border-line bg-surface shadow-card">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 sm:px-5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">{g.label}</span>
                    <span className={cx('tabular shrink-0 rounded-full px-2 text-xs font-semibold leading-6', left ? 'bg-accent-soft text-accent-ink' : 'bg-sunken text-muted')}>{left} to approve</span>
                    <Icon name="chevronDown" size={18} className="shrink-0 text-muted transition group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 border-t border-line p-3 sm:p-4">
                    {g.items.map((i) => <IdeaCard key={i.id} idea={i} done={gone[i.id]} onDone={(msg) => setGone((x) => ({ ...x, [i.id]: msg }))} />)}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}

      {d.needs.finals.length > 0 && (
        <section>
          <Head title="Final videos to check" icon="film" sub="Sienna checked these clips. Watch them, then approve in the Content Center: its approve runs an owner check HQ can't do yet."
            right={<span className="tabular shrink-0 text-xs text-muted">{(() => { const k = d.needs.finals.reduce((a, f) => a + f.clips.length, 0); return `${k} clip${k === 1 ? '' : 's'}`; })()}</span>} />
          <div className="space-y-3">
            {d.needs.finals.map((f) => (
              <Card key={f.parentId} className="p-0">
                <button onClick={() => f.parentId && go(`content/items/${f.parentId}`)} className="flex w-full items-start justify-between gap-3 border-b border-line px-4 py-3 text-left hover:bg-hover sm:px-5">
                  <div className="min-w-0"><div className="break-words text-[15px] font-semibold text-fg">{f.title}</div><div className="text-xs text-muted">{shortLabel(f.channel)} · {f.clips.length} clip{f.clips.length === 1 ? '' : 's'}</div></div>
                  <Icon name="chevronRight" size={16} className="mt-1 shrink-0 text-muted" />
                </button>
                <ul className="divide-y divide-line">
                  {f.clips.map((c) => (
                    <li key={c.id} className="px-4 py-3 sm:px-5">
                      <div className="flex items-start justify-between gap-2"><div className="min-w-0 break-words text-[15px] font-medium text-fg">{c.name}</div>{c.score !== null && <Pill>Score {c.score}</Pill>}</div>
                      {c.qa && <div className="mt-1 text-sm text-good">{c.qa}</div>}
                      {c.hook && <div className="mt-1 break-words text-sm text-fg-2">Hook: {c.hook}</div>}
                      {c.watchUrl && <a href={c.watchUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg hover:bg-hover sm:w-auto"><Icon name="play" size={16} />Watch</a>}
                    </li>
                  ))}
                </ul>
                <div className="border-t border-line px-4 py-3 sm:px-5">
                  <a href={d.links.contentCenter} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[15px] font-semibold text-ink-fg hover:bg-ink-hover sm:w-auto"><Icon name="external" size={16} />Approve in the Content Center</a>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
      {d.needs.waitingForSienna > 0 && <p className="text-sm text-muted"><Icon name="clock" size={14} className="mr-1 inline align-[-2px]" />{d.needs.waitingForSienna} more clip{d.needs.waitingForSienna === 1 ? '' : 's'} wait for Sienna's check first.</p>}

      {d.needs.alexSteps.length > 0 && (
        <section>
          <Head title="Other steps waiting on you" icon="list" sub="Done by hand or in the Content Center. Tap one to see the video." right={<span className="tabular shrink-0 text-xs text-muted">{d.needs.alexSteps.length}</span>} />
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-line">
              {d.needs.alexSteps.map((s) => (
                <li key={s.id}>
                  <button onClick={() => go(`content/items/${s.id}`)} className="group flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-hover sm:px-5">
                    <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold text-fg">{s.step}</div><div className="break-words text-sm text-fg-2">{s.title} <span className="text-muted">· {shortLabel(s.channel)}</span></div></div>
                    <Icon name="chevronRight" size={16} className="mt-1 shrink-0 text-faint group-hover:text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {d.log.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-card sm:px-5">
          <summary className="flex min-h-9 cursor-pointer items-center gap-2 font-semibold text-fg"><Icon name="history" size={16} className="text-muted" />Changes from HQ ({d.log.length})</summary>
          <ul className="mt-2 divide-y divide-line">
            {d.log.map((l, n) => (
              <li key={n} className="py-2">
                <div className="text-fg-2"><span className="font-medium text-fg">{l.by}</span> {l.action === 'idea_approve' ? 'approved' : 'rejected'} "{l.title}" · <span className="text-muted">{timeAgo(l.at)}</span></div>
                <div className="break-words text-xs text-muted">{l.changes.map((c) => `${c.field}: ${String(c.from || 'empty')} → ${String(c.to ?? 'empty')}`).join(' · ')}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function IdeaCard({ idea, done, onDone }: { idea: ContentIdea; done?: string; onDone: (msg: string) => void }) {
  if (done) return <Card className="flex items-start gap-3 py-4"><Icon name="check" size={18} className="mt-0.5 text-good" /><div className="min-w-0"><div className="break-words font-semibold text-fg">{idea.title}</div><div className="text-sm text-fg-2">{done}</div></div></Card>;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => go(`content/items/${idea.id}`)} className="min-w-0 break-words text-left text-[17px] font-semibold leading-snug text-fg hover:underline">{idea.title}</button>
        {idea.score !== null && <Pill tone={idea.score >= 80 ? 'accent' : 'plain'}>{idea.score}</Pill>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>By {idea.by}</span>
        {idea.proposed && <span>· {timeAgo(idea.proposed)}</span>}
        {idea.decision !== 'Needs Review' && <Pill tone="info">{idea.decision}</Pill>}
        {idea.sourceUrl && <ExtLink href={idea.sourceUrl}>{idea.source || 'Source'}</ExtLink>}
      </div>
      {(idea.angle || idea.hook || idea.why) && (
        <dl className="mt-3 space-y-1.5 text-sm leading-snug">
          {idea.hook && <div><dt className="inline font-medium text-fg">Hook: </dt><dd className="inline text-fg-2">{idea.hook}</dd></div>}
          {idea.angle && <div><dt className="inline font-medium text-fg">Angle: </dt><dd className="inline text-fg-2">{idea.angle}</dd></div>}
          {idea.why && <div><dt className="inline font-medium text-fg">Why now: </dt><dd className="inline text-fg-2">{idea.why}</dd></div>}
        </dl>
      )}
      <DecideButtons id={idea.id} onDone={onDone} className="mt-4" />
    </Card>
  );
}

/* ---------- Friday: one idea per screen ---------- */
function FridayView({ d, channel, index }: { d: ContentCenterView; channel?: string; index: number }) {
  const chans = d.friday.channels;
  const ch = chans.find((x) => x.key === channel) ?? chans.find((x) => x.items.length) ?? chans[0];
  const items = ch?.items ?? [];
  const i = Math.min(Math.max(1, index), Math.max(1, items.length));
  const it = items[i - 1];
  const to = (n: number) => go(`content/friday/${ch.key}/${n}`);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key === 'ArrowRight' && i < items.length) to(i + 1);
      if (e.key === 'ArrowLeft' && i > 1) to(i - 1);
    };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  });
  if (!ch) return null;
  return (
    <div>
      <Head title={`Recording day · Friday ${dateOnly(d.friday.date)}`} icon="film" sub="This Friday's approved ideas in recording order. One per screen: say a hook, then the script." />
      <div role="tablist" aria-label="Channel" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-sunken p-1 sm:inline-grid sm:min-w-80">
        {chans.map((x) => (
          <button key={x.key} role="tab" aria-selected={x.key === ch.key} onClick={() => go(`content/friday/${x.key}`)}
            className={cx('flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-[15px] font-semibold transition', x.key === ch.key ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
            {x.label}<span className={cx('tabular text-sm', x.ready >= x.target ? 'text-good' : 'text-warn')}>{x.ready}/{x.target}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 text-sm text-fg-2">
        {ch.ready} of {ch.target} ready to record{ch.approved > ch.ready ? ` · ${ch.approved - ch.ready} still without a script` : ''}{ch.approved < ch.target ? ` · ${ch.target - ch.approved} more to approve` : ''}
      </div>
      {!it ? (
        <Card className="mt-4"><Empty icon="film" title={`No approved ${ch.label} ideas for Friday`} sub="Approve ideas in Needs you; Sienna writes the scripts within 30 minutes."><Button onClick={() => go('content/needs')} icon="sparkles">Needs you</Button></Empty></Card>
      ) : (
        <>
          {items.length > 1 && (
            <div aria-label="Ideas" className="mt-3 flex flex-wrap gap-1.5">
              {items.map((x, n) => (
                <button key={x.id} onClick={() => to(n + 1)} aria-current={n + 1 === i ? 'true' : undefined} aria-label={`Idea ${n + 1}: ${x.title}`}
                  className={cx('tabular grid h-10 min-w-10 place-items-center rounded-full border text-sm font-semibold', n + 1 === i ? 'border-accent bg-accent-soft text-accent-ink' : x.scriptReady ? 'border-line bg-surface text-fg-2' : 'border-warn/40 bg-warn-soft text-warn')}>{n + 1}</button>
              ))}
            </div>
          )}
          <FridayCard key={it.id} it={it} n={i} of={items.length} raw={ch.key === 'raw'} />
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-surface/95 p-2 shadow-pop backdrop-blur md:bottom-4">
            <Button size="lg" icon="arrowLeft" disabled={i <= 1} onClick={() => to(i - 1)}>Previous</Button>
            <Button size="lg" tone="primary" disabled={i >= items.length} onClick={() => to(i + 1)}>Next<Icon name="arrowRight" size={19} strokeWidth={2.1} /></Button>
          </div>
        </>
      )}
    </div>
  );
}

function Block({ label, children, tone }: { label: string; children: ReactNode; tone?: 'warn' }) {
  return (
    <section className={cx('mt-6', tone === 'warn' && 'rounded-xl border border-warn/30 bg-warn-soft p-4')}>
      <Label>{label}</Label>
      <div className="mt-2">{children}</div>
    </section>
  );
}
function FridayCard({ it, n, of, raw }: { it: FridayIdea; n: number; of: number; raw: boolean }) {
  return (
    <Card className="mt-4 p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="tabular font-semibold text-fg-2">{n} of {of}</span>
        {it.recordingDate && <span>· record {day(it.recordingDate)}</span>}
        {it.publishDate && <span>· publish {day(it.publishDate)}</span>}
        {it.late && <Pill tone="warn">From an earlier week</Pill>}
        {!it.scriptReady && <Pill tone="warn">No script yet</Pill>}
      </div>
      <h2 className="mt-2 break-words text-2xl font-bold leading-tight tracking-tight text-fg sm:text-[32px]">{it.title}</h2>
      {it.hooks.length > 0 ? (
        <Block label="Hooks (say one first)">
          <ol className="list-decimal space-y-2 pl-6 text-lg leading-7 text-fg sm:text-xl sm:leading-8">{it.hooks.map((h) => <li key={h}>{h}</li>)}</ol>
        </Block>
      ) : it.ideaHook ? <Block label="Hook"><p className="text-lg leading-7 text-fg sm:text-xl">{it.ideaHook}</p></Block> : null}
      <Block label={raw ? 'Talking points' : 'Script'}>
        {it.script ? <div className="whitespace-pre-wrap break-words text-lg leading-8 text-fg sm:text-xl sm:leading-9">{it.script}</div>
          : <p className="text-[15px] text-muted">Not written yet. Sienna writes it within 30 minutes of the approval.{it.angle ? ` Angle: ${it.angle}` : ''}</p>}
      </Block>
      {it.checks.length > 0 && <Block label="Check before recording" tone="warn"><ul className="list-disc space-y-1 pl-5 text-[15px] text-fg">{it.checks.map((c) => <li key={c}>{c}</li>)}</ul></Block>}
      {it.titles.length > 0 && <Block label="Title options"><ul className="list-disc space-y-1 pl-5 text-[17px] text-fg">{it.titles.map((t) => <li key={t}>{t}</li>)}</ul></Block>}
      {it.thumbnail && <Block label="Thumbnail idea"><p className="text-[17px] text-fg">{it.thumbnail}</p></Block>}
      {!raw && (
        <Block label="Gamma (on screen)">
          <GammaBlock gamma={it.gamma} gammaUrl={it.gammaUrl} scriptReady={it.scriptReady} />
        </Block>
      )}
      <div className="mt-6"><Button icon="list" onClick={() => go(`content/items/${it.id}`)}>See this video's steps</Button></div>
    </Card>
  );
}

/** Today's card (owner only): what content needs and Friday's count vs target. */
export function ContentCard() {
  const [d, setD] = useState<import('../api').ContentSummary | null>(null);
  useEffect(() => { api<import('../api').ContentSummary>('/content/summary').then((x) => { setD(x); setCount('content', x.counts.total); }).catch(() => setD(null)); }, []);
  if (!d) return null;
  const lines = [
    d.counts.ideas ? `${d.counts.ideas} idea${d.counts.ideas === 1 ? '' : 's'} to approve` : '',
    d.counts.finals ? `${d.counts.finals} final clip${d.counts.finals === 1 ? '' : 's'} to check` : '',
    d.counts.steps ? `${d.counts.steps} other step${d.counts.steps === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return (
    <section>
      <SectionHeader title="Content" icon="film" />
      <Card onClick={() => go(d.counts.total ? 'content/needs' : 'content/friday')} label="Open Content" className="p-4">
        <div className="text-[15px] font-semibold text-fg">{lines.length ? lines.join(' · ') : 'Nothing needs you'}</div>
        <div className="mt-1 text-sm text-fg-2">Friday {dateOnly(d.friday.date)}: {d.friday.channels.map((c) => `${c.label} ${c.ready}/${c.target} ready`).join(' · ')}</div>
        <div className="mt-2 flex items-center gap-1 text-sm font-semibold text-accent-ink">Open Content<Icon name="chevronRight" size={16} /></div>
      </Card>
    </section>
  );
}
