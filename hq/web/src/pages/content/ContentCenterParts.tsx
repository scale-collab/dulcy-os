// Content parity (Alex, 2026-11-28: "the entire content center" in HQ). The Airtable Content Center pieces
// HQ did not have yet: the settings panel (its gear), "+ Add content idea", and on each video "Content for",
// the two dates, the YouTube boxes, the previous thumbnail, the clips shortlist and the trash button. The
// engine writes each one the Content Center's way (engine/src/hq/contentCenter.ts); this file only collects
// the input and shows the answer. Everything is escaped text; nothing posts. Audit: hq/content-parity-2026-11-28.md.
import { useEffect, useState } from 'react';
import { api, type ContentChannelSettings, type ContentItemDetail, type ContentSettingsView, type ContentShortClip } from '../../api';
import { Button, Card, cx, ErrorBox, ExtLink, go, Icon, Pill } from '../../ui';
import { copyText, Head } from './shared';

const field = 'min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-[15px] text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent';
export const CHANNELS = ['Alex Woung', 'Alex Woung Raw'] as const;

/* ---------- + Add content idea ---------- */
export function AddIdea({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [channel, setChannel] = useState<string>('Alex Woung');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const add = async () => {
    setBusy(true); setError('');
    try {
      const r = await api<{ id: string }>('/content/ideas', { body: { title: title.trim(), description: notes.trim(), channel } });
      onAdded(); go(`content/items/${r.id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card className="p-4 sm:p-5">
      <Head title="Add a content idea" icon="plus" sub="It waits for your approval like Sienna's ideas. Approving it gives it its recording and publish dates." />
      <label className="block text-sm font-medium text-fg">Idea title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="What should this content be about?" className={cx(field, 'mt-1')} /></label>
      <label className="mt-3 block text-sm font-medium text-fg">Notes or angle <span className="font-normal text-muted">(optional)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={5000} placeholder="Why this matters, the hook, or what you want covered…" className={cx(field, 'mt-1')} /></label>
      <fieldset className="mt-3">
        <legend className="text-sm font-medium text-fg">Channel</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {CHANNELS.map((c) => (
            <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)}
              className={cx('min-h-11 rounded-xl border px-3 text-[15px] font-semibold', channel === c ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-fg-2 hover:border-line-strong')}>{c}</button>
          ))}
        </div>
      </fieldset>
      {error && <div className="mt-3"><ErrorBox error={error} /></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button tone="primary" icon="plus" disabled={busy || !title.trim()} onClick={() => void add()}>{busy ? 'Adding…' : 'Add idea'}</Button>
        <Button tone="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Card>
  );
}

/* ---------- Settings (the Content Center's gear: "Content scheduling settings") ---------- */
type Num = 'videosPerWeek' | 'minimumSpacingDays' | 'reviewThreshold' | 'minimumClipScore' | 'clipsPerWeek';
const BOXES: { k: Num; label: string; min: number; max: number; note?: string; unit?: string }[] = [
  { k: 'videosPerWeek', label: 'Videos per week', min: 1, max: 7 },
  { k: 'minimumSpacingDays', label: 'Minimum spacing between videos', min: 1, max: 14, unit: 'days' },
  { k: 'reviewThreshold', label: 'Manual-review score', min: 0, max: 100, note: 'Lower-scoring ideas stay archived instead of filling your calendar.' },
  { k: 'minimumClipScore', label: 'Minimum clip score', min: 0, max: 100, note: 'Only OpusClip results at or above this score are used. 85 recommended.' },
  { k: 'clipsPerWeek', label: 'Clips per week', min: 1, max: 7, note: 'Approved clips are spread evenly through each week.' },
];
const DEFAULTS: Record<string, Record<Num, number>> = {
  'Alex Woung': { videosPerWeek: 2, clipsPerWeek: 3, reviewThreshold: 75, minimumSpacingDays: 2, minimumClipScore: 85 },
  'Alex Woung Raw': { videosPerWeek: 5, clipsPerWeek: 3, reviewThreshold: 70, minimumSpacingDays: 1, minimumClipScore: 85 },
};
export function ContentSettings() {
  const [d, setD] = useState<ContentChannelSettings[] | null>(null);
  const [ch, setCh] = useState<string>('Alex Woung');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api<ContentSettingsView>('/content/settings').then((x) => setD(x.channels)).catch((e) => setError((e as Error).message)); }, []);
  if (error && !d) return <ErrorBox error={error} />;
  if (!d) return <Card className="p-5 text-sm text-muted">Loading the settings…</Card>;
  const cur = d.find((x) => x.channel === ch) ?? d[0];
  const set = (k: Num, v: string) => { setMsg(''); setD(d.map((x) => (x.channel === cur.channel ? { ...x, [k]: v === '' ? ('' as unknown as number) : Number(v) } : x))); };
  const save = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      const settings = Object.fromEntries(d.map((x) => [x.channel, Object.fromEntries(BOXES.map((b) => [b.k, x[b.k]]))]));
      const r = await api<{ message: string }>('/content/settings', { body: { settings } });
      setMsg(r.message);
      setD((await api<ContentSettingsView>('/content/settings')).channels);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="max-w-2xl">
      <Head title="Content scheduling settings" icon="wrench" sub="Every idea needs your approval. Set the review score, the schedule cadence and the clip quality here. Sienna and the n8n flows read these." />
      <div role="tablist" aria-label="Channel" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-sunken p-1">
        {d.map((x) => (
          <button key={x.channel} role="tab" aria-selected={x.channel === cur.channel} onClick={() => setCh(x.channel)}
            className={cx('min-h-11 rounded-lg px-3 text-[15px] font-semibold', x.channel === cur.channel ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>{x.channel}</button>
        ))}
      </div>
      <Card className="mt-3 p-4 sm:p-5">
        {!cur.found && <p className="mb-3 text-sm text-warn">No settings record for {cur.channel} in Airtable: saving is refused until it exists.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {BOXES.map((b) => {
            const fixed = cur.fixed && (b.k === 'videosPerWeek' || b.k === 'minimumSpacingDays');
            return (
              <label key={b.k} className="block text-sm font-medium text-fg">{b.label}
                <input type="number" inputMode="numeric" min={b.min} max={b.max} disabled={fixed} value={fixed ? 2 : String(cur[b.k] ?? '')} onChange={(e) => set(b.k, e.target.value)} className={cx(field, 'mt-1 disabled:opacity-60')} />
                {b.unit && <span className="mt-0.5 block text-xs font-normal text-muted">{b.unit}</span>}
                {fixed && <span className="mt-0.5 block text-xs font-normal text-muted">Fixed for Alex Woung: published Tuesday and Thursday.</span>}
                {b.note && <span className="mt-0.5 block text-xs font-normal text-muted">{b.note}</span>}
              </label>
            );
          })}
        </div>
        <p className="mt-4 rounded-xl bg-sunken p-3 text-sm text-fg-2">
          <strong className="text-fg">{cur.channel}</strong> schedules approved ideas up to <strong className="text-fg">{cur.fixed ? 2 : cur.videosPerWeek} a week</strong>, at least <strong className="text-fg">{cur.fixed ? 2 : cur.minimumSpacingDays} days apart</strong>. Repurposing uses clips scoring <strong className="text-fg">{cur.minimumClipScore} or higher</strong>, <strong className="text-fg">{cur.clipsPerWeek} clips a week</strong>.
        </p>
        {error && <div className="mt-3"><ErrorBox error={error} /></div>}
        {msg && <p role="status" className="mt-3 text-sm text-good">{msg}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button tone="primary" icon="check" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save settings'}</Button>
          <Button tone="ghost" icon="undo" disabled={busy} onClick={() => { setMsg(''); setD(d.map((x) => ({ ...x, ...DEFAULTS[x.channel] }))); }}>Reset defaults</Button>
          <Button tone="ghost" onClick={() => go('content/items')}>Back to Content</Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------- on the video's page ---------- */
async function post(id: string, what: 'channel' | 'dates' | 'youtube' | 'delete', body: unknown) {
  return api<{ message: string }>(`/content/items/${id}/${what}`, { body });
}

/** "Content for": the video's channel (an idea needs it before it can be approved). */
export function ChannelPicker({ id, channel, onDone }: { id: string; channel: string; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const pick = async (c: string) => {
    if (c === channel) return;
    setBusy(c); setError('');
    try { onDone((await post(id, 'channel', { channel: c })).message); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  return (
    <div>
      <div className="text-xs text-muted">Content for</div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {CHANNELS.map((c) => (
          <button key={c} type="button" aria-pressed={channel === c} disabled={!!busy} onClick={() => void pick(c)}
            className={cx('min-h-11 rounded-xl border px-3 text-left text-sm font-semibold', channel === c ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-fg-2 hover:border-line-strong')}>
            {channel === c && <Icon name="check" size={14} strokeWidth={2.6} className="mr-1 inline align-[-2px]" />}{busy === c ? 'Saving…' : c}
          </button>
        ))}
      </div>
      {!channel && <p className="mt-1 text-xs text-warn">Pick the channel before approving.</p>}
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
    </div>
  );
}

/** Recording / Publish Date, saved as soon as one changes (only once the idea is approved). */
export function DatesEdit({ id, recording, publish, locked, onDone }: { id: string; recording: string; publish: string; locked: boolean; onDone: (msg: string) => void }) {
  const [v, setV] = useState({ recording, publish });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setV({ recording, publish }), [recording, publish]);
  const save = async (kind: 'recording' | 'publish', date: string) => {
    const before = v;
    setV({ ...v, [kind]: date }); setBusy(true); setError('');
    try { onDone((await post(id, 'dates', { kind, date })).message); } catch (e) { setV(before); setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {(['recording', 'publish'] as const).map((k) => (
          <label key={k} className="block text-xs text-muted">{k === 'recording' ? 'Recording date' : 'Publish date'}
            <input type="date" disabled={locked || busy} value={v[k]} onChange={(e) => void save(k, e.target.value)} className={cx(field, 'mt-1 disabled:opacity-60')} /></label>
        ))}
      </div>
      {locked && <p className="mt-1 text-xs text-muted">Approve the idea first: approving sets both dates.</p>}
      {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
    </div>
  );
}

/** The YouTube boxes: title, description, chapters (copy, "Generate missing details", "Save YouTube details"). */
export function YouTubeEdit({ id, d, onDone }: { id: string; d: ContentItemDetail; onDone: (msg: string) => void }) {
  const [v, setV] = useState({ title: d.youtube.title || d.title, description: d.youtube.description, chapters: d.youtube.chapters });
  const [busy, setBusy] = useState<'' | 'gen' | 'save'>('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => setV({ title: d.youtube.title || d.title, description: d.youtube.description, chapters: d.youtube.chapters }), [d.youtube.title, d.youtube.description, d.youtube.chapters, d.title]);
  const run = async (what: 'gen' | 'save') => {
    setBusy(what); setError(''); setMsg('');
    try {
      const r = what === 'save' ? await post(id, 'youtube', v) : await api<{ message: string }>(`/content/items/${id}/run`, { body: { action: 'youtubeDetails', ...v } });
      setMsg(r.message); onDone(r.message);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const copy = (text: string, label: string) => <Button tone="ghost" icon="file" className="min-h-9 px-3 text-sm" disabled={!text} onClick={() => void copyText(text).then((ok) => setMsg(ok ? `${label} copied.` : `Could not copy the ${label.toLowerCase()}: select it and copy it.`))}>Copy</Button>;
  return (
    <section>
      <Head title="YouTube upload" icon="film" sub={`Channel: ${d.channel || 'pick it under Schedule'}. Chapters only when the timestamps are accurate.`} />
      <Card className="space-y-3 p-4 sm:p-5">
        <label className="block text-sm font-medium text-fg"><span className="flex items-center justify-between gap-2">YouTube title{copy(v.title, 'YouTube title')}</span>
          <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={500} className={cx(field, 'mt-1')} /></label>
        <label className="block text-sm font-medium text-fg"><span className="flex items-center justify-between gap-2">YouTube description{copy(v.description, 'YouTube description')}</span>
          <textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={8} placeholder="Generate the missing details to write the channel's description." className={cx(field, 'mt-1')} /></label>
        <label className="block text-sm font-medium text-fg">Chapters <span className="font-normal text-muted">(optional)</span>
          <textarea value={v.chapters} onChange={(e) => setV({ ...v, chapters: e.target.value })} rows={3} placeholder={'00:00 Introduction\n02:15 First topic'} className={cx(field, 'mt-1')} /></label>
        {d.thumbnail.url && <p className="text-sm"><ExtLink href={d.thumbnail.url}>Open the thumbnail</ExtLink>{d.thumbnail.status ? <span className="text-muted"> · {d.thumbnail.status}</span> : null}{d.thumbnail.previousUrl && <> · <ExtLink href={d.thumbnail.previousUrl}>Previous thumbnail</ExtLink></>}</p>}
        {error && <ErrorBox error={error} />}
        {msg && <p role="status" className="text-sm text-good">{msg}</p>}
        <div className="flex flex-wrap gap-2">
          <Button icon="sparkles" disabled={!!busy} onClick={() => void run('gen')}>{busy === 'gen' ? 'Starting…' : 'Generate missing details'}</Button>
          <Button tone="primary" icon="check" disabled={!!busy || !v.title.trim() || !v.description.trim()} onClick={() => void run('save')}>{busy === 'save' ? 'Saving…' : 'Save YouTube details'}</Button>
          <a href="https://studio.youtube.com/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg hover:bg-hover"><Icon name="external" size={16} />Open YouTube Studio</a>
        </div>
      </Card>
    </section>
  );
}

/** The video's clips shortlist (the Content Center's review panel, Clips tab). Read only: approving a clip stays in the Content Center. */
export function ClipsShortlist({ d, approveUrl }: { d: ContentItemDetail; approveUrl: string }) {
  const clips = d.clips ?? [];
  if (!clips.length && !d.opusUrl) return null;
  return (
    <section>
      <Head title={`Clips (${clips.length})`} icon="film" sub="The imported shortlist, best score first. Edit and save in OpusClip; the final copy is checked before it is approved." />
      {d.opusUrl && <p className="mb-2"><a href={d.opusUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg hover:bg-hover"><Icon name="external" size={16} />All candidates in OpusClip</a></p>}
      <div className="space-y-2">{clips.map((c, i) => <ClipCard key={c.id} c={c} n={i + 1} />)}</div>
      {clips.some((c) => c.status === 'Needs Review') && (
        <p className="mt-2 text-sm text-fg-2">Approve or reject a reviewed copy in the Content Center: its flow accepts only a decision written there by team@dulcy.io. <a href={approveUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-ink underline">Open the clip review</a></p>
      )}
    </section>
  );
}
function ClipCard({ c, n }: { c: ContentShortClip; n: number }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface shadow-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-fg">{c.name}</span><span className="text-xs text-muted">Candidate {n} · score {c.score ?? 'not given'} · {c.status || 'no status'}</span></span>
        <Pill tone={c.verifiedClipId ? 'good' : 'plain'}>{c.review}</Pill>
        <Icon name="chevronDown" size={18} className="shrink-0 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-line p-4 text-sm">
        {c.preview ? <a href={c.preview} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 font-semibold text-fg hover:bg-hover"><Icon name="play" size={16} />Watch the current preview</a> : <p className="text-muted">No preview yet: it shows once OpusClip has rendered it.</p>}
        <p className="break-all text-xs text-muted">Opus clip: {c.opusId || 'missing'} · verified copy: {c.verifiedClipId || 'none'} · review version: {c.version ?? 'none'}</p>
        {c.notes && <div><div className="text-xs font-semibold uppercase tracking-wider text-muted">Editorial notes</div><p className="mt-1 whitespace-pre-wrap break-words text-fg-2">{c.notes}</p></div>}
        {c.transcript && <details><summary className="cursor-pointer font-medium text-fg">Transcript</summary><p className="mt-1 whitespace-pre-wrap break-words text-fg-2">{c.transcript}</p></details>}
      </div>
    </details>
  );
}

/** The trash button: deletes this one Airtable record after a second press. Files, clips, videos and posts are kept. */
export function DeleteItem({ id, title }: { id: string; title: string }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  if (done) return <p role="status" className="text-sm text-good">{done} <button className="font-semibold underline" onClick={() => go('content/items')}>Back to Content</button></p>;
  if (!ask) return <Button tone="ghost" icon="x" onClick={() => setAsk(true)}>Delete this content record</Button>;
  const del = async () => {
    setBusy(true); setError('');
    try { setDone((await post(id, 'delete', { confirm: true })).message); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border border-bad-line bg-bad-soft p-3">
      <p className="text-sm text-fg"><strong>{title}</strong> will be removed from Airtable for good. Frame.io files, OpusClip projects, YouTube videos and published posts are not deleted.</p>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button tone="danger" icon="x" disabled={busy} onClick={() => void del()}>{busy ? 'Deleting…' : 'Delete from Airtable'}</Button>
        <Button tone="ghost" disabled={busy} onClick={() => setAsk(false)}>Cancel</Button>
      </div>
    </div>
  );
}

/** The Content Center's suggestedDistributionTime (a starting time for a post's schedule box), as a datetime-local value. */
export function suggestedTime(platform: string, index: number, publishDate: string, clipsPerWeek: number): string {
  const now = new Date();
  const parent = publishDate ? new Date(`${publishDate}T12:00:00`) : now;
  const start = new Date(Math.max(now.getTime() + 86_400_000, parent.getTime() + 86_400_000));
  const weekly = Math.max(1, Math.min(7, Math.round(clipsPerWeek) || 3));
  start.setDate(start.getDate() + Math.floor(index / weekly) * 7 + Math.floor((index % weekly) * 7 / weekly));
  const yt = /youtube/i.test(platform);
  start.setHours(yt ? 13 : 11, yt ? 0 : 30, 0, 0);
  const local = new Date(start.getTime() - start.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
