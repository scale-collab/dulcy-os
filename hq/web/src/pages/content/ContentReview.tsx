// Content, final review (Alex, 2026-11-28: "For the final clip: yes, everything [move it into HQ]").
// On a video's page: the finished full video and each final clip, with Approve / Request changes.
// A clip's buttons do exactly what the Content Center's do (the engine writes the same Review Intent and
// calls the same n8n check; contentReview.ts): "Get the current copy" = "Refresh current preview",
// Approve = "Approve reviewed copy", Request changes = "Reject copy" plus your note on Sienna's list.
// The full video has no Content Center approval: Approve is saved in HQ, Request changes goes to Sienna.
// Also the Gamma link box (saved in the video's Notes, where "Open Gamma" reads it) and "Make the resource".
// Nothing here schedules or posts. Everything is escaped text.
import { useState } from 'react';
import { api, type ContentItemDetail, type ContentReviewClip } from '../../api';
import { Button, Card, ErrorBox, ExtLink, go, Icon, Pill } from '../../ui';
import { Head } from './shared';

const field = 'min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-[15px] text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent';
const statusTone = (s: string) => (/approved|scheduled|published/i.test(s) ? 'good' : /rejected/i.test(s) ? 'bad' : /needs review/i.test(s) ? 'accent' : 'plain') as 'good' | 'bad' | 'accent' | 'plain';

/** Approve / Request changes (with a note). `send` does the request and returns the engine's message. */
function Decide({ send, approveLabel = 'Approve', disabled, hint }: { send: (verdict: 'approve' | 'changes', note: string) => Promise<string>; approveLabel?: string; disabled?: boolean; hint?: string }) {
  const [busy, setBusy] = useState<'' | 'approve' | 'changes'>('');
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const run = async (v: 'approve' | 'changes') => {
    setBusy(v); setError('');
    try { setMsg(await send(v, note.trim())); setOpen(false); setNote(''); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  if (msg) return <p role="status" className="mt-2 flex items-start gap-1.5 text-sm text-good"><Icon name="check" size={15} className="mt-0.5 shrink-0" />{msg}</p>;
  return (
    <div className="mt-3">
      {error && <div className="mb-2"><ErrorBox error={error} /></div>}
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      {open ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-fg">What should change?
            <textarea value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Cut the first 2 seconds; the caption covers my face at 0:12" className={`${field} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button tone="primary" icon="send" disabled={!note.trim() || !!busy} onClick={() => void run('changes')}>{busy === 'changes' ? 'Sending…' : 'Send to Sienna'}</Button>
            <Button tone="quiet" disabled={!!busy} onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button tone="accent" icon="check" disabled={disabled || !!busy} onClick={() => void run('approve')}>{busy === 'approve' ? 'Approving…' : approveLabel}</Button>
          <Button tone="quiet" icon="pen" disabled={disabled || !!busy} onClick={() => setOpen(true)}>Request changes</Button>
        </div>
      )}
    </div>
  );
}

function ClipRow({ c, videoId, blocked, reload }: { c: ContentReviewClip; videoId: string; blocked: boolean; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [copy, setCopy] = useState(c.finalClipId);
  const changed = copy.trim() !== c.finalClipId;
  const review = async (action: 'refresh' | 'approve' | 'changes', note = '') => {
    const r = await api<{ message: string }>(`/content/clips/${c.id}/review`, { body: { action, videoId, ...(note ? { note } : {}), ...(action === 'refresh' && changed ? { finalClipId: copy.trim() } : {}) } });
    return r.message;
  };
  const refresh = async () => {
    setBusy(true); setError('');
    try { setMsg(await review('refresh')); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const decided = /^(approved|rejected|scheduled|published)$/i.test(c.status);
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 break-words text-[15px] font-semibold text-fg">{c.name}</div>
        <span className="flex shrink-0 items-center gap-1">{c.score !== null && <Pill>Score {c.score}</Pill>}<Pill tone={statusTone(c.status)}>{c.status || 'No status'}</Pill></span>
      </div>
      {c.qa && <div className="mt-1 text-sm text-good">{c.qa}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {c.watchUrl ? <ExtLink href={c.watchUrl}>Watch this copy</ExtLink> : <span className="text-muted">No preview yet</span>}
        <span className="text-xs text-muted">{c.verified ? `Checked copy ${c.verified.clipId} · review ${c.verified.version}` : 'Not checked yet: get the current copy first'}</span>
      </div>
      {error && <div className="mt-2"><ErrorBox error={error} /></div>}
      {msg ? <p role="status" className="mt-2 flex items-start gap-1.5 text-sm text-good"><Icon name="check" size={15} className="mt-0.5 shrink-0" />{msg} <button className="font-medium underline" onClick={reload}>Refresh</button></p> : (
        <>
          {c.canDecide && !changed && !decided && <Decide disabled={blocked} approveLabel="Approve this copy" send={(v, note) => review(v, note)} />}
          {(!c.canDecide || changed || decided) && (
            <div className="mt-3">
              <Button tone={c.canDecide && !changed ? 'quiet' : 'primary'} icon="refresh" disabled={busy || blocked} onClick={() => void refresh()}>{busy ? 'Asking OpusClip…' : 'Get the current copy'}</Button>
              <p className="mt-1 text-xs text-muted">{decided ? 'Already decided. Edited it again in OpusClip? Get the current copy, watch it, then decide again.' : 'Brings in the copy you\'ll approve (after any edit in OpusClip). It never approves, schedules or posts.'}</p>
            </div>
          )}
          <details className="mt-2 text-xs text-muted">
            <summary className="min-h-7 cursor-pointer select-none">A different final copy in OpusClip?</summary>
            <label className="mt-1 block">OpusClip clip ID (in this project)
              <input value={copy} onChange={(e) => setCopy(e.target.value)} className={`${field} mt-1 font-mono text-sm`} />
            </label>
          </details>
        </>
      )}
    </li>
  );
}

/** The finished video and its final clips, each with Approve / Request changes. */
export function FinalReview({ id, d, reload }: { id: string; d: ContentItemDetail; reload: () => void }) {
  const r = d.review;
  if (!r || (!r.video.finalUrl && !r.clips.length)) return null;
  const blocked = r.path === 'blocked';
  const waiting = r.clips.filter((c) => /needs review/i.test(c.status)).length;
  return (
    <section>
      <Head title="Final review" icon="film" sub={`Watch, then approve or say what to change.${waiting ? ` ${waiting} clip${waiting === 1 ? '' : 's'} waiting.` : ''} Approving never schedules or posts.`} />
      {blocked && <div className="mb-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-fg">Clip approvals from HQ wait for one n8n change (your OK in Decisions): n8n only accepts approvals written by your own Airtable login, and HQ's Airtable key writes as another user.</div>}
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-line">
          {r.video.finalUrl && (
            <li className="px-4 py-3.5 sm:px-5">
              <div className="flex items-start justify-between gap-2"><div className="text-[15px] font-semibold text-fg">Full video</div><Pill>Finished</Pill></div>
              <div className="mt-2 text-sm"><ExtLink href={r.video.finalUrl}>Watch the full video</ExtLink></div>
              <Decide send={async (verdict, note) => (await api<{ message: string }>(`/content/items/${id}/video-review`, { body: { verdict, ...(note ? { note } : {}) } })).message} />
            </li>
          )}
          {r.clips.map((c) => <ClipRow key={c.id} c={c} videoId={id} blocked={blocked} reload={reload} />)}
        </ul>
      </Card>
    </section>
  );
}

/** Paste / edit the Gamma link (saved in the video's Notes), and "Make the resource" from Sienna's outline. */
export function GammaBox({ id, d, reload }: { id: string; d: ContentItemDetail; reload: () => void }) {
  const g = d.gamma;
  const [url, setUrl] = useState(g?.url ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  if (!g) return null;
  const ok = /^https:\/\/(www\.)?gamma\.app\/\S+$/i.test(url.trim());
  const save = async () => {
    setBusy(true); setError(''); setMsg('');
    try { setMsg((await api<{ message: string }>(`/content/items/${id}/gamma`, { body: { url: url.trim() } })).message); reload(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section>
      <Head title="Slides and resource" icon="file" sub={g.outline ? 'Make a branded document from Sienna\'s slide outline (download it as a PDF), or link a Gamma doc you made.' : 'Link a Gamma doc for this video.'} />
      <Card className="p-4 sm:p-5">
        {g.outline && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button tone="primary" icon="file" onClick={() => go(`content/items/${id}/resource`)}>Make the resource</Button>
            {g.url && <a href={g.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg hover:bg-hover"><Icon name="external" size={16} />Open Gamma</a>}
          </div>
        )}
        <label className="block text-sm font-medium text-fg">Gamma link
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input type="url" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); setMsg(''); }} placeholder="https://gamma.app/docs/…" className={field} />
            <Button tone="quiet" icon="check" disabled={busy || !ok || url.trim() === g.url} onClick={() => void save()}>{busy ? 'Saving…' : 'Save link'}</Button>
          </div>
        </label>
        {!g.outline && g.url && <p className="mt-2 text-sm"><ExtLink href={g.url}>Open Gamma</ExtLink></p>}
        {msg && <p role="status" className="mt-2 text-sm text-good">{msg}</p>}
        {error && <div className="mt-2"><ErrorBox error={error} /></div>}
      </Card>
    </section>
  );
}
