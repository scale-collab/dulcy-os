// New campaigns (Round 2, 2026-11-27): "How do I create campaigns? There's no button for that."
// New campaign = Atlas's campaign plan for a client (the same flow as his 60% / new-client trigger):
// plan → campaign + lead list records → filters → first-100 sample → your approval 1 → the full list
// and Scribe's copy → your approval 2 → the client → build → launch (only if every check passes).
import { useState } from 'react';
import { api, type PlanR2, type PlansR2, type PressR2 } from '../../api';
import { Avatar, Button, Card, cx, go, Pill, showToast } from '../../ui';
import { ActionBar, Sheet, slash } from './shared';

const WAIT: Record<string, string> = { plan: 'Waiting for your OK: the plan and the first 100 companies', contacts: 'Waiting for your OK: the contact sample is low', copy: 'Waiting for your OK: the copy and the list' };

export function PlanCard({ p, onDone, compact }: { p: PlanR2; onDone: () => void; compact?: boolean }) {
  const [more, setMore] = useState(false);
  return (
    <Card className={cx('p-4', p.waiting && 'border-accent')}>
      <div className="flex items-start gap-3">
        <Avatar name={p.waiting === 'copy' ? 'Scribe' : 'Atlas'} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="break-words text-[15px] font-semibold leading-snug text-fg">{p.campaignName || `New campaign for ${p.client}`}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{p.client}</span><span>· plan #{p.id}</span><span>· started {slash(p.created)}</span>
            <Pill tone={p.ended ? (p.state === 'live' ? 'good' : 'bad') : p.waiting ? 'accent' : 'info'}>{p.label}</Pill>
            {p.copyState === 'queued' && <Pill tone="info">Scribe writing (round {p.copyRound})</Pill>}
          </div>
          {p.waiting && <div className="mt-2 text-sm font-semibold text-accent-ink">{WAIT[p.waiting]}</div>}
          {p.error && <div className="mt-2 break-words text-sm text-bad">{p.error}</div>}
          {p.move && <div className="mt-2 text-sm text-fg-2"><span className="font-medium">Move: {p.move}.</span> {p.why}</div>}
          {p.questions.length > 0 && <div className="mt-2 text-sm text-warn">Questions for you: {p.questions.join(' · ')}</div>}
          {!compact && p.thesis && (
            <>
              <button onClick={() => setMore(!more)} className="mt-1.5 min-h-8 text-sm font-semibold text-accent-ink hover:underline">{more ? 'Hide the plan' : 'Read the plan'}</button>
              {more && <div className="mt-1 whitespace-pre-wrap rounded-xl bg-sunken p-3 text-sm leading-6 text-fg-2">{p.thesis}</div>}
            </>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {p.campaignRec && <button onClick={() => go(`campaigns/${p.campaignRec}`)} className="min-h-8 font-semibold text-accent-ink hover:underline">Open the campaign</button>}
            {p.leadListRec && <button onClick={() => go(`campaigns/list/${p.leadListRec}`)} className="min-h-8 font-semibold text-accent-ink hover:underline">Open the lead list</button>}
          </div>
        </div>
      </div>
      {!p.ended && <ActionBar className="mt-3" actions={p.actions.filter((a) => a.enabled || a.key !== 'rewrite' || p.waiting === 'copy')} what={`${p.client} · plan #${p.id}`} endpoint={`/campaigns/plans/${p.id}/action`} onDone={onDone} />}
    </Card>
  );
}

export function PlansSection({ d, onDone }: { d: PlansR2 | null; onDone: () => void }) {
  const open = (d?.plans ?? []).filter((p) => !p.ended);
  if (!open.length) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-semibold text-fg">New campaigns being made<span className="tabular text-sm font-normal text-muted">{open.length}</span></h2>
      <ul className="grid gap-3 lg:grid-cols-2">{open.map((p) => <li key={p.id}><PlanCard p={p} onDone={onDone} /></li>)}</ul>
    </section>
  );
}

/** The "New campaign" sheet: pick a client, see what happens and what it spends, confirm. */
export function NewCampaignSheet({ clients, client, atlasOn, dryRun, onClose, onDone }: { clients: { key: string; name: string }[]; client: string; atlasOn: boolean; dryRun: boolean; onClose: () => void; onDone: () => void }) {
  const [pick, setPick] = useState(client || clients[0]?.key || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = async () => {
    setBusy(true); setError('');
    try {
      const r = await api<PressR2>('/campaigns/plans', { body: { client: pick, confirm: true } });
      showToast({ text: r.message, tone: 'good', ms: 8000 }); onDone(); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet label="New campaign" onClose={onClose}>
      <h2 className="text-[20px] font-bold leading-tight text-fg">New campaign</h2>
      <p className="mt-1 text-sm text-muted">Atlas plans it from the client's offer, past campaigns and real replies (Alex's SOP), then builds it step by step. You approve twice; the client approves the copy.</p>
      <label className="mt-5 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Client</span>
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-fg focus:outline-none focus:ring-2 focus:ring-accent">
          {clients.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
      </label>
      <ol className="mt-5 space-y-2 text-[15px] leading-6 text-fg-2">
        {[
          'Atlas writes the plan: the move (top off, new vertical, new offer), ICP, one pain, proof, 2 Email-1 angles. Proof it cannot find is marked UNKNOWN, never made up.',
          'It makes the campaign and lead list records, presses Generate filters, then the first-100 company sample.',
          'Approval 1 comes to you here (and in Decisions): the plan and the sample.',
          'After your OK: the full list (expand, contacts, verify, QA) and Scribe writes the copy.',
          'Approval 2: copy + list. Then the client approves in the portal; then spintax, free healthy inboxes, Build, Launch (only if every launch check passes).',
        ].map((t, i) => <li key={i} className="flex gap-2.5"><span className="tabular mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sunken text-xs font-bold text-muted">{i + 1}</span><span>{t}</span></li>)}
      </ol>
      <div className="mt-5 rounded-xl bg-sunken px-3.5 py-2.5 text-sm text-fg-2"><span className="font-semibold">Spends before approval 1:</span> 1 AI call for the plan, about $1 of DiscoLike for the filters and $1 for the first 100 companies. Nothing more until you approve.</div>
      {!atlasOn && <div className="mt-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">Atlas campaign planning is off on the server (ATLAS_CAMPAIGNS). Alex switches it on; until then this button cannot start a plan.</div>}
      {atlasOn && dryRun && <div className="mt-3 rounded-xl bg-info-soft px-3.5 py-2.5 text-sm text-info">Dry run: atlas.plan is not in LIVE_STAGES, so Atlas only says what he would do.</div>}
      {error && <div role="alert" className="mt-3 rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">{error}</div>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Cancel</Button>
        <Button tone="primary" icon="plus" disabled={busy || !pick || !atlasOn} onClick={start}>{busy ? 'Starting…' : 'Confirm: start the plan'}</Button>
      </div>
    </Sheet>
  );
}
