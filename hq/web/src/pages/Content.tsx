// Content (Step 3, owner only): the Airtable Content Center as one simple area. What needs Alex comes
// first; everything else is one tap deeper. The only write is the idea decision (the Content Center's
// own Approve & schedule / Reject idea fields). Clips and the other Content Center steps open Airtable.
// Everything is rendered as escaped text.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type ContentIdea, type ContentPipelineRow, type ContentStage, type ContentView, type FridayIdea } from '../api';
import { Avatar, Button, Card, cx, Empty, ErrorBox, ExtLink, go, Icon, IconButton, Label, PageSkeleton, PageTitle, Pill, SectionHeader, setCount, timeAgo } from '../ui';

const VIEWS = [
  { key: 'needs', label: 'Needs you', short: 'Needs' },
  { key: 'friday', label: 'Friday', short: 'Friday' },
  { key: 'pipeline', label: 'Pipeline', short: 'Pipeline' },
  { key: 'week', label: 'This week', short: 'Week' },
] as const;
type View = (typeof VIEWS)[number]['key'];
const isView = (x?: string): x is View => VIEWS.some((v) => v.key === x);
const day = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
const dateOnly = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
const STAGE_SHORT: Record<string, string> = { idea: 'Idea', approved: 'Approved', script: 'Script', recorded: 'Recorded', editing: 'Editing', review: 'Review', final: 'Final OK', posted: 'Posted' };
const shortLabel =(ch: string) => (ch === 'Alex Woung Raw' ? 'Raw' : ch === 'Alex Woung' ? 'Main' : ch || 'No channel');

/** #/content[/needs|friday|pipeline|week[/main|raw[/<n>]]] */
export default function Content({ a, b, c }: { a?: string; b?: string; c?: string }) {
  const view: View = isView(a) ? a : 'needs';
  const [d, setD] = useState<ContentView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback((refresh = false) => {
    setBusy(true); setError('');
    api<ContentView>(`/content${refresh ? '?refresh=1' : ''}`).then((x) => { setD(x); setCount('content', x.counts.total); }).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, []);
  useEffect(() => load(), [load]);

  const fri = d?.friday;
  const kicker = fri ? `Friday ${dateOnly(fri.date)} · ${fri.channels.map((x) => `${x.label} ${x.ready} of ${x.target} ready`).join(' · ')}` : 'Main channel and Alex Woung Raw';
  return (
    <div>
      <PageTitle title="Content" kicker={kicker} sub="What needs you first. Everything else is one tap deeper."
        right={<IconButton icon="refresh" label="Refresh" onClick={() => load(true)} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />} />
      <div role="tablist" aria-label="Content views" className="grid grid-cols-4 gap-1 sm:flex">
        {VIEWS.map((x) => {
          const on = x.key === view;
          const n = x.key === 'needs' ? d?.counts.total ?? 0 : 0;
          return (
            <button key={x.key} role="tab" aria-selected={on} onClick={() => go(`content/${x.key}`)}
              className={cx('flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-sm font-semibold transition sm:gap-1.5 sm:px-3.5', on ? 'bg-ink text-ink-fg shadow-card' : 'text-muted hover:bg-hover hover:text-fg')}>
              <span className="truncate sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.label}</span>
              {x.key === 'needs' && n > 0 && <span className={cx('tabular rounded-full px-1.5 text-xs', on ? 'bg-ink-fg/15' : 'bg-accent text-accent-fg')}>{n}</span>}
            </button>
          );
        })}
      </div>
      {error && <div className="mt-4"><ErrorBox error={error} retry={() => load()} /></div>}
      {!d && !error && <div className="mt-4"><PageSkeleton kind="list" /></div>}
      {d && (
        <div className="mt-5">
          {view === 'needs' && <NeedsView d={d} />}
          {view === 'friday' && <FridayView d={d} channel={b} index={Number(c) || 1} />}
          {view === 'pipeline' && <PipelineView d={d} channel={b} />}
          {view === 'week' && <WeekView d={d} />}
          <p className="mt-6 text-xs text-muted">From Airtable (Content Channels, Content Clips, Content Automation Settings), read {timeAgo(d.readAt) || 'just now'}; kept for 1 minute. HQ never posts, schedules or deletes, and never calls OpusClip, Gamma, Frame.io, YouTube or n8n. <ExtLink href={d.links.contentCenter}>Content Center</ExtLink></p>
        </div>
      )}
    </div>
  );
}

/* ---------- Notes (Problem → Data → Fix → Why) ---------- */
function Notes({ notes }: { notes: ContentView['notes'] }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <li key={n.problem} className="flex gap-2.5 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm leading-snug">
          <Icon name="alert" size={16} className="mt-0.5 text-warn" />
          <div className="min-w-0 break-words">
            <div className="font-semibold text-fg">{n.problem}</div>
            <div className="mt-0.5 text-muted">{n.data}</div>
            <div className="mt-1 text-fg-2"><span className="font-medium text-fg">{n.owner}:</span> {n.fix}</div>
            {n.why && <div className="mt-0.5 text-xs text-muted">Why: {n.why}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Needs you ---------- */
function NeedsView({ d }: { d: ContentView }) {
  const [gone, setGone] = useState<Record<string, string>>({});
  const nIdeas = d.needs.ideas.reduce((a, g) => a + g.items.filter((i) => !gone[i.id]).length, 0);
  const nothing = !nIdeas && !d.needs.finals.length && !d.needs.alexSteps.length;
  return (
    <div className="space-y-7">
      {d.notes.length > 0 && (
        <button onClick={() => go('content/week')} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-warn/25 bg-warn-soft px-4 text-left text-sm font-medium text-fg">
          <Icon name="alert" size={16} className="text-warn" /><span className="min-w-0 flex-1 truncate">{d.notes.length} data problem{d.notes.length === 1 ? '' : 's'} for the agents · {d.notes[0].problem}</span><Icon name="chevronRight" size={16} className="text-muted" />
        </button>
      )}
      {nothing && <Card><Empty icon="check" tone="good" title="Nothing needs you" sub="No ideas to decide, no final videos to check. Sienna adds ideas Friday at 7 AM." /></Card>}
      {d.needs.ideas.filter((g) => g.items.length).map((g) => (
        <section key={g.key}>
          <SectionHeader title={<>Ideas to approve · {g.label}</>} icon="sparkles" right={<span className="tabular text-xs text-muted">{g.items.filter((i) => !gone[i.id]).length} waiting</span>} />
          <div className="space-y-3">
            {g.items.map((i) => <IdeaCard key={i.id} idea={i} done={gone[i.id]} onDone={(msg) => setGone((x) => ({ ...x, [i.id]: msg }))} />)}
          </div>
        </section>
      ))}
      {d.needs.finals.length > 0 && (
        <section>
          <SectionHeader title="Final videos to check" icon="film" right={<span className="tabular text-xs text-muted">{d.needs.finals.reduce((a, f) => a + f.clips.length, 0)} clips</span>} />
          <p className="mb-3 text-sm text-muted">Sienna checked these. Approve or send back in the Content Center: its approve runs a check HQ can't do, so HQ writes nothing here.</p>
          <div className="space-y-3">
            {d.needs.finals.map((f) => (
              <Card key={f.parentId} className="p-0">
                <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                  <div className="min-w-0"><div className="break-words text-[15px] font-semibold text-fg">{f.title}</div><div className="text-xs text-muted">{shortLabel(f.channel)} · {f.clips.length} clip{f.clips.length === 1 ? '' : 's'}</div></div>
                  {f.airtable && <ExtLink href={f.airtable} className="shrink-0 text-sm">Video</ExtLink>}
                </div>
                <ul className="divide-y divide-line">
                  {f.clips.map((c) => (
                    <li key={c.id} className="px-4 py-3 sm:px-5">
                      <div className="flex items-start justify-between gap-2"><div className="min-w-0 break-words text-[15px] font-medium text-fg">{c.name}</div>{c.score !== null && <Pill>Score {c.score}</Pill>}</div>
                      {c.qa && <div className="mt-1 text-sm text-good">{c.qa}</div>}
                      {c.hook && <div className="mt-1 text-sm text-fg-2">Hook: {c.hook}</div>}
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                        {c.watchUrl ? <a href={c.watchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg hover:bg-hover"><Icon name="play" size={16} />Watch</a> : <span />}
                        <a href={d.links.contentCenter} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[15px] font-semibold text-ink-fg hover:bg-ink-hover"><Icon name="external" size={16} />Decide in Airtable</a>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      )}
      {d.needs.waitingForSienna > 0 && <p className="text-sm text-muted"><Icon name="clock" size={14} className="mr-1 inline align-[-2px]" />{d.needs.waitingForSienna} more clip{d.needs.waitingForSienna === 1 ? '' : 's'} wait for Sienna's check first.</p>}
      {d.needs.alexSteps.length > 0 && (
        <section>
          <SectionHeader title="Other steps waiting on you" icon="list" right={<span className="tabular text-xs text-muted">in the Content Center</span>} />
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-line">
              {d.needs.alexSteps.map((s) => (
                <li key={s.id}>
                  <a href={s.airtable} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 px-4 py-3 hover:bg-hover sm:px-5">
                    <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold text-fg">{s.step}</div><div className="break-words text-sm text-fg-2">{s.title} <span className="text-muted">· {shortLabel(s.channel)}</span></div><div className="mt-0.5 break-words text-xs text-muted">{s.how}</div></div>
                    <Icon name="external" size={16} className="mt-1 text-faint group-hover:text-muted" />
                  </a>
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
  const [busy, setBusy] = useState<'' | 'approve' | 'reject'>('');
  const [error, setError] = useState('');
  const decide = async (verdict: 'approve' | 'reject') => {
    setBusy(verdict); setError('');
    try {
      const r = await api<{ decision: string; recording: string; publish: string }>(`/content/ideas/${idea.id}`, { body: { verdict } });
      onDone(verdict === 'approve' ? `Approved · record ${day(r.recording)} · publish ${day(r.publish)}. Sienna writes the script within 30 minutes.` : 'Rejected. It stays in the history.');
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };
  if (done) return <Card className="flex items-start gap-3 py-4"><Icon name="check" size={18} className="mt-0.5 text-good" /><div className="min-w-0"><div className="break-words font-semibold text-fg">{idea.title}</div><div className="text-sm text-fg-2">{done}</div></div></Card>;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 break-words text-[17px] font-semibold leading-snug text-fg">{idea.title}</div>
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
      {error && <div className="mt-3"><ErrorBox error={error} /></div>}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
        <Button tone="accent" icon="check" disabled={!!busy} onClick={() => decide('approve')}>{busy === 'approve' ? 'Approving…' : 'Approve'}</Button>
        <Button tone="danger" icon="x" disabled={!!busy} onClick={() => decide('reject')}>{busy === 'reject' ? 'Rejecting…' : 'Reject'}</Button>
        <ExtLink href={idea.airtable} className="col-span-2 self-center text-sm sm:ml-auto sm:col-span-1">Open in Airtable</ExtLink>
      </div>
    </Card>
  );
}

/* ---------- Friday: one idea per screen ---------- */
function FridayView({ d, channel, index }: { d: ContentView; channel?: string; index: number }) {
  const chans = d.friday.channels;
  const ch = chans.find((x) => x.key === channel) ?? chans.find((x) => x.items.length) ?? chans[0];
  const items = ch?.items ?? [];
  const i = Math.min(Math.max(1, index), Math.max(1, items.length));
  const it = items[i - 1];
  const to = (n: number) => go(`content/friday/${ch.key}/${n}`);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea')) return;
      if (e.key === 'ArrowRight' && i < items.length) to(i + 1);
      if (e.key === 'ArrowLeft' && i > 1) to(i - 1);
    };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  });
  if (!ch) return null;
  return (
    <div>
      <div role="tablist" aria-label="Channel" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-sunken p-1 sm:inline-grid sm:min-w-80">
        {chans.map((x) => (
          <button key={x.key} role="tab" aria-selected={x.key === ch.key} onClick={() => go(`content/friday/${x.key}`)}
            className={cx('flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-[15px] font-semibold transition', x.key === ch.key ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
            {x.label}<span className={cx('tabular text-sm', x.ready >= x.target ? 'text-good' : 'text-warn')}>{x.ready}/{x.target}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 text-sm text-fg-2">
        <span className="font-semibold text-fg">Friday {dateOnly(d.friday.date)}</span> · {ch.ready} of {ch.target} ready to record{ch.approved > ch.ready ? ` · ${ch.approved - ch.ready} still without a script` : ''}{ch.approved < ch.target ? ` · ${ch.target - ch.approved} more to approve` : ''}
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
          {it.gammaUrl && <p className="mb-2"><ExtLink href={it.gammaUrl}>Open the Gamma doc</ExtLink></p>}
          {it.gamma ? <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-fg-2">{it.gamma}</div> : <p className="text-[15px] text-muted">No Gamma outline yet.</p>}
          {!it.gammaUrl && it.gamma && <p className="mt-2 text-xs text-muted">Outline only: real Gamma docs are not made yet (content-system.md, Next 4).</p>}
        </Block>
      )}
      <div className="mt-6"><ExtLink href={it.airtable} className="text-sm">Open in Airtable</ExtLink></div>
    </Card>
  );
}

/* ---------- Pipeline ---------- */
function PipelineView({ d, channel }: { d: ContentView; channel?: string }) {
  const [stage, setStage] = useState<ContentStage | ''>('');
  const [open, setOpen] = useState('');
  const chan = channel === 'main' || channel === 'raw' ? channel : '';
  const inChan = useMemo(() => d.pipeline.rows.filter((r) => !chan || r.key === chan), [d, chan]);
  const rows = inChan.filter((r) => !stage || r.stage === stage);
  const count = (k: ContentStage) => inChan.filter((r) => r.stage === k).length;
  return (
    <div>
      <div aria-label="Filter by channel" className="flex flex-wrap gap-1.5">
        {[['', 'All channels'], ['main', 'Main'], ['raw', 'Raw']].map(([k, l]) => (
          <button key={k} onClick={() => go(`content/pipeline${k ? `/${k}` : ''}`)} aria-pressed={chan === k}
            className={cx('inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium transition', chan === k ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-fg-2 hover:bg-hover')}>{l}</button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Client filter: these tables hold only Alex's own channels; no client content yet.</p>
      <div className="mt-3 grid grid-cols-4 gap-1.5 md:grid-cols-8">
        {d.pipeline.stages.map((s) => (
          <button key={s.key} onClick={() => setStage(stage === s.key ? '' : s.key)} aria-pressed={stage === s.key}
            className={cx('flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-center transition', stage === s.key ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-hover')}>
            <span className="tabular text-lg font-bold leading-none text-fg">{count(s.key)}</span>
            <span className="mt-1 w-full truncate text-[11px] font-medium text-muted"><span className="md:hidden">{STAGE_SHORT[s.key]}</span><span className="hidden md:inline">{s.label}</span></span>
          </button>
        ))}
      </div>
      <Card className="mt-4 overflow-hidden p-0">
        {!rows.length ? <Empty icon="layers" title="Nothing here" sub="No video at this stage." /> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => <PipeRow key={r.id} r={r} stages={d.pipeline.stages} open={open === r.id} onToggle={() => setOpen(open === r.id ? '' : r.id)} showChannel={!chan} />)}
          </ul>
        )}
      </Card>
      {d.pipeline.leftOut > 0 && <p className="mt-2 text-xs text-muted">{d.pipeline.leftOut} older rows (nothing in the last 60 days, or no decision) are left out. They are still in Airtable.</p>}
    </div>
  );
}
const HOW: Record<string, string> = { hq: 'In HQ', engine: 'Automatic (engine)', field: 'Button in the Content Center (n8n)', button: 'Button in the Content Center (n8n)', manual: 'By hand' };
function PipeRow({ r, stages, open, onToggle, showChannel }: { r: ContentPipelineRow; stages: ContentView['pipeline']['stages']; open: boolean; onToggle: () => void; showChannel: boolean }) {
  const at = stages.findIndex((s) => s.key === r.stage);
  return (
    <li>
      <button onClick={onToggle} aria-expanded={open} className="grid w-full gap-2 px-4 py-3 text-left transition hover:bg-hover sm:px-5 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-center md:gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-semibold text-fg md:truncate">{r.title}</span><span className="shrink-0 md:hidden"><Pill tone={r.stage === 'posted' ? 'good' : r.stage === 'idea' || r.stage === 'review' ? 'accent' : 'plain'}>{STAGE_SHORT[r.stage]}</Pill></span></div>
          <div className="truncate text-xs text-muted">{[showChannel ? shortLabel(r.channel) : '', r.recordingDate ? `record ${day(r.recordingDate)}` : '', r.next ? `next: ${r.next.title}` : ''].filter(Boolean).join(' · ')}</div>
          {r.flags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{r.flags.map((f) => <Pill key={f} tone="warn">{f}</Pill>)}</div>}
        </div>
        <ol aria-label={`Stage: ${stages[at]?.label}`} className="grid grid-cols-8 gap-1">
          {stages.map((s, n) => (
            <li key={s.key} title={s.label} className="min-w-0">
              <span className={cx('block h-1.5 rounded-full', n < at ? 'bg-accent' : n === at ? (r.stage === 'posted' ? 'bg-accent' : 'bg-accent/35 ring-1 ring-inset ring-accent') : 'bg-line')} />
              <span className={cx('mt-1 hidden truncate text-center text-[10px] lg:block', n === at ? 'font-semibold text-fg' : 'text-muted')}>{STAGE_SHORT[s.key]}</span>
            </li>
          ))}
        </ol>
      </button>
      {open && (
        <div className="border-t border-line bg-sunken px-4 py-3 text-sm sm:px-5">
          {r.next ? (
            <div className="flex items-start gap-3">
              <Avatar name={r.next.who} size="sm" />
              <div className="min-w-0">
                <div className="font-semibold text-fg">Next: {r.next.title} <span className="font-normal text-muted">· {r.next.who}</span></div>
                <div className="text-fg-2">{HOW[r.next.how]}</div>
                <div className="break-words text-xs text-muted">{r.next.automation}</div>
              </div>
            </div>
          ) : <div className="text-fg-2">Posted. Nothing left to do.</div>}
          <div className="mt-2 text-xs text-muted">Airtable: Production Stage {r.productionStage || 'empty'} · Status {r.status || 'empty'}{r.publishDate ? ` · publish ${day(r.publishDate)}` : ''}</div>
          <div className="mt-2"><ExtLink href={r.airtable}>Open in Airtable</ExtLink></div>
        </div>
      )}
    </li>
  );
}

/* ---------- This week ---------- */
function Stat({ label, n, target }: { label: string; n: number; target: number }) {
  const pct = target ? Math.min(100, Math.round((n / target) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2"><span className="text-sm text-fg-2">{label}</span><span className="tabular text-sm"><span className={cx('text-lg font-bold', n >= target ? 'text-good' : 'text-fg')}>{n}</span><span className="text-muted"> / {target}</span></span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={n} aria-label={label}><div className={cx('h-full rounded-full', n >= target ? 'bg-accent' : 'bg-line-strong')} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
function WeekView({ d }: { d: ContentView }) {
  return (
    <div className="space-y-7">
      <section>
        <SectionHeader title={<>This week · {day(d.week.start)} to {day(d.week.end)}</>} icon="activity" />
        <div className="grid gap-3 md:grid-cols-2">
          {d.week.channels.map((c) => (
            <Card key={c.key}>
              <div className="flex items-center justify-between"><div className="text-[15px] font-semibold text-fg">{c.label}</div><span className="text-xs text-muted">target {c.target} a week</span></div>
              <div className="mt-4 space-y-3">
                <Stat label={`Ideas proposed${c.proposed ? ` (Sienna ${c.bySienna})` : ''}`} n={c.proposed} target={c.ideaTarget} />
                <Stat label="Approved (recording this week)" n={c.approved} target={c.target} />
                <Stat label="Recorded" n={c.recorded} target={c.target} />
                <Stat label="Posted (with proof)" n={c.posted} target={c.target} />
              </div>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <SectionHeader title="Data problems" icon="alert" right={<span className="tabular text-xs text-muted">{d.notes.length}</span>} />
        {d.notes.length ? <Notes notes={d.notes} /> : <Card><Empty icon="check" tone="good" title="No data problems found" /></Card>}
      </section>
      <section>
        <SectionHeader title="How the steps run" icon="layers" />
        <Card className="text-sm leading-relaxed text-fg-2">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><span className="font-medium text-fg">Ideas:</span> Sienna (engine sienna.ideas, Friday 7 AM) and the n8n Reddit intakes (Saturday 9 AM) add them as "Needs Review".</li>
            <li><span className="font-medium text-fg">Approve in HQ:</span> writes Idea Decision, Production Stage "Idea Approved" and the record/publish dates, the same as the Content Center. Then the engine's sienna.prep writes the script, hooks, titles, thumbnail idea and Gamma outline (every 30 min).</li>
            <li><span className="font-medium text-fg">Frame.io, OpusClip, posts:</span> the Content Center's Sync Frame.io / Submit to OpusClip / Refresh Opus Clips / Generate Distribution Pack set Content Automation Action, and an Airtable automation starts the n8n flow.</li>
            <li><span className="font-medium text-fg">Thumbnail, YouTube details, clip review:</span> buttons in the Content Center call n8n directly. HQ links to them.</li>
            <li><span className="font-medium text-fg">Posting:</span> by hand. HQ never runs "Schedule Approved Social Posts".</li>
          </ul>
        </Card>
      </section>
      <section>
        <SectionHeader title="Clean-up for Riley (the same job twice)" icon="wrench" />
        <Card className="text-sm leading-relaxed text-fg-2"><ul className="list-disc space-y-1.5 pl-5">{d.overlaps.map((o) => <li key={o}>{o}</li>)}</ul></Card>
      </section>
    </div>
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
