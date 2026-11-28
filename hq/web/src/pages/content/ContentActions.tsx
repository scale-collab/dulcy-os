// Content round 5 (Alex, 2026-11-28: "I want to build the content center inside Dulcy HQ"): the Content
// Center's buttons as HQ buttons, the YouTube copy block, and Distribution (per platform: the generated
// post to review, Approve, Schedule for Instagram / YouTube Shorts only when Alex presses it, and where /
// when it was posted with its views, likes and comments). The engine does each button the Content
// Center's way (contentActions.ts); this file only asks for what a button needs first (a link, the
// thumbnail changes, where the posts go) and shows the answer. HQ never posts. Everything is escaped text.
import { useState } from 'react';
import { api, type ContentDraft, type ContentItemDetail, type ContentPlatform, type ContentPostStats, type ContentStepButton } from '../../api';
import { Button, Card, cx, ErrorBox, ExtLink, Icon, Pill } from '../../ui';
import { copyText, day, Head } from './shared';

const field = 'min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-[15px] text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent';

/** One Content Center button, pressed in HQ. Asks first when the button needs input; then shows the engine's answer. */
export function RunButton({ id, b, primary, onDone, detail }: { id: string; b: ContentStepButton; primary?: boolean; onDone: (msg: string) => void; detail?: ContentItemDetail | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [channels, setChannels] = useState<string[] | null>(null);
  const [count, setCount] = useState('');
  const [minScore, setMinScore] = useState('');
  const brief = detail?.brief;
  const go = async (extra: Record<string, unknown> = {}) => {
    setBusy(true); setError('');
    try {
      const r = await api<{ message: string }>(`/content/items/${id}/run`, { body: { action: b.run, ...extra } });
      setOpen(false); onDone(r.message);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const tone = primary ? 'primary' : 'quiet';
  if (!b.input) {
    return (
      <>
        <Button tone={tone} icon={b.run === 'routeDavinci' || b.run === 'routeOpus' ? 'film' : 'play'} disabled={busy} onClick={() => void go()}>{busy ? 'Starting…' : b.label}</Button>
        {error && <span role="alert" className="w-full text-sm text-bad">{error}</span>}
      </>
    );
  }
  if (!open) return <Button tone={tone} icon={b.input === 'url' ? 'link' : b.input === 'changes' ? 'pen' : 'list'} onClick={() => setOpen(true)}>{b.label}</Button>;
  const picked = channels ?? brief?.channels ?? [];
  return (
    <div className="w-full rounded-xl border border-line bg-surface p-3">
      {b.input === 'url' && (
        <label className="block"><span className="text-sm font-medium text-fg">YouTube link</span>
          <input type="url" inputMode="url" value={text} onChange={(e) => setText(e.target.value)} placeholder="https://youtu.be/…" className={cx(field, 'mt-1')} /></label>
      )}
      {b.input === 'changes' && (
        <label className="block"><span className="text-sm font-medium text-fg">What should change in the thumbnail?</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="e.g. bigger text, use the red inbox photo" className={cx(field, 'mt-1')} /></label>
      )}
      {b.input === 'brief' && (
        <fieldset>
          <legend className="text-sm font-medium text-fg">Where the posts go</legend>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {(brief?.options ?? []).map((c) => (
              <label key={c} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-sunken px-3 text-sm text-fg">
                <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={picked.includes(c)} onChange={(e) => setChannels(e.target.checked ? [...picked, c] : picked.filter((x) => x !== c))} />{c}
              </label>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block text-sm text-fg-2">Clips to use<input type="number" min={1} max={50} value={count || String(brief?.count ?? 3)} onChange={(e) => setCount(e.target.value)} className={cx(field, 'mt-1')} /></label>
            <label className="block text-sm text-fg-2">Lowest clip score<input type="number" min={0} max={100} value={minScore || String(brief?.minScore ?? 85)} onChange={(e) => setMinScore(e.target.value)} className={cx(field, 'mt-1')} /></label>
          </div>
          {!detail && <p className="mt-2 text-xs text-muted">Loading the current choices…</p>}
        </fieldset>
      )}
      {error && <div className="mt-2"><ErrorBox error={error} /></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button tone="primary" icon="check" disabled={busy || (b.input !== 'brief' && !text.trim()) || (b.input === 'brief' && !picked.length)}
          onClick={() => void go(b.input === 'url' ? { url: text.trim() } : b.input === 'changes' ? { changes: text.trim() } : { channels: picked, count: Number(count || brief?.count || 3), minScore: Number(minScore || brief?.minScore || 85) })}>
          {busy ? 'Saving…' : b.input === 'changes' ? 'Send' : 'Save'}
        </Button>
        <Button tone="ghost" onClick={() => { setOpen(false); setError(''); }}>Cancel</Button>
      </div>
    </div>
  );
}

export function CopyLine({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState<'' | 'yes' | 'no'>('');
  if (!text) return null;
  return <Button tone="ghost" icon={ok === 'yes' ? 'check' : 'file'} className="min-h-9 px-3 text-sm" onClick={() => void copyText(text).then((x) => setOk(x ? 'yes' : 'no'))}>{ok === 'yes' ? 'Copied' : ok === 'no' ? 'Select and copy' : label}</Button>;
}

/** The YouTube title and description to copy into YouTube Studio (from "Prepare YouTube details"). */
export function YouTubeCopy({ d }: { d: ContentItemDetail }) {
  if (!d.youtube.title && !d.youtube.description) return null;
  return (
    <section>
      <Head title="YouTube title and description" icon="film" sub={d.youtube.url ? 'On YouTube.' : 'Copy these into YouTube Studio with the approved thumbnail.'} />
      <Card className="space-y-4 p-4 sm:p-5">
        {d.youtube.title && <div><div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-wider text-muted">Title</div><CopyLine text={d.youtube.title} label="Copy title" /></div><p className="mt-1 break-words text-[15px] font-medium text-fg">{d.youtube.title}</p></div>}
        {d.youtube.description && <div><div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-wider text-muted">Description</div><CopyLine text={d.youtube.description} label="Copy description" /></div><div className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-sunken p-3 text-sm leading-6 text-fg-2">{d.youtube.description}</div></div>}
        {d.thumbnail.url && <p className="text-sm"><ExtLink href={d.thumbnail.url}>Open the thumbnail</ExtLink>{d.thumbnail.status ? <span className="text-muted"> · {d.thumbnail.status}</span> : null}</p>}
      </Card>
    </section>
  );
}

/* ---------- Distribution ---------- */
const when = (iso: string) => {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${day(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))} ${d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`;
};
const n = (x: number | null | undefined) => (x === null || x === undefined ? '' : x.toLocaleString('en-US'));
const statusTone = (x: ContentDraft) => (x.publishing === 'Published' ? 'good' : x.publishing === 'Scheduled' ? 'info' : /failed/i.test(x.publishing) || x.approval === 'Rejected' ? 'bad' : x.approval === 'Approved' ? 'accent' : 'plain') as 'good' | 'info' | 'bad' | 'accent' | 'plain';
const statusText = (x: ContentDraft) => (x.publishing === 'Published' ? 'Posted' : x.publishing === 'Scheduled' ? `Scheduled${x.scheduledAt ? ` ${when(x.scheduledAt)}` : ''}` : x.publishing === 'Publishing' ? 'Posting…' : /failed/i.test(x.publishing) ? 'Failed' : x.approval === 'Approved' ? 'Approved, not posted' : x.approval === 'Rejected' ? 'Needs changes' : 'To review');

export function Distribution({ id, d, reload }: { id: string; d: ContentItemDetail | null; reload: () => void }) {
  if (!d) return null;
  const t = d.distribution.totals;
  const left = d.distribution.platforms.filter((p) => p.drafts.length || p.chosen).length;
  return (
    <section id={`distribution-${id}`} className="scroll-mt-4">
      <Head title="Distribution" icon="send" sub="Each platform's post: read it, approve it, post it, then record where it went and how it did. Nothing is posted from HQ." />
      <Card className="mb-3 p-4 sm:p-5">
        <dl className="grid grid-cols-4 gap-2 text-center">
          {([['Posted', `${d.distribution.posted}/${Math.max(left, d.distribution.posted)}`], ['Views', n(t.views) || '0'], ['Likes', n(t.likes) || '0'], ['Comments', n(t.comments) || '0']] as const).map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="tabular truncate text-lg font-bold text-fg">{v}</dd></div>
          ))}
        </dl>
        {d.distribution.status && <p className="mt-2 text-center text-xs text-muted">Posts: {d.distribution.status}</p>}
      </Card>
      <div className="space-y-2">
        {d.distribution.platforms.map((p) => <PlatformRow key={p.platform} id={id} p={p} reload={reload} />)}
      </div>
    </section>
  );
}

function PlatformRow({ id, p, reload }: { id: string; p: ContentPlatform; reload: () => void }) {
  const posted = p.drafts.some((x) => x.publishing === 'Published' || x.stats?.url) || !!p.manual?.url;
  const toReview = p.drafts.filter((x) => x.approval !== 'Approved' && x.approval !== 'Rejected' && x.publishing === 'Draft').length;
  return (
    <details className="group rounded-2xl border border-line bg-surface shadow-card" open={toReview > 0}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">{p.platform}</span>
        {posted ? <Pill tone="good" icon="check">Posted</Pill> : toReview ? <Pill tone="accent">{toReview} to review</Pill> : p.drafts.length ? <Pill>{p.drafts.length} draft{p.drafts.length === 1 ? '' : 's'}</Pill> : <Pill>{p.platform === 'TikTok' ? 'By hand' : 'No draft yet'}</Pill>}
        <Icon name="chevronDown" size={18} className="shrink-0 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-line p-3 sm:p-4">
        {p.platform === 'TikTok' && (
          <>
            <p className="text-sm text-fg-2">The Content OS makes no TikTok draft: post the short by hand (the Instagram reel caption works), then record it here.</p>
            <PostForm id={id} slot="TikTok" platform="TikTok" stats={p.manual} reload={reload} />
          </>
        )}
        {p.platform !== 'TikTok' && !p.drafts.length && <p className="text-sm text-muted">{p.chosen ? 'Chosen for this video. The post shows here after "Generate posts".' : 'No post for this platform.'}</p>}
        {p.drafts.map((x) => <DraftCard key={x.id} id={id} x={x} platform={p.platform} reload={reload} />)}
      </div>
    </details>
  );
}

function DraftCard({ id, x, platform, reload }: { id: string; x: ContentDraft; platform: string; reload: () => void }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [at, setAt] = useState('');
  const act = async (what: 'approve' | 'changes' | 'schedule') => {
    setBusy(what); setError(''); setMsg('');
    try {
      const r = await api<{ message: string }>(what === 'schedule' ? `/content/drafts/${x.id}/schedule` : `/content/drafts/${x.id}`, { body: what === 'schedule' ? { at: new Date(at).toISOString() } : { verdict: what } });
      setMsg(r.message); reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const draft = x.publishing === 'Draft' || !x.publishing;
  return (
    <div className="rounded-xl border border-line p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={statusTone(x)}>{statusText(x)}</Pill>
        {x.outputType && <span className="text-xs text-muted">{x.outputType}</span>}
      </div>
      {x.title && <div className="mt-2 break-words text-[15px] font-semibold text-fg">{x.title}</div>}
      {x.body && (
        <div className="mt-2">
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-sunken p-3 text-sm leading-6 text-fg">{x.body}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2"><CopyLine text={x.body} label="Copy post" />{x.media && <ExtLink href={x.media}>Open the clip</ExtLink>}</div>
        </div>
      )}
      {x.lastError && <p className="mt-2 break-words text-sm text-bad">{x.lastError}</p>}
      {msg && <p role="status" className="mt-2 text-sm text-good">{msg}</p>}
      {error && <div className="mt-2"><ErrorBox error={error} /></div>}
      {draft && x.approval !== 'Approved' && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
          <Button tone="accent" icon="check" disabled={!!busy} onClick={() => void act('approve')}>{busy === 'approve' ? 'Approving…' : 'Approve'}</Button>
          {x.approval !== 'Rejected' && <Button tone="danger" icon="pen" disabled={!!busy} onClick={() => void act('changes')}>{busy === 'changes' ? 'Saving…' : 'Needs changes'}</Button>}
        </div>
      )}
      {draft && x.approval === 'Approved' && x.canSchedule && (
        <div className="mt-3 rounded-xl bg-sunken p-3">
          <label className="block text-sm font-medium text-fg">Schedule through OpusClip (optional)
            <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={cx(field, 'mt-1')} />
          </label>
          <p className="mt-1 text-xs text-muted">Only when you press Schedule. Or post it by hand and record it below.</p>
          <Button className="mt-2" tone="primary" icon="calendar" disabled={!at || !!busy} onClick={() => void act('schedule')}>{busy === 'schedule' ? 'Scheduling…' : 'Schedule'}</Button>
        </div>
      )}
      {(x.approval === 'Approved' || x.publishing === 'Published' || x.publishing === 'Scheduled') && <PostForm id={id} slot={x.id} platform={platform} stats={x.stats} postUrl={x.postUrl} reload={reload} />}
    </div>
  );
}

/** Where and when it was posted, and how it did (views, likes, comments). */
function PostForm({ id, slot, platform, stats, postUrl, reload }: { id: string; slot: string; platform: string; stats: ContentPostStats | null; postUrl?: string; reload: () => void }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ url: stats?.url || postUrl || '', postedOn: stats?.postedOn || '', views: n(stats?.views).replace(/,/g, ''), likes: n(stats?.likes).replace(/,/g, ''), comments: n(stats?.comments).replace(/,/g, '') });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      await api(`/content/items/${id}/posted`, { body: { slot, url: v.url.trim(), postedOn: v.postedOn, views: v.views, likes: v.likes, comments: v.comments } });
      setOpen(false); reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3 text-sm">
        {stats?.url || stats?.postedOn || postUrl ? (
          <span className="min-w-0 flex-1 text-fg-2">
            {(stats?.url || postUrl) && <ExtLink href={stats?.url || postUrl || ''}>Post</ExtLink>}
            {stats?.postedOn && <> · posted {day(stats.postedOn)}</>}
            {stats && (stats.views !== null || stats.likes !== null || stats.comments !== null) && <> · {n(stats.views) || '0'} views · {n(stats.likes) || '0'} likes · {n(stats.comments) || '0'} comments</>}
          </span>
        ) : <span className="min-w-0 flex-1 text-muted">Not recorded yet.</span>}
        <Button tone="quiet" icon="pen" onClick={() => setOpen(true)}>{stats ? 'Update stats' : 'Record the post'}</Button>
      </div>
    );
  }
  const num = (k: 'views' | 'likes' | 'comments', label: string) => (
    <label className="block text-sm text-fg-2">{label}<input type="number" inputMode="numeric" min={0} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={cx(field, 'mt-1')} /></label>
  );
  return (
    <div className="mt-3 rounded-xl border border-line p-3">
      <label className="block text-sm font-medium text-fg">{platform} post link
        <input type="url" inputMode="url" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://…" className={cx(field, 'mt-1')} /></label>
      <label className="mt-2 block text-sm font-medium text-fg">Posted on
        <input type="date" max={today} value={v.postedOn} onChange={(e) => setV({ ...v, postedOn: e.target.value })} className={cx(field, 'mt-1')} /></label>
      <div className="mt-2 grid grid-cols-3 gap-2">{num('views', 'Views')}{num('likes', 'Likes')}{num('comments', 'Comments')}</div>
      {error && <div className="mt-2"><ErrorBox error={error} /></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button tone="primary" icon="check" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Button>
        <Button tone="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
