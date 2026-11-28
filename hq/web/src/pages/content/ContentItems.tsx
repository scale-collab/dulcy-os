// Content → "Content" (Batch 5, 2026-11-27): the Airtable Content Center's main view, cleaner. A list of
// items (search, channel, stage, "show finished"; the Content Center's order: earliest date first) and
// one item's page. On a phone the list and the item are two screens; from a tablet up they sit side by side.
// Round 4 (Alex, 2026-11-28: "Where do I click to find the script? Where do I generate it? Where's the
// Gamma? How do I progress it?"): each item opens with ONE Next step box (what happens next, the one
// button for it, and where it happens), then the script and Gamma outline when Sienna wrote them, then
// every step of the video in order (done / now / later) with where each runs: In HQ, Sienna (automatic),
// a Content Center button (HQ can't press those yet: the button opens the Content Center), by hand, or
// "Not automated yet". The steps come from the engine (content.ts videoSteps), never invented here.
// Round 5 (Alex, 2026-11-28: "I don't want what's in Airtable to stay in Airtable"): every Content Center
// button is an HQ button here, in the Next step box and in the steps list (ContentActions.tsx; the engine
// does each one the Content Center's way). The video page also has the YouTube copy and Distribution.
// "Ask Sienna now" puts a task on Sienna's list (POST /fix-it). HQ never posts; it schedules only when Alex
// presses Schedule on an approved Instagram / YouTube Shorts post. No Airtable record links (RULES 2026-11-27).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ContentCcStage, type ContentCenterView, type ContentItem, type ContentItemDetail, type ContentStep, type ContentStepButton } from '../../api';
import type { ReactNode } from 'react';
import { BackLink, Button, Card, cx, Empty, ErrorBox, ExtLink, go, Icon, Pill } from '../../ui';
import { CHANNEL_OPTIONS, DecideButtons, GammaBlock, Head, Select, StatusLine, WHERE, copyText, dateOnly, day, readChannel, saveChannel, shortLabel, type ChannelKey } from './shared';
import { Distribution, RunButton, YouTubeCopy } from './ContentActions';

const stageTone = (s: ContentCcStage) => (s === 'Published' ? 'good' : s === 'Idea' ? 'accent' : 'plain') as 'good' | 'accent' | 'plain';
/** "Record 11/27 · Publish 12/1", or "Posted 11/27" once it is on YouTube. */
const dates = (r: ContentItem) => (r.posted
  ? (r.postedDate ? `Posted ${dateOnly(r.postedDate)}` : 'Posted (no date saved)')
  : [r.recordingDate ? `Record ${dateOnly(r.recordingDate)}` : '', r.publishDate ? `Publish ${dateOnly(r.publishDate)}` : ''].filter(Boolean).join(' · '));

export default function ContentItems({ d, id, onChanged }: { d: ContentCenterView; id?: string; onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState<ChannelKey>(readChannel);
  const [stage, setStage] = useState<ContentCcStage | ''>('');
  const [finished, setFinished] = useState(false);
  const rows = d.pipeline.rows;
  const inChannel = useMemo(() => rows.filter((r) => (!channel || r.key === channel) && (finished || !r.done)), [rows, channel, finished]);
  const visible = useMemo(() => inChannel.filter((r) => (!stage || r.cc === stage) && r.title.toLowerCase().includes(q.trim().toLowerCase())), [inChannel, stage, q]);
  const counts = useMemo(() => Object.fromEntries(d.pipeline.ccStages.map((s) => [s, inChannel.filter((r) => r.cc === s).length])), [d, inChannel]);
  const picked = rows.find((r) => r.id === id) ?? null;
  // From a tablet up, an empty selection shows the first item (like the Content Center).
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)').matches);
  useEffect(() => {
    const m = window.matchMedia?.('(min-width: 768px)');
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener?.('change', on); return () => m.removeEventListener?.('change', on);
  }, []);
  const shown = picked ?? (wide ? visible[0] ?? null : null);
  // On a phone, opening an item starts at its top (the list may have been scrolled far down).
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { if (id && !wide) top.current?.scrollIntoView({ block: 'start' }); }, [id, wide]);

  const list = (
    <div className="min-w-0">
      <div className="grid grid-cols-2 gap-2">
        <label className="relative col-span-2 flex min-h-11 items-center">
          <span className="sr-only">Search content</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search content…"
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-[15px] text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent" />
        </label>
        <Select label="Channel" value={channel} options={CHANNEL_OPTIONS} onChange={(x) => { setChannel(x); saveChannel(x); }} />
        <Select label="Stage" value={stage} onChange={setStage}
          options={[{ value: '' as const, label: `All stages (${inChannel.length})` }, ...d.pipeline.ccStages.map((s) => ({ value: s, label: `${s} (${counts[s] ?? 0})` }))]} />
        <label className="col-span-2 flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl bg-sunken px-3 text-sm font-medium text-fg-2">
          <input type="checkbox" checked={finished} onChange={(e) => setFinished(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          Show finished videos
        </label>
      </div>
      <div className="mt-3 text-xs text-muted">{visible.length} item{visible.length === 1 ? '' : 's'} · earliest date first</div>
      <ul className="mt-2 space-y-2">
        {visible.map((r) => {
          const on = shown?.id === r.id;
          const now = r.steps.find((s) => s.state === 'now' && !s.optional);
          return (
            <li key={r.id}>
              <button onClick={() => go(`content/items/${r.id}`)} aria-current={on ? 'true' : undefined}
                className={cx('w-full rounded-2xl border p-3.5 text-left transition', on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong')}>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-[15px] font-semibold leading-snug text-fg">{r.title}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {(r.facts.error || r.flags.length > 0) && <Icon name="alert" size={16} className="text-warn" />}
                    {r.thisWeek && <Pill tone="good">This week</Pill>}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5"><Pill tone={stageTone(r.cc)}>{r.cc}</Pill><span className="truncate text-muted">{shortLabel(r.channel)}</span></span>
                  <span className="text-muted">{dates(r) || r.status || 'Unscheduled'}</span>
                </div>
                {now && <div className="mt-1.5 truncate text-xs font-medium text-fg-2">Next: {now.title}</div>}
              </button>
            </li>
          );
        })}
      </ul>
      {!visible.length && <Card className="mt-2"><Empty icon="film" title="No content here" sub="Change the filters, or approve ideas in Needs you." /></Card>}
      {d.pipeline.leftOut > 0 && <p className="mt-3 text-xs text-muted">{d.pipeline.leftOut} older items (no date in the last 60 days) are not shown.</p>}
    </div>
  );

  return (
    <div className="md:grid md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:items-start md:gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className={cx(picked && 'hidden md:block')}>{list}</div>
      <div ref={top} className={cx('min-w-0 scroll-mt-4', !picked && 'hidden md:block')}>
        {picked && <div className="md:hidden"><BackLink label="All content" onClick={() => go('content/items')} /></div>}
        {shown ? <Item key={shown.id} r={shown} d={d} onChanged={onChanged} /> : <Card><Empty icon="film" title="Choose a content item" /></Card>}
      </div>
    </div>
  );
}

/** "Ask Sienna now": puts the task on Sienna's own list (the Fix it path). Nothing is written to Airtable. */
function AskSienna({ b, r, primary }: { b: ContentStepButton; r: ContentItem; primary?: boolean }) {
  const [state, setState] = useState<'' | 'busy' | 'done' | 'again'>('');
  const [error, setError] = useState('');
  const ask = async () => {
    setState('busy'); setError('');
    try {
      const x = await api<{ task: { created: boolean } }>('/fix-it', { body: { agent: 'Sienna', title: b.task || `Help with "${r.title}"`, detail: `${shortLabel(r.channel)} video "${r.title}" (Content record ${r.id}). Asked from HQ → Content.`, link: `content/items/${r.id}` } });
      setState(x.task.created ? 'done' : 'again');
    } catch (e) { setState(''); setError((e as Error).message); }
  };
  if (state === 'done' || state === 'again') {
    return <span role="status" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-good"><Icon name="check" size={15} strokeWidth={2.4} />{state === 'done' ? 'On Sienna\'s list' : 'Already on Sienna\'s list'}</span>;
  }
  return (
    <>
      <Button tone={primary ? 'primary' : 'quiet'} icon="sparkles" disabled={state === 'busy'} onClick={() => void ask()}>{state === 'busy' ? 'Asking…' : b.label}</Button>
      {error && <span role="alert" className="w-full text-sm text-bad">{error}</span>}
    </>
  );
}

/** One step button: an HQ button (run), or a link that opens in a new tab (Frame.io, Gamma, YouTube). */
function StepAction({ b, r, primary, onScript, onDone, detail, onDistribution }: { b: ContentStepButton; r: ContentItem; primary?: boolean; onScript: () => void; onDone: (msg: string) => void; detail: ContentItemDetail | null; onDistribution: () => void }) {
  const [copied, setCopied] = useState('');
  const solid = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold';
  const look = primary ? `${solid} bg-ink text-ink-fg hover:bg-ink-hover` : `${solid} border border-line-strong bg-surface text-fg hover:bg-hover`;
  if (b.kind === 'decide') return r.facts.decision === 'Duplicate' ? <p className="text-sm text-warn">A duplicate: the primary idea is named in its review reason.</p> : <DecideButtons id={r.id} onDone={onDone} />;
  if (b.kind === 'askSienna') return <AskSienna b={b} r={r} primary={primary} />;
  if (b.kind === 'openScript') return <Button tone={primary ? 'primary' : 'quiet'} icon="file" onClick={onScript}>{b.label}</Button>;
  if (b.kind === 'run') return <RunButton id={r.id} b={b} primary={primary} onDone={onDone} detail={detail} />;
  if (b.kind === 'distribution') return <Button tone={primary ? 'primary' : 'quiet'} icon="send" onClick={onDistribution}>{b.label}</Button>;
  if (b.kind === 'copyGamma') {
    const copy = async () => setCopied((await copyText(r.prep?.gamma ?? '')) ? 'Copied. In Gamma: Create → Paste in text.' : 'Copy did not work here: open the script below and copy the outline.');
    return <>{<Button tone={primary ? 'primary' : 'quiet'} icon="file" onClick={() => void copy()}>{b.label}</Button>}{copied && <span role="status" className="w-full text-sm text-good">{copied}</span>}</>;
  }
  const href = b.url ?? '';
  if (!/^https:\/\//.test(href)) return null;
  return <a href={href} target="_blank" rel="noopener noreferrer" className={look}><Icon name="external" size={16} />{b.label}</a>;
}

const whereTone = (w: string) => (w === 'notAutomated' ? 'warn' : w === 'hq' ? 'accent' : w === 'sienna' ? 'good' : 'plain') as 'warn' | 'accent' | 'good' | 'plain';

function Item({ r, d, onChanged }: { r: ContentItem; d: ContentCenterView; onChanged: () => void }) {
  const [done, setDone] = useState('');
  const [scriptOpen, setScriptOpen] = useState(false);
  const scriptRef = useRef<HTMLDetailsElement>(null);
  const idea = d.needs.ideas.flatMap((g) => g.items).find((i) => i.id === r.id);
  const fri = d.friday.channels.map((c) => ({ c, n: c.items.findIndex((x) => x.id === r.id) })).find((x) => x.n >= 0);
  const f = r.facts;
  const main = r.channel === 'Alex Woung';
  const next = r.steps.find((s) => s.state === 'now' && !s.optional) ?? null;
  const also = r.steps.filter((s) => s.state === 'now' && s.optional);
  const openScript = () => { setScriptOpen(true); requestAnimationFrame(() => scriptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  const nDone = r.steps.filter((s) => s.state === 'done').length;
  // Round 5: the video's own detail (YouTube copy, the posts brief, Distribution), read fresh when it opens.
  const [detail, setDetail] = useState<ContentItemDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const loadDetail = useCallback(() => {
    if (r.awaiting) return;
    api<ContentItemDetail>(`/content/items/${r.id}`).then((x) => { setDetail(x); setDetailError(''); }).catch((e) => setDetailError((e as Error).message));
  }, [r.id, r.awaiting]);
  useEffect(() => loadDetail(), [loadDetail]);
  const distRef = useRef<HTMLDivElement>(null);
  const openDistribution = () => distRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const finished = (msg: string) => { setDone(msg); loadDetail(); };
  const showDistribution = !!detail && (f.video.youtube || f.repurposing.drafts || detail.distribution.platforms.some((p) => p.drafts.length || p.manual));
  const act = (b: ContentStepButton, i: number, primary: boolean) => <StepAction key={`${b.kind}-${b.run ?? ''}-${i}`} b={b} r={r} primary={primary} onScript={openScript} onDone={finished} detail={detail} onDistribution={openDistribution} />;
  return (
    <div className="space-y-4">
      {/* 1. Stage, title, dates */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={stageTone(r.cc)}>{r.cc}</Pill>
          {r.thisWeek && <Pill tone="good">Record this week</Pill>}
          {r.flags.map((x) => <Pill key={x} tone="warn">{x}</Pill>)}
          <span className="text-xs text-muted">{shortLabel(r.channel)}</span>
          {r.running && <Pill tone="info" icon="clock">Running: {r.running}</Pill>}
        </div>
        <h2 className="mt-2 break-words text-xl font-bold leading-snug tracking-tight text-fg sm:text-2xl">{r.title}</h2>
        {dates(r) && <p className="mt-1 text-sm text-fg-2">{dates(r)}{r.posted && r.postedDate && r.postedFrom === 'YouTube' ? <span className="text-muted"> (from YouTube; no date saved in the Content Center)</span> : null}</p>}
        {r.done && <p className="mt-1 text-sm text-good">Finished: posted with proof and distributed.</p>}
      </Card>

      {/* 2. The one Next step */}
      <section aria-labelledby={`next-${r.id}`} className="rounded-2xl border-2 border-accent/40 bg-accent-soft/40 p-4 shadow-card sm:p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-accent-ink">Next step</div>
        {done ? (
          <div role="status" className="mt-2 flex items-start gap-2.5"><Icon name="check" size={18} className="mt-0.5 text-good" /><div className="min-w-0"><p className="text-[15px] text-fg">{done}</p><Button className="mt-3" icon="refresh" onClick={() => { setDone(''); onChanged(); }}>Refresh</Button></div></div>
        ) : next ? (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 id={`next-${r.id}`} className="text-lg font-bold leading-snug text-fg">{next.title}</h3>
              <Pill tone={whereTone(next.where)}>{WHERE[next.where]}</Pill>
            </div>
            <p className="mt-1 break-words text-[15px] leading-relaxed text-fg-2">{next.text}</p>
            {next.key === 'idea' && idea && (idea.hook || idea.angle || idea.why) && (
              <dl className="mt-3 space-y-1.5 text-sm leading-snug">
                {idea.hook && <div><dt className="inline font-medium text-fg">Hook: </dt><dd className="inline text-fg-2">{idea.hook}</dd></div>}
                {idea.angle && <div><dt className="inline font-medium text-fg">Angle: </dt><dd className="inline text-fg-2">{idea.angle}</dd></div>}
                {idea.why && <div><dt className="inline font-medium text-fg">Why now: </dt><dd className="inline text-fg-2">{idea.why}</dd></div>}
              </dl>
            )}
            {next.buttons.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {next.buttons.map((b, i) => act(b, i, i === 0))}
              </div>
            )}
            {r.running && <p className="mt-2 text-xs text-muted">"{r.running}" is running for this video: the automation buttons work again when it finishes (Refresh).</p>}
          </>
        ) : <p className="mt-1 text-[15px] text-fg-2">Nothing left to do.</p>}
        {!done && also.map((s) => (
          <div key={s.key} className="mt-4 border-t border-accent/20 pt-3">
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-fg">Also before you record: {s.title}</span><Pill tone={whereTone(s.where)}>{WHERE[s.where]}</Pill></div>
            <p className="mt-1 break-words text-sm text-fg-2">{s.text}</p>
            {s.buttons.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-2">{s.buttons.map((b, i) => act(b, i, false))}</div>}
          </div>
        ))}
        {(r.prep || fri) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-accent/20 pt-3">
            {r.prep && <Button icon="file" onClick={openScript}>Open script</Button>}
            {fri && <Button icon="film" onClick={() => go(`content/friday/${fri.c.key}/${fri.n + 1}`)}>Open on Friday (teleprompter)</Button>}
          </div>
        )}
      </section>

      {/* 3. The script and Sienna's prep (when she wrote it) */}
      {r.prep && (
        <details ref={scriptRef} open={scriptOpen} onToggle={(e) => setScriptOpen((e.target as HTMLDetailsElement).open)} className="group scroll-mt-4 rounded-2xl border border-line bg-surface shadow-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 px-4 font-semibold text-fg sm:px-5 [&::-webkit-details-marker]:hidden">
            <Icon name="file" size={17} className="text-muted" /><span className="flex-1">{r.key === 'raw' ? 'Talking points' : 'Script'}, hooks{main ? ' and Gamma outline' : ''}</span>
            <Icon name="chevronDown" size={18} className="text-muted transition group-open:rotate-180" />
          </summary>
          <div className="space-y-5 border-t border-line px-4 py-4 sm:px-5">
            {r.prep.hooks.length > 0 && <div><div className="text-xs font-semibold uppercase tracking-wider text-muted">Hooks (say one first)</div><ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[15px] text-fg">{r.prep.hooks.map((h) => <li key={h}>{h}</li>)}</ol></div>}
            <div>
              <div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-wider text-muted">{r.key === 'raw' ? 'Talking points' : 'Script'}</div><CopyButton text={r.prep.script} label="Copy script" /></div>
              <div className="mt-1.5 max-h-[32rem] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-sunken p-4 text-[15px] leading-7 text-fg">{r.prep.script}</div>
            </div>
            {r.prep.checks.length > 0 && <div className="rounded-xl border border-warn/30 bg-warn-soft p-3"><div className="text-xs font-semibold uppercase tracking-wider text-warn">Check before recording</div><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-fg">{r.prep.checks.map((c) => <li key={c}>{c}</li>)}</ul></div>}
            {r.prep.titles.length > 0 && <div><div className="text-xs font-semibold uppercase tracking-wider text-muted">Title options</div><ul className="mt-1.5 list-disc space-y-1 pl-5 text-[15px] text-fg">{r.prep.titles.map((t) => <li key={t}>{t}</li>)}</ul></div>}
            {r.prep.thumbnail && <div><div className="text-xs font-semibold uppercase tracking-wider text-muted">Thumbnail idea</div><p className="mt-1 text-[15px] text-fg">{r.prep.thumbnail}</p></div>}
            {main && <div><div className="text-xs font-semibold uppercase tracking-wider text-muted">Gamma (on screen)</div><div className="mt-1.5"><GammaBlock gamma={r.prep.gamma} gammaUrl={r.prep.gammaUrl} scriptReady /></div></div>}
          </div>
        </details>
      )}

      {/* 3b. Round 5: the YouTube title and description to copy (after "Prepare YouTube details") */}
      {detail && !f.video.youtube && <YouTubeCopy d={detail} />}

      {/* 4. Every step of this video, in order, each with its HQ button */}
      <section>
        <Head title="All steps" icon="list" sub={`${nDone} of ${r.steps.length} done. Each step says where it happens; the buttons work right here.`} />
        <Card className="overflow-hidden p-0">
          <ol className="divide-y divide-line">
            {r.steps.map((s, i) => <StepRow key={s.key} s={s} n={i + 1} buttons={s.state !== 'done' && s.buttons.length > 0 && !done ? <div className="mt-2 flex flex-wrap items-center gap-2">{s.buttons.map((b, k) => act(b, k, false))}</div> : null} />)}
          </ol>
        </Card>
      </section>

      {/* 4b. Round 5: Distribution — each platform's post, approve, post, record where / when / stats */}
      <div ref={distRef} className="scroll-mt-4">
        {detailError && <ErrorBox error={detailError} retry={loadDetail} />}
        {showDistribution && <Distribution id={r.id} d={detail} reload={loadDetail} />}
      </div>

      {/* 5. Schedule */}
      <section>
        <Head title="Schedule" icon="calendar" sub={r.key === 'raw' ? 'Alex Woung Raw: recorded in a batch on Friday.' : 'Alex Woung: two videos a week, published Tuesday and Thursday.'} />
        <Card className="p-4 sm:p-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="col-span-2"><dt className="text-xs text-muted">Idea review</dt><dd className="font-medium text-fg">{r.awaiting ? 'Waiting for your decision' : /^Rejected$/i.test(f.decision) ? 'Rejected' : 'Approved for production'}{f.score !== null ? <span className="font-normal text-muted"> · score {f.score}/100 (a suggestion)</span> : null}</dd></div>
            <div><dt className="text-xs text-muted">Recording date</dt><dd className="font-medium text-fg">{r.recordingDate ? day(r.recordingDate) : 'Not set'}</dd></div>
            <div><dt className="text-xs text-muted">{r.posted ? 'Posted' : 'Publish date'}</dt><dd className="font-medium text-fg">{r.posted ? (r.postedDate ? day(r.postedDate) : 'No date saved') : r.publishDate ? day(r.publishDate) : 'Not set'}</dd></div>
          </dl>
        </Card>
      </section>

      {/* 6. Latest update / needs attention */}
      {(f.error || f.update) && (
        <section>
          <Head title={f.error ? 'Needs attention' : 'Latest update'} icon={f.error ? 'alert' : 'activity'} />
          {f.error ? <div className="rounded-2xl border border-bad-line bg-bad-soft p-4 text-sm leading-relaxed text-fg"><p className="break-words">{f.error}</p></div>
            : <Card className="p-4 text-sm leading-relaxed text-fg-2"><p className="break-words">{f.update}</p></Card>}
        </section>
      )}

      {/* 7. Details (the Content Center's "Advanced details") */}
      <details className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-card">
        <summary className="flex min-h-9 cursor-pointer items-center gap-2 font-semibold text-fg"><Icon name="list" size={16} className="text-muted" />Details</summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          <StatusLine label="Script written" done={f.script} />
          <StatusLine label="Recording folder" done={f.video.folder} />
          <StatusLine label="Finished video" done={f.video.finished} />
          <StatusLine label="On YouTube" done={f.video.youtube}>{f.video.youtubeUrl && <> · <ExtLink href={f.video.youtubeUrl}>Watch</ExtLink></>}</StatusLine>
          <StatusLine label="Short-clips project" done={f.repurposing.shortProject} />
          <StatusLine label={`${f.repurposing.clips} clip${f.repurposing.clips === 1 ? '' : 's'} connected`} done={f.repurposing.clips > 0} />
          <StatusLine label="Post drafts" done={f.repurposing.drafts} />
        </ul>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {([
            ['Production stage', f.details.productionStage || 'Not started'], ['Status', f.details.status || 'Empty'], ['Editing route', f.details.editingRoute || 'Not chosen'],
            ['Full-edit OpusClip', f.details.opusStatus || 'Not submitted'], ['Short-clips job', f.details.shortJobState || 'Not submitted'], ['Thumbnail', f.details.thumbnailStatus || 'Not started'],
            ['Publishing', f.details.publishingStatus || 'Not started'], ['Idea decision', f.decision || 'None'], ['Idea source', f.source || 'UNKNOWN'],
          ] as const).map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="break-words text-fg">{v}</dd></div>)}
        </dl>
        {f.sourceUrl && <p className="mt-3"><ExtLink href={f.sourceUrl}>Original post</ExtLink></p>}
      </details>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState<'' | 'yes' | 'no'>('');
  return <Button tone="ghost" icon={ok === 'yes' ? 'check' : 'file'} className="min-h-9 px-3 text-sm" onClick={() => void copyText(text).then((x) => setOk(x ? 'yes' : 'no'))}>{ok === 'yes' ? 'Copied' : ok === 'no' ? 'Select and copy' : label}</Button>;
}

/** One step: done (check), now (accent), later (number); its title, where it happens, the one line and its buttons. */
function StepRow({ s, n, buttons }: { s: ContentStep; n: number; buttons?: ReactNode }) {
  return (
    <li className={cx('flex items-start gap-3 px-4 py-3 sm:px-5', s.state === 'now' && 'bg-accent-soft/40')}>
      <span aria-hidden="true" className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold',
        s.state === 'done' ? 'bg-good-soft text-good' : s.state === 'now' ? 'bg-accent text-accent-fg' : 'border border-line-strong text-muted')}>
        {s.state === 'done' ? <Icon name="check" size={13} strokeWidth={2.6} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cx('text-[15px] font-semibold', s.state === 'later' ? 'text-fg-2' : 'text-fg')}>{s.title}</span>
          {s.optional && <span className="text-xs text-muted">optional</span>}
          <span className="sr-only">{s.state === 'done' ? 'done' : s.state === 'now' ? 'next' : 'later'}</span>
          {s.state !== 'done' && <Pill tone={whereTone(s.where)}>{WHERE[s.where]}</Pill>}
        </div>
        {/* Steps still to come stay one line; "How" opens what to do there. */}
        {s.text && (s.state === 'later'
          ? <details className="mt-0.5 text-sm text-muted"><summary className="min-h-7 cursor-pointer select-none font-medium text-fg-2">How</summary><p className="mt-0.5 break-words">{s.text}</p>{buttons}</details>
          : <><p className="mt-0.5 break-words text-sm text-fg-2">{s.text}</p>{buttons}</>)}
      </div>
    </li>
  );
}
