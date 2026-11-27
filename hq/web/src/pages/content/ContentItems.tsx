// Content → "Content" (Batch 5, 2026-11-27): the Airtable Content Center's main view, cleaner. A list of
// items (search, channel, stage, "show finished"; the Content Center's order: earliest date first) and
// one item's page with the same blocks in the same order: stage + title, next step, schedule (idea
// review, channel, record and publish dates), video, repurposing, latest update, details. On a phone the
// list and the item are two screens; from a tablet up they sit side by side like the Content Center.
// The only write is the idea decision. No Airtable links (RULES 2026-11-27).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentCcStage, ContentCenterView, ContentItem } from '../../api';
import { Avatar, BackLink, Button, Card, cx, Empty, ExtLink, go, Icon, Pill } from '../../ui';
import { CHANNEL_OPTIONS, DecideButtons, HOW, Head, Select, StatusLine, dateOnly, day, readChannel, saveChannel, shortLabel, type ChannelKey } from './shared';

const stageTone = (s: ContentCcStage) => (s === 'Published' ? 'good' : s === 'Idea' ? 'accent' : 'plain') as 'good' | 'accent' | 'plain';
const dates = (r: ContentItem) => [r.recordingDate ? `Record ${dateOnly(r.recordingDate)}` : '', r.publishDate ? `Publish ${dateOnly(r.publishDate)}` : ''].filter(Boolean).join(' · ');

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
                  <span className="flex items-center gap-1.5"><Pill tone={stageTone(r.cc)}>{r.cc}</Pill><span className="text-muted">{shortLabel(r.channel)}</span></span>
                  <span className="text-muted">{dates(r) || r.status || 'Unscheduled'}</span>
                </div>
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

function Item({ r, d, onChanged }: { r: ContentItem; d: ContentCenterView; onChanged: () => void }) {
  const [done, setDone] = useState('');
  const idea = d.needs.ideas.flatMap((g) => g.items).find((i) => i.id === r.id);
  const fri = d.friday.channels.map((c) => ({ c, n: c.items.findIndex((x) => x.id === r.id) })).find((x) => x.n >= 0);
  const f = r.facts;
  const review = r.awaiting ? 'Waiting for your decision' : /^Rejected$/i.test(f.decision) ? 'Rejected' : 'Approved for production';
  return (
    <div className="space-y-4">
      {/* 1. Stage and title */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={stageTone(r.cc)}>{r.cc}</Pill>
          {r.thisWeek && <Pill tone="good">Record this week</Pill>}
          {r.flags.map((x) => <Pill key={x} tone="warn">{x}</Pill>)}
          <span className="text-xs text-muted">{shortLabel(r.channel)}</span>
        </div>
        <h2 className="mt-2 break-words text-xl font-bold leading-snug tracking-tight text-fg sm:text-2xl">{r.title}</h2>
        {r.done && <p className="mt-1 text-sm text-good">Finished: posted with proof and distributed.</p>}
      </Card>

      {/* 2. Next step (the Content Center's "Recommended next step") */}
      <section>
        <Head title="Next step" icon="arrowRight" />
        <Card className="p-4 sm:p-5">
          {done ? (
            <div className="flex items-start gap-2.5"><Icon name="check" size={18} className="mt-0.5 text-good" /><div className="min-w-0"><p className="text-[15px] text-fg">{done}</p><Button className="mt-3" icon="refresh" onClick={onChanged}>Refresh</Button></div></div>
          ) : r.awaiting ? (
            <>
              <div className="text-[17px] font-semibold text-fg">Review this idea</div>
              <p className="mt-1 text-sm text-fg-2">Approve puts it on the schedule. Sienna then writes the script.</p>
              {idea && (idea.hook || idea.angle || idea.why) && (
                <dl className="mt-3 space-y-1.5 text-sm leading-snug">
                  {idea.hook && <div><dt className="inline font-medium text-fg">Hook: </dt><dd className="inline text-fg-2">{idea.hook}</dd></div>}
                  {idea.angle && <div><dt className="inline font-medium text-fg">Angle: </dt><dd className="inline text-fg-2">{idea.angle}</dd></div>}
                  {idea.why && <div><dt className="inline font-medium text-fg">Why now: </dt><dd className="inline text-fg-2">{idea.why}</dd></div>}
                </dl>
              )}
              {f.decision !== 'Duplicate' ? <DecideButtons id={r.id} onDone={setDone} className="mt-4" /> : <p className="mt-3 text-sm text-warn">A duplicate: the primary idea is named in its review reason.</p>}
            </>
          ) : r.next ? (
            <div className="flex items-start gap-3">
              <Avatar name={r.next.who} size="sm" />
              <div className="min-w-0">
                <div className="text-[17px] font-semibold leading-snug text-fg">{r.next.title}</div>
                <div className="mt-0.5 text-sm text-fg-2">{r.next.who} · {HOW[r.next.how]}</div>
                <div className="mt-1 break-words text-xs text-muted">{r.next.automation}</div>
              </div>
            </div>
          ) : <p className="text-[15px] text-fg-2">Nothing left to do.</p>}
          {fri && <Button className="mt-4 w-full sm:w-auto" icon="film" onClick={() => go(`content/friday/${fri.c.key}/${fri.n + 1}`)}>Open on Friday (script and hooks)</Button>}
        </Card>
      </section>

      {/* 3. Schedule */}
      <section>
        <Head title="Schedule" icon="calendar" sub={r.key === 'raw' ? 'Raw: batch-recorded on Friday.' : 'Main: two videos a week, published Tuesday and Thursday.'} />
        <Card className="p-4 sm:p-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="col-span-2"><dt className="text-xs text-muted">Idea review</dt><dd className="font-medium text-fg">{review}{f.score !== null ? <span className="font-normal text-muted"> · score {f.score}/100 (a suggestion)</span> : null}</dd></div>
            <div><dt className="text-xs text-muted">Recording date</dt><dd className="font-medium text-fg">{r.recordingDate ? day(r.recordingDate) : 'Not set'}</dd></div>
            <div><dt className="text-xs text-muted">Publish date</dt><dd className="font-medium text-fg">{r.publishDate ? day(r.publishDate) : 'Not set'}</dd></div>
          </dl>
        </Card>
      </section>

      {/* 4. Video and repurposing */}
      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <Head title="Video" icon="film" sub="Recording and finished edit" />
          <Card className="p-4">
            <ul className="space-y-2">
              <StatusLine label="Script written" done={f.script} />
              <StatusLine label="Recording folder" done={f.video.folder} />
              <StatusLine label="Finished video" done={f.video.finished} />
              <StatusLine label="On YouTube" done={f.video.youtube}>{f.video.youtubeUrl && <> · <ExtLink href={f.video.youtubeUrl}>Watch</ExtLink></>}</StatusLine>
            </ul>
          </Card>
        </section>
        <section>
          <Head title="Repurposing" icon="layers" sub="Clips and written posts" />
          <Card className="p-4">
            <ul className="space-y-2">
              <StatusLine label="Short-clips project" done={f.repurposing.shortProject} />
              <StatusLine label={`${f.repurposing.clips} clip${f.repurposing.clips === 1 ? '' : 's'} connected`} done={f.repurposing.clips > 0} />
              <StatusLine label="Post drafts" done={f.repurposing.drafts} />
            </ul>
          </Card>
        </section>
      </div>

      {/* 5. Latest update / needs attention */}
      {(f.error || f.update) && (
        <section>
          <Head title={f.error ? 'Needs attention' : 'Latest update'} icon={f.error ? 'alert' : 'activity'} />
          {f.error ? <div className="rounded-2xl border border-bad-line bg-bad-soft p-4 text-sm leading-relaxed text-fg"><p className="break-words">{f.error}</p></div>
            : <Card className="p-4 text-sm leading-relaxed text-fg-2"><p className="break-words">{f.update}</p></Card>}
        </section>
      )}

      {/* 6. Details (the Content Center's "Advanced details") */}
      <details className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-card">
        <summary className="flex min-h-9 cursor-pointer items-center gap-2 font-semibold text-fg"><Icon name="list" size={16} className="text-muted" />Details</summary>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5">
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
