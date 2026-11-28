// HQ center parity (Alex 2026-11-28: "make sure the full implementation of the campaign and lead list
// center as I said"): the rest of the Airtable Campaign Center and Lead List Center, as new sections
// and tabs (the round 5 campaign header is left as it is). Every Save / button is the same write the
// Airtable screen makes (engine/src/hq/centerParity.ts); the server checks everything again and only
// the owner can write (members see the same fields, read only).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type SendingBoxR2 } from '../../api';
import { Button, Card, cx, ErrorBox, go, Pill, SkeletonCard, showToast } from '../../ui';
import { num, Sheet, slash, slashTime } from './shared';

/** Delete campaign from HQ: off until Alex decides (RULES 2026-11-23: Delete stays in n8n for now). */
const DELETE_IN_HQ = false;

type Kind = 'text' | 'long' | 'number' | 'date' | 'bool' | 'select' | 'multi' | 'time' | 'json' | 'url';
interface Def { kind: Kind; label: string; choices: string[] | null }
type Val = string | number | boolean | string[] | null;
export interface CampaignFieldsP {
  id: string; values: Record<string, Val>; defs: Record<string, Def>; status: string; stage: string; clientKey: string; client: string;
  approval: { byDulcy: boolean; approved: boolean; changes: boolean; decision: string; source: string; changeArea: string; feedback: string; submittedAt: string; autoApproveAt: string; more: { label: string; text: string }[] };
  saved: { processing: string; message: string; error: string; request: string; bisonAction: string; spintax: boolean };
  lists: { id: string; name: string; stage: string; qa: string }[]; listId: string; accounts: string[];
  topup: { list: { id: string; name: string; stage: string; qa: string; leads: number } | null; ruleMet: boolean; interestedRate: number | null; status: string; added: number; skipped: number; failed: number; lastRun: string; message: string };
  pivots: { vertical: boolean; offer: boolean } | null;
  analytics: { rows: { step: number; variant: string; subject: string; sent: number; replies: number; interested: number; bounces: number; replyRate: number; interestedRate: number; bounceRate: number; sample: string }[]; leader: string };
  locked: boolean; built: boolean; canAct: boolean; readAt: string;
}
export interface ListFieldsP {
  id: string; values: Record<string, Val>; defs: Record<string, Def>;
  route: { generic: boolean; direct: boolean; leadMagic: boolean; genericVerifier: string; directVerifier: string };
  qa: { status: string; summary: string; requiredFields: string; duplicateCheck: string; finalSchema: string; duplicates: number; rejected: number };
  saved: { processing: string; message: string; error: string }; bisonListId: string; sourceType: string;
  campaigns: { id: string; name: string }[]; linked: string[]; locked: boolean; canAct: boolean; readAt: string;
  esp: { pre: Esp | null; production: Esp | null }; deepReview: { results: string; needsReview: number };
}
interface Esp { total: number; updatedAt: string; counts: { name: string; count: number }[] }
interface Ok { ok: true; message: string; id?: string }

const input = 'mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft disabled:opacity-60';
const lab = 'text-xs font-semibold uppercase tracking-wide text-muted';

/** POST with confirm: true; a toast with the server's answer. */
async function send(path: string, body: Record<string, unknown>, done?: (r: Ok) => void): Promise<boolean> {
  try { const r = await api<Ok>(path, { body: { ...body, confirm: true } }); showToast({ text: r.message, tone: 'good', ms: 7000 }); done?.(r); return true; }
  catch (e) { showToast({ text: (e as Error).message, tone: 'bad', ms: 9000 }); return false; }
}

function useFields<T>(path: string) {
  const [d, setD] = useState<T | null>(null); const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<T>(path).then(setD).catch((e) => setError(e.message)); }, [path]);
  useEffect(load, [load]);
  return { d, error, load };
}

/** One field, by its kind. */
function FieldInput({ k, def, value, onChange, disabled }: { k: string; def: Def; value: Val; onChange: (v: Val) => void; disabled: boolean }) {
  const id = `fld-${k}`;
  if (def.kind === 'bool') return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-[15px] text-fg">
      <input id={id} type="checkbox" className="h-5 w-5 " checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{def.label}
    </label>
  );
  if (def.kind === 'multi') {
    const cur = Array.isArray(value) ? value : [];
    return (
      <fieldset><legend className={lab}>{def.label}</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{(def.choices ?? []).map((c) => (
          <label key={c} className={cx('inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm', cur.includes(c) ? 'border-accent bg-accent-soft text-fg' : 'border-line bg-surface text-fg-2')}>
            <input type="checkbox" className="sr-only" checked={cur.includes(c)} disabled={disabled} onChange={(e) => onChange(e.target.checked ? [...cur, c] : cur.filter((x) => x !== c))} />{c}
          </label>))}
        </div>
      </fieldset>
    );
  }
  const v = value === null || value === undefined ? '' : String(value);
  return (
    <label htmlFor={id} className="block min-w-0">
      <span className={lab}>{def.label}</span>
      {def.kind === 'long' || def.kind === 'json'
        ? <textarea id={id} rows={def.kind === 'json' ? 8 : 5} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cx(input, def.kind === 'json' && 'font-mono text-[13px]')} />
        : def.kind === 'select'
          ? <select id={id} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={input}><option value="">Not set</option>{(def.choices ?? []).map((c) => <option key={c} value={c}>{c}</option>)}</select>
          : <input id={id} value={v} disabled={disabled} inputMode={def.kind === 'number' ? 'numeric' : undefined} type={def.kind === 'date' ? 'date' : 'text'} placeholder={def.kind === 'time' ? '09:00' : def.kind === 'url' ? 'https://docs.google.com/spreadsheets/…' : undefined}
              onChange={(e) => onChange(def.kind === 'number' ? (e.target.value === '' ? null : Number(e.target.value.replace(/[^\d]/g, ''))) : e.target.value)} className={input} />}
    </label>
  );
}

/** A group of fields with one Save (sends only what changed). */
function FieldGroup({ title, keys, d, path, onSaved, note, wide }: { title: string; keys: string[]; d: { values: Record<string, Val>; defs: Record<string, Def>; canAct: boolean; locked: boolean }; path: string; onSaved: () => void; note?: ReactNode; wide?: string[] }) {
  const shown = keys.filter((k) => d.defs[k]);
  const [draft, setDraft] = useState<Record<string, Val>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft({}), [d.values]);
  const changed = Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(d.values[k]));
  const off = !d.canAct || d.locked || busy;
  if (!shown.length) return null;
  const save = async () => { setBusy(true); const ok = await send(path, { changes: Object.fromEntries(changed.map((k) => [k, draft[k]])) }); setBusy(false); if (ok) onSaved(); };
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
        {d.canAct && <Button tone={changed.length ? 'primary' : 'quiet'} disabled={off || !changed.length} onClick={save}>{busy ? 'Saving…' : changed.length ? `Save ${changed.length}` : 'Saved'}</Button>}
      </div>
      {note && <div className="mt-1 text-sm text-muted">{note}</div>}
      {d.locked && <div className="mt-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">A step is running: edits wait for its result.</div>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {shown.map((k) => (
          <div key={k} className={cx(['long', 'json', 'multi'].includes(d.defs[k].kind) || wide?.includes(k) ? 'sm:col-span-2' : '')}>
            <FieldInput k={k} def={d.defs[k]} value={k in draft ? draft[k] : d.values[k]} disabled={!d.canAct || d.locked} onChange={(v) => setDraft((x) => ({ ...x, [k]: v }))} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** A button that asks once (what it does), then sends. */
function DoButton({ label, does, path, body, tone = 'quiet', disabled, why, onDone, typed, ack }: { label: string; does: string; path: string; body: Record<string, unknown>; tone?: 'primary' | 'quiet' | 'danger'; disabled?: boolean; why?: string; onDone: () => void; typed?: string; ack?: string }) {
  const [open, setOpen] = useState(false); const [text, setText] = useState(''); const [ticked, setTicked] = useState(false); const [busy, setBusy] = useState(false);
  return (
    <>
      <Button tone={disabled ? 'quiet' : tone} disabled={disabled} title={disabled ? why : does} onClick={() => { setText(''); setTicked(false); setOpen(true); }}>{label}</Button>
      {open && (
        <Sheet label={label} onClose={() => setOpen(false)}>
          <h2 className="text-[20px] font-bold tracking-tight text-fg">{label}</h2>
          <p className="mt-3 text-[15px] leading-6 text-fg-2">{does}</p>
          {ack && <label className="mt-4 flex items-start gap-2.5 rounded-xl bg-warn-soft px-3.5 py-3 text-sm text-fg"><input type="checkbox" className="mt-0.5 h-5 w-5" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />{ack}</label>}
          {typed && <label className="mt-4 block"><span className={lab}>Type {typed} to continue</span><input value={text} onChange={(e) => setText(e.target.value)} className={input} autoComplete="off" /></label>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button tone={tone === 'danger' ? 'danger' : 'primary'} disabled={busy || (!!typed && text.trim() !== typed) || (!!ack && !ticked)}
              onClick={async () => { setBusy(true); const ok = await send(path, { ...body, ...(typed ? { typed: text.trim() } : {}), ...(ack ? { acknowledged: ticked } : {}) }, (r) => { if (r.id && /campaign/.test(path) && /clone/.test(String(body.action))) go(`campaigns/${r.id}`); }); setBusy(false); if (ok) { setOpen(false); onDone(); } }}>
              {busy ? 'Sending…' : `Confirm: ${label}`}
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}

const loadingBox = <div className="mt-3"><SkeletonCard lines={4} /></div>;

// ===================== Campaign Center =====================
/** The campaign tabs the Airtable screen has and HQ did not: Strategy edits, Copy + Approval, Sequence, Settings, Senders picking, Variants, More. */
export function CampaignCenterSection({ id, section, onDone }: { id: string; section: 'strategy' | 'copy' | 'sequence' | 'settings' | 'senders' | 'variants' | 'more'; onDone: () => void }) {
  const { d, error, load } = useFields<CampaignFieldsP>(`/campaigns/${encodeURIComponent(id)}/fields`);
  const reload = () => { load(); onDone(); };
  if (error) return <div className="mt-3"><ErrorBox error={error} retry={load} /></div>;
  if (!d) return loadingBox;
  const path = `/campaigns/${id}/edit`; const doPath = `/campaigns/${id}/do`;
  const ro = !d.canAct;
  return (
    <div className="mt-3 space-y-3">
      {section === 'strategy' && <>
        <FieldGroup title="Campaign strategy" keys={['name', 'approach', 'prepDate', 'launchDate', 'thesis']} d={d} path={path} onSaved={reload} wide={['name']} note="Saved on the campaign only; the lead list's targeting sentence is not changed." />
        <Card className="p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold text-fg">Lead list</h3>
          <LinkPicker current={d.listId} options={d.lists.map((l) => ({ id: l.id, label: `${l.name}${l.stage ? ` · ${l.stage}` : ''}${l.qa === 'Passed' ? ' · QA Passed' : ''}` }))} disabled={ro || d.locked}
            onPick={(listId) => send(doPath, { action: 'link-list', listId }).then((ok) => ok && reload())} empty="No lead list of this client yet: make one in Lead lists → New lead list." />
          {d.listId && <button onClick={() => go(`campaigns/list/${d.listId}`)} className="mt-2 text-sm font-semibold text-accent-ink hover:underline">Open the lead list</button>}
        </Card>
        {d.pivots && (
          <Card className="p-4 sm:p-5">
            <h3 className="text-[15px] font-semibold text-fg">Client-wide pivot options</h3>
            <p className="mt-1 text-sm text-muted">Saved once for {d.client || 'the client'} and used by all its campaigns.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {([['vertical', 'Can enter a new vertical', d.pivots.vertical], ['offer', 'Can create a new offer', d.pivots.offer]] as const).map(([which, label, on]) => (
                <label key={which} className="flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-[15px]">
                  <input type="checkbox" className="h-5 w-5" checked={on} disabled={ro} onChange={(e) => send(doPath, { action: 'pivot', which, enabled: e.target.checked }).then((ok) => ok && reload())} />{label}
                </label>
              ))}
            </div>
          </Card>
        )}
      </>}

      {section === 'copy' && <>
        <ApprovalPanel d={d} doPath={doPath} onDone={reload} />
        <FieldGroup title="Review copy (what the client approves)" keys={['subject1', 'body1', 'subject2', 'thread2', 'body2', 'subject3', 'thread3', 'body3', 'subject4', 'thread4', 'body4']} d={d} path={path} onSaved={reload}
          note={<>Split tests: start each subject and copy block on its own line with <span className="font-mono">Variant 1</span>, <span className="font-mono">Variant 2</span> (or A, B). A thread reply uses the Email 1 subject.</>} />
      </>}

      {section === 'sequence' && <SequenceEditor d={d} path={path} doPath={doPath} onDone={reload} />}

      {section === 'settings' && <>
        <FieldGroup title="Sending days" keys={['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']} d={d} path={path} onSaved={reload} />
        <FieldGroup title="Schedule and limits" keys={['maxEmails', 'maxNewLeads', 'startTime', 'endTime', 'timezone', 'startDate', 'endDate', 'daysBetween', 'plainText']} d={d} path={path} onSaved={reload}
          note="Set before Build campaign. The engine sizes daily limits to the campaign's inboxes (a larger value is lowered)." />
        <FieldGroup title="Bounce safeguards" keys={['skipBounceNotification', 'skipBouncePause']} d={d} path={path} onSaved={reload} note="Watch over 2.5% bounce; the engine pauses over 4% at 35%+ progress unless Skip bounce pause is ticked." />
      </>}

      {section === 'senders' && <SenderPicker d={d} doPath={doPath} onDone={reload} />}

      {section === 'variants' && <Variants d={d} />}

      {section === 'more' && <>
        <TopUpList d={d} doPath={doPath} onDone={reload} />
        <Card className="p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold text-fg">More</h3>
          {(d.saved.processing || d.saved.message || d.saved.error) && (
            <div className="mt-2 rounded-xl bg-sunken px-3.5 py-2.5 text-sm text-fg-2">
              <div className="font-semibold text-fg">Saved automation status: {d.saved.processing || 'none'}</div>
              {d.saved.message && <div className="mt-1 whitespace-pre-wrap break-words">{d.saved.message}</div>}
              {d.saved.error && <div className="mt-1 whitespace-pre-wrap break-words text-bad">{d.saved.error}</div>}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <DoButton label="Clone" path={doPath} body={{ action: 'clone' }} disabled={ro} why="Only Alex can press this." onDone={reload}
              does="Creates a Draft copy of this campaign with the reusable build only (client, strategy, copy, sequence, schedule, bounce settings). Never the lead list, inboxes, EmailBison identity or results: link those before building." />
            <DoButton label="Clear saved status" path={doPath} body={{ action: 'clear-status' }} disabled={ro || d.locked || !(d.saved.processing || d.saved.message || d.saved.error)} why={d.locked ? 'A step is running.' : 'Nothing saved to clear.'} onDone={reload}
              does="Clears Processing Status, Workflow Message and Workflow Error on this campaign. Engine fields are not changed and nothing is stopped." />
            {/* Hidden until Alex decides (rule 2026-11-23: "Delete stays in n8n for now"). */}
            {DELETE_IN_HQ && <DoButton label="Delete" tone="danger" typed="DELETE" path={doPath} body={{ action: 'delete' }} disabled={ro || d.locked} why={d.locked ? 'A step is running.' : 'Only Alex can press this.'} onDone={() => go('campaigns')}
              does="Sends Delete to the Airtable automation (Bison Action = Delete): it deletes the EmailBison campaign first when there is one, then this Airtable record. This cannot be undone." />}
          </div>
        </Card>
      </>}
    </div>
  );
}

function LinkPicker({ current, options, disabled, onPick, empty }: { current: string; options: { id: string; label: string }[]; disabled: boolean; onPick: (id: string) => void; empty: string }) {
  const [pick, setPick] = useState(current);
  useEffect(() => setPick(current), [current]);
  if (!options.length) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      <select aria-label="Pick" value={pick} disabled={disabled} onChange={(e) => setPick(e.target.value)} className={cx(input, 'mt-0 min-w-0 flex-1')}>
        {!current && <option value="">Pick one…</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <Button tone="primary" disabled={disabled || !pick || pick === current} onClick={() => onPick(pick)}>{current ? 'Change' : 'Link'}</Button>
    </div>
  );
}

function ApprovalPanel({ d, doPath, onDone }: { d: CampaignFieldsP; doPath: string; onDone: () => void }) {
  const a = d.approval; const ro = !d.canAct;
  const head = a.byDulcy ? ['Approved by Dulcy', 'Client approval was not required (exception).', 'info'] : a.changes ? ['Changes requested', 'Make the revisions below, then send it for approval again.', 'warn'] : a.approved ? ['Client approved', 'Prepare the final sequence.', 'good'] : [a.decision || 'Waiting for the client', d.stage === 'Client Review' ? `In client review since ${slash(a.submittedAt)}${a.autoApproveAt ? `; auto-approves ${slashTime(a.autoApproveAt)}` : ''}.` : 'Not sent for approval yet.', 'plain'];
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-semibold text-fg">Approval</h3><Pill tone={head[2] as 'good' | 'warn' | 'info' | 'plain'}>{head[0]}</Pill>{d.stage && <Pill>{d.stage}</Pill>}</div>
      <p className="mt-1 text-sm text-fg-2">{head[1]}</p>
      {(a.changeArea || a.feedback) && <div className="mt-2 rounded-xl bg-sunken px-3.5 py-2.5 text-sm text-fg-2">{a.changeArea && <div><span className="font-semibold text-fg">Change area: </span>{a.changeArea}</div>}{a.feedback && <div className="mt-1 whitespace-pre-wrap">{a.feedback}</div>}</div>}
      {a.more.map((m) => <div key={m.label} className="mt-2 text-sm text-fg-2"><span className="font-semibold text-fg">{m.label}: </span>{m.text}</div>)}
      <div className="mt-3 flex flex-wrap gap-2">
        <DoButton label="Send for client approval" tone="primary" path={doPath} body={{ action: 'send-review' }} disabled={ro} why="Only Alex can press this." onDone={onDone}
          does="Moves the campaign to Client Review (the client approves it in the portal). It auto-approves after 48 weekday hours unless the client answers." />
        <DoButton label="Mark changes requested" path={doPath} body={{ action: 'changes-requested' }} disabled={ro || a.byDulcy} why="Only Alex can press this." onDone={onDone} does="Moves the campaign to Changes Requested (revision)." />
        <DoButton label="Approve + prepare sequence" tone="primary" path={doPath} body={{ action: 'approve-prepare' }} disabled={ro || !a.approved} why={a.approved ? '' : 'The client has not approved it yet.'} onDone={onDone}
          does="Copies the approved review copy into the sequence (Version 1 of each email), sets Workflow Stage to Approved and records Client approved. Next: Refresh from approved copy (variants) and Generate spintax in Sequence." />
        <DoButton label="Skip approval + prepare" path={doPath} body={{ action: 'approve-prepare', exception: true }} disabled={ro} why="Only Alex can press this." onDone={onDone}
          ack="Client approval is not required by this client's agreement." does="Only when the agreement does not need client approval: records Approved by Dulcy (exception) and prepares the sequence." />
      </div>
    </Card>
  );
}

function SequenceEditor({ d, path, doPath, onDone }: { d: CampaignFieldsP; path: string; doPath: string; onDone: () => void }) {
  const ro = !d.canAct;
  const filled = (st: number, v: number) => !!(d.values[`seq${st}v${v}s`] || d.values[`seq${st}v${v}b`]);
  const [extra, setExtra] = useState<Record<number, number>>({});
  return (
    <>
      <Card className="p-4 sm:p-5">
        <h3 className="text-[15px] font-semibold text-fg">Final sequence (what EmailBison gets)</h3>
        <p className="mt-1 text-sm text-muted">Refresh it from the approved review copy, then generate and validate the spintax (an Airtable automation). Campaign Status becomes Spintax Generated when done; Build campaign needs that.</p>
        {d.saved.spintax && <div className="mt-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">Spintax is being generated (status {d.status || 'unknown'}).</div>}
        <div className="mt-3 flex flex-wrap gap-2">
          <DoButton label="Refresh from approved copy" path={doPath} body={{ action: 'refresh-sequence' }} disabled={ro} why="Only Alex can press this." onDone={onDone}
            does="Reads the review copy's Variant 1 / Variant 2 labels and writes each variant into the sequence fields (and the variant counts). Variants above the detected ones stay unchanged." />
          <DoButton label="Generate spintax" tone="primary" path={doPath} body={{ action: 'spintax' }} disabled={ro} why="Only Alex can press this." onDone={onDone}
            does="Sends this final sequence to the spintax generation and validation automation (create_spintax + the automation request; Workflow Stage = Spintax in Progress). Uses AI credits in that automation." />
        </div>
      </Card>
      {[1, 2, 3, 4].map((st) => {
        const last = Math.max(1, ...Array.from({ length: 10 }, (_, i) => (filled(st, i + 1) ? i + 1 : 0)));
        const count = Math.min(10, Math.max(last, extra[st] ?? 0));
        const keys = Array.from({ length: count }, (_, i) => [`seq${st}v${i + 1}s`, `seq${st}v${i + 1}b`]).flat();
        return (
          <div key={st}>
            <FieldGroup title={`Email ${st}`} keys={[...(st > 1 ? [`thread${st}`] : []), ...keys]} d={d} path={path} onSaved={onDone} wide={keys.filter((k) => k.endsWith('s'))} />
            <div className="mt-1.5 flex flex-wrap gap-2 px-1">
              {count < 10 && d.canAct && <button onClick={() => setExtra((x) => ({ ...x, [st]: count + 1 }))} className="text-sm font-semibold text-accent-ink hover:underline">+ Add variant {st}{'ABCDEFGHIJ'[count]}</button>}
              {count > 1 && filled(st, count) && <DoButton label={`Delete variant ${st}${'ABCDEFGHIJ'[count - 1]}`} tone="danger" path={doPath} body={{ action: 'delete-variant', step: st, variant: count }} disabled={ro} why="Only Alex can press this." onDone={onDone} does="Clears this variant's saved subject and email copy." />}
            </div>
          </div>
        );
      })}
    </>
  );
}

function SenderPicker({ d, doPath, onDone }: { d: CampaignFieldsP; doPath: string; onDone: () => void }) {
  const [box, setBox] = useState<SendingBoxR2 | null>(null); const [error, setError] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set(d.accounts));
  useEffect(() => setSel(new Set(d.accounts)), [d.accounts]);
  useEffect(() => { if (!d.clientKey) return; api<SendingBoxR2>(`/campaigns/accounts?client=${encodeURIComponent(d.clientKey)}`).then(setBox).catch((e) => setError(e.message)); }, [d.clientKey]);
  const ro = !d.canAct || d.locked;
  const changed = useMemo(() => sel.size !== d.accounts.length || d.accounts.some((x) => !sel.has(x)), [sel, d.accounts]);
  if (!d.clientKey) return <Card className="p-4 text-sm text-muted">Link this campaign to a client first.</Card>;
  if (error) return <ErrorBox error={error} />;
  if (!box) return loadingBox;
  const free = box.accounts.filter((a) => a.bucket === 'available' && !sel.has(a.id));
  const toggle = (id: string) => setSel((x) => { const y = new Set(x); if (y.has(id)) y.delete(id); else y.add(id); return y; });
  const cap = box.accounts.filter((a) => sel.has(a.id)).reduce((t, a) => t + (a.dailyLimit ?? 0), 0);
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-fg">Pick sending inboxes</h3>
        <div className="flex flex-wrap gap-2">
          <Button disabled={ro || !free.length} onClick={() => setSel((x) => new Set([...x, ...free.map((a) => a.id)]))}>Select all free ({free.length})</Button>
          <Button disabled={ro || !sel.size} onClick={() => setSel(new Set())}>Unselect all</Button>
          <Button tone="primary" disabled={ro || !changed} onClick={() => send(doPath, { action: 'set-accounts', ids: [...sel] }).then((ok) => ok && onDone())}>Save {sel.size} inboxes</Button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">{sel.size} selected · {num(cap)} a day combined. An inbox busy in another campaign shows a warning only (you may build Monday for Tuesday). {d.built ? 'After saving, press Update senders so EmailBison matches.' : ''}</p>
      {d.locked && <div className="mt-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">A step is running: picking waits for its result.</div>}
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
        {box.accounts.map((a) => (
          <li key={a.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2 hover:bg-hover">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={sel.has(a.id)} disabled={ro} onChange={() => toggle(a.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-fg">{a.email}</span>
                <span className="block truncate text-xs text-muted">{[box.buckets.find((b) => b.key === a.bucket)?.label, a.dailyLimit !== null ? `${a.dailyLimit}/day` : '', a.campaigns.length ? `in ${a.campaigns.join(', ')}` : '', a.note].filter(Boolean).join(' · ')}</span>
              </span>
              {a.bucket !== 'available' && sel.has(a.id) && a.campaigns.length > 0 && <Pill tone="warn">busy</Pill>}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3"><SyncButton which="senders" /></div>
    </Card>
  );
}

function Variants({ d }: { d: CampaignFieldsP }) {
  const a = d.analytics;
  if (!a.rows.length) return <Card className="p-4 text-sm text-muted">No sequence analytics for this campaign yet (they come from the EmailBison sync once it sends).</Card>;
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="text-[15px] font-semibold text-fg">Sequence performance</h3>
      <p className="mt-1 text-sm text-muted">Variant quality = interested replies over replies. {a.leader && <>Leading: <span className="font-semibold text-fg">{a.leader}</span>.</>} Sample: 2,000+ sent ideal, 1,000+ okay.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead><tr className="text-xs uppercase tracking-wide text-muted">{['Step', 'Subject', 'Sent', 'Replies', 'Interested', 'Bounces', 'Sample'].map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {a.rows.map((r) => (
              <tr key={`${r.step}${r.variant}`} className={cx(`${r.step}${r.variant}` === a.leader && 'bg-good-soft')}>
                <td className="px-2 py-2 font-semibold">{r.step}{r.variant}</td><td className="max-w-[220px] truncate px-2 py-2">{r.subject}</td>
                <td className="tabular px-2 py-2">{num(r.sent)}</td><td className="tabular px-2 py-2">{num(r.replies)} · {r.replyRate}%</td>
                <td className="tabular px-2 py-2">{num(r.interested)} · {r.interestedRate}%</td><td className="tabular px-2 py-2">{num(r.bounces)} · {r.bounceRate}%</td><td className="px-2 py-2">{r.sample}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TopUpList({ d, doPath, onDone }: { d: CampaignFieldsP; doPath: string; onDone: () => void }) {
  const t = d.topup;
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="text-[15px] font-semibold text-fg">Top-up lead list</h3>
      <p className="mt-1 text-sm text-muted">Copies this campaign's targeting into a new list and excludes the contacts already in its lists. Build it in Lead lists, then press Top up (the engine button checks the top-up rule again).</p>
      {t.list && <div className="mt-2 text-sm text-fg-2">Linked: <button onClick={() => go(`campaigns/list/${t.list!.id}`)} className="font-semibold text-accent-ink hover:underline">{t.list.name}</button> · {t.list.stage || 'no stage'}{t.list.qa ? ` · QA ${t.list.qa}` : ''} · {num(t.list.leads)} leads</div>}
      {t.status && <div className="mt-1 text-sm text-fg-2">Last top-up: {t.status} · {num(t.added)} added · {num(t.skipped)} skipped · {num(t.failed)} failed{t.lastRun ? ` · ${slashTime(t.lastRun)}` : ''}{t.message ? ` · ${t.message}` : ''}</div>}
      <div className="mt-3">
        <DoButton label="Top up · Create lead list" tone="primary" path={doPath} body={{ action: 'create-topup' }} disabled={!d.canAct} why="Only Alex can press this." onDone={onDone}
          ack={t.ruleMet ? undefined : `This campaign has not met the top-up rule (interested ${t.interestedRate ?? 0}% of replies, the rule is 15%+). I want to proceed anyway.`}
          does="Creates the top-up lead list (Source & ICP, nothing runs or spends yet) and links it as this campaign's Top-up Lead List. An unfinished top-up for this campaign is reused instead." />
      </div>
    </Card>
  );
}

/** Sync with Bison (all campaigns) / Sync Bison Senders: the Campaign Center's two webhook buttons. */
export function SyncButton({ which }: { which: 'campaigns' | 'senders' }) {
  return <DoButton label={which === 'campaigns' ? 'Sync with EmailBison' : 'Sync EmailBison senders'} path="/campaigns/sync" body={{ which }} onDone={() => undefined}
    does={which === 'campaigns' ? 'Runs the full EmailBison campaign sync now (the same relay the Campaign Center calls). It updates every campaign record.' : 'Syncs sender assignments from EmailBison now (the n8n sender sync). It refreshes the inbox links of every active campaign.'} />;
}

/** New campaign by hand (the Campaign Center's "New Campaign" form). Atlas's planned New campaign stays as it is. */
export function NewCampaignByHand({ clients, client, onClose }: { clients: { key: string; name: string }[]; client: string; onClose: () => void }) {
  const [c, setC] = useState(client); const [title, setTitle] = useState(''); const [thesis, setThesis] = useState(''); const [mode, setMode] = useState<'new' | 'existing' | 'none'>('new');
  const [listTitle, setListTitle] = useState(''); const [listId, setListId] = useState(''); const [lists, setLists] = useState<{ id: string; name: string }[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!c) return; api<{ rows: { id: string; name: string }[] }>(`/campaigns/lists?client=${encodeURIComponent(c)}`).then((r) => setLists(r.rows)).catch(() => setLists([])); }, [c]);
  const name = clients.find((x) => x.key === c)?.name ?? '';
  return (
    <Sheet label="New campaign (by hand)" onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-fg">New campaign by hand</h2>
      <p className="mt-2 text-sm text-fg-2">Creates a Draft campaign (Strategy Draft) and, if you want, its lead list, as the Airtable Campaign Center does. Nothing runs or spends: Generate filters on the list is the next press.</p>
      <div className="mt-4 space-y-3">
        <label className="block"><span className={lab}>Client</span><select value={c} onChange={(e) => setC(e.target.value)} className={input}><option value="">Pick an active client…</option>{clients.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select></label>
        <label className="block"><span className={lab}>Campaign name</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={input} placeholder="Roofers Oklahoma" /><span className="mt-1 block text-xs text-muted">Saved as: [{name || 'Client'}] {title || '…'}</span></label>
        <label className="block"><span className={lab}>Initial targeting sentence</span><textarea rows={3} value={thesis} onChange={(e) => setThesis(e.target.value)} className={input} placeholder="US roofing companies, 11-50 employees, residential" /></label>
        <fieldset><legend className={lab}>Lead list</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">{([['new', 'New lead list'], ['existing', 'Existing lead list'], ['none', 'No lead list yet']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={cx('min-h-10 rounded-full border px-3.5 text-sm font-semibold', mode === k ? 'border-accent bg-accent-soft text-fg' : 'border-line bg-surface text-fg-2')}>{l}</button>))}</div>
        </fieldset>
        {mode === 'new' && <label className="block"><span className={lab}>Lead list name</span><input value={listTitle} onChange={(e) => setListTitle(e.target.value)} className={input} placeholder={title || 'Same as the campaign'} /></label>}
        {mode === 'existing' && <label className="block"><span className={lab}>Existing lead list</span><select value={listId} onChange={(e) => setListId(e.target.value)} className={input}><option value="">Pick one…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !c || !title.trim() || (mode === 'existing' && !listId)} onClick={async () => {
          setBusy(true);
          const ok = await send('/campaigns/new', { client: c, title, thesis, list: mode, listTitle, listId }, (r) => r.id && go(`campaigns/${r.id}/strategy`));
          setBusy(false); if (ok) onClose();
        }}>{busy ? 'Creating…' : 'Create campaign'}</Button>
      </div>
    </Sheet>
  );
}

// ===================== Lead List Center =====================
type ListTab = 'overview' | 'source' | 'companies' | 'contacts' | 'verification' | 'enrichment' | 'qa';
/** The Lead List Center's editable fields and its non-engine buttons, per tab. */
export function ListCenterSection({ id, tab, onDone }: { id: string; tab: ListTab; onDone: () => void }) {
  const { d, error, load } = useFields<ListFieldsP>(`/campaigns/lists/${encodeURIComponent(id)}/fields`);
  const reload = () => { load(); onDone(); };
  if (error) return <div className="mt-3"><ErrorBox error={error} retry={load} /></div>;
  if (!d) return loadingBox;
  const path = `/campaigns/lists/${id}/edit`; const doPath = `/campaigns/lists/${id}/do`;
  const ro = !d.canAct || d.locked;
  const why = d.locked ? 'A step is running on this list.' : 'Only Alex can press this.';
  return (
    <div className="mt-3 space-y-3">
      {tab === 'overview' && <>
        <FieldGroup title="List" keys={['name', 'sheet']} d={d} path={path} onSaved={reload} wide={['name', 'sheet']} />
        <Card className="p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold text-fg">Campaign</h3>
          <LinkPicker current={d.linked[0] ?? ''} options={d.campaigns.map((c) => ({ id: c.id, label: c.name }))} disabled={ro} onPick={(campaignId) => send(doPath, { action: 'link-campaign', campaignId }).then((ok) => ok && reload())} empty="No campaign of this client yet." />
          {d.bisonListId && <p className="mt-2 text-sm text-muted">EmailBison list {d.bisonListId}</p>}
          {(d.saved.processing || d.saved.message || d.saved.error) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-fg-2">Saved status: {d.saved.processing || 'none'}</span>
              <DoButton label="Clear saved status" path={doPath} body={{ action: 'clear-status' }} disabled={ro} why={why} onDone={reload} does="Clears Processing Status, Workflow Message and Workflow Error. It does not stop or change any engine job." />
            </div>
          )}
        </Card>
      </>}
      {tab === 'overview' && (d.esp.pre || d.esp.production) && (
        <Card className="p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold text-fg">Email provider breakdown</h3>
          <p className="mt-1 text-sm text-muted">Where these emails are hosted (Google, Outlook, gateways). Each uses its own saved list and date; the difference is not a verification pass rate.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {([['Before verification', d.esp.pre], ['Final (production)', d.esp.production]] as const).filter(([, e]) => e).map(([label, e]) => (
              <div key={label}>
                <div className="text-sm font-semibold text-fg">{label} · {num(e!.total)} emails <span className="font-normal text-muted">· {slash(e!.updatedAt)}</span></div>
                <ul className="mt-2 space-y-1.5">{e!.counts.map((r) => (
                  <li key={r.name} className="text-sm"><div className="flex justify-between gap-2"><span className="text-fg-2">{r.name}</span><span className="tabular font-medium text-fg">{num(r.count)} · {e!.total ? Math.round((r.count / e!.total) * 1000) / 10 : 0}%</span></div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent" style={{ width: `${e!.total ? Math.min(100, (r.count / e!.total) * 100) : 0}%` }} /></div></li>
                ))}</ul>
              </div>
            ))}
          </div>
        </Card>
      )}
      {tab === 'source' && <>
        <FieldGroup title="Targeting" keys={['icp', 'employeeRange']} d={d} path={path} onSaved={reload} note="Generate filters reads the targeting sentence; save it first." />
        {d.linked[0] && <div className="px-1"><DoButton label="Use campaign thesis as targeting sentence" path={doPath} body={{ action: 'use-thesis' }} disabled={ro} why={why} onDone={reload} does="Copies the linked campaign's thesis into the targeting sentence (replacing it). Review it, then Generate filters." /></div>}
        <FieldGroup title="DiscoLike search plan" keys={['filters']} d={d} path={path} onSaved={reload} note="The exact filters JSON Generate filters wrote (every key the Airtable editor sets: industries, countries, states, employee range, keywords, lookalikes, tech, social, language). Up to 20 homepage keywords each side." />
      </>}
      {tab === 'companies' && <>
        <FieldGroup title="Sample and target" keys={['sampleSize', 'target']} d={d} path={path} onSaved={reload} note="Usable company target = where Expand companies stops." />
        {(d.deepReview.results || d.deepReview.needsReview > 0) && <Card className="p-4 text-sm text-fg-2">Deep review: {d.deepReview.needsReview > 0 && <>{num(d.deepReview.needsReview)} companies need review. </>}{d.deepReview.results && <a href={d.deepReview.results} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-ink hover:underline">Open the DiscoGen results</a>}</Card>}
        <FieldGroup title="Optional deeper qualification (DiscoGen deep review)" keys={['useDeepReview', 'deepReviewPrompt', 'deepReviewExtra']} d={d} path={path} onSaved={reload} note="When ticked, the company deep review runs by itself after the sample and each expand (it spends DiscoGen credits). Saving starts nothing." />
      </>}
      {tab === 'contacts' && <FieldGroup title="Contacts" keys={['persona', 'contactSampleSize', 'contactFilters']} d={d} path={path} onSaved={reload} note="Persona = who to find (DiscoLike Contacts Run). People per company is results_by_company in the contact filters JSON; seniority, person_country and person_state live there too." />}
      {tab === 'verification' && <>
        <Card className="p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold text-fg">Verification route</h3>
          <p className="mt-1 text-sm text-muted">MillionVerifier checks every email first. Fixed once the list is verified.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(['generic', 'direct'] as const).map((k) => (
              <label key={k} className="flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-[15px]">
                <input type="checkbox" className="h-5 w-5" checked={d.route[k]} disabled={ro} onChange={(e) => send(doPath, { action: 'verify-route', generic: k === 'generic' ? e.target.checked : d.route.generic, direct: k === 'direct' ? e.target.checked : d.route.direct }).then((ok) => ok && reload())} />
                Include {k === 'generic' ? 'generic emails (info@, contact@…)' : 'direct contacts'}
              </label>
            ))}
            <label className="flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-[15px] sm:col-span-2">
              <input type="checkbox" className="h-5 w-5" checked={d.route.leadMagic} disabled={ro} onChange={(e) => send(doPath, { action: 'leadmagic', enabled: e.target.checked }).then((ok) => ok && reload())} />
              LeadMagic recovery for direct contacts that are not Good (spends LeadMagic credits on the next Verify)
            </label>
          </div>
        </Card>
        <FieldGroup title="Email security gateways" keys={['segRule', 'segProviders', 'genericFootprint']} d={d} path={path} onSaved={reload} note="Exclude Selected drops leads whose mail goes through the picked gateways (e.g. Proofpoint, Mimecast) at Verify." />
      </>}
      {tab === 'enrichment' && <FieldGroup title="Custom variables" keys={['customVars']} d={d} path={path} onSaved={reload} note="Write the request in plain English, then Prepare enrichment prompt; review the prompt here before Run enrichment." />}
      {tab === 'qa' && <ManualQa d={d} doPath={doPath} onDone={reload} />}
    </div>
  );
}

function ManualQa({ d, doPath, onDone }: { d: ListFieldsP; doPath: string; onDone: () => void }) {
  const [pick, setPick] = useState(d.qa.status);
  useEffect(() => setPick(d.qa.status), [d.qa.status]);
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="text-[15px] font-semibold text-fg">QA result</h3>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {([['Required fields present', d.qa.requiredFields], ['Duplicate check passed', d.qa.duplicateCheck], ['Final schema passed', d.qa.finalSchema], ['Duplicates', String(d.qa.duplicates)], ['Rows needing a fix', String(d.qa.rejected)]] as const).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-line py-1"><dt className="text-muted">{k}</dt><dd className="font-medium text-fg">{v || '–'}</dd></div>
        ))}
      </dl>
      {d.qa.summary && <p className="mt-2 whitespace-pre-wrap text-sm text-fg-2">{d.qa.summary}</p>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1"><span className={lab}>QA status (manual approval)</span>
          <select value={pick} disabled={!d.canAct} onChange={(e) => setPick(e.target.value)} className={input}><option value="">Not set</option>{['Not Checked', 'Passed', 'Needs Review', 'Failed'].map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <DoButton label="Save QA status" tone="primary" path={doPath} body={{ action: 'manual-qa', status: pick }} disabled={!d.canAct || (pick === d.qa.status && pick !== 'Passed')} why="Only Alex can press this." onDone={onDone}
          does={pick === 'Passed' ? 'Manual QA approval: the list must have reached QA and its workflow finished. Passed moves the list to Ready (an uploaded list stays Uploaded).' : 'Saves the QA status. Withdrawing approval moves a Ready list back to QA.'} />
      </div>
    </Card>
  );
}

/** New lead list (the Lead List Center's "New Lead List"). */
export function NewLeadList({ clients, client, onClose }: { clients: { key: string; name: string }[]; client: string; onClose: () => void }) {
  const [c, setC] = useState(client); const [name, setName] = useState(''); const [icp, setIcp] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <Sheet label="New lead list" onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-fg">New lead list</h2>
      <p className="mt-2 text-sm text-fg-2">A Draft DiscoLike list that runs on the engine (sample 100, usable company target 1,000). Nothing runs or spends until you press Generate filters.</p>
      <div className="mt-4 space-y-3">
        <label className="block"><span className={lab}>Client</span><select value={c} onChange={(e) => setC(e.target.value)} className={input}><option value="">No client yet</option>{clients.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select></label>
        <label className="block"><span className={lab}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Dentists Florida" /></label>
        <label className="block"><span className={lab}>Targeting sentence</span><textarea rows={3} value={icp} onChange={(e) => setIcp(e.target.value)} className={input} placeholder="Florida dental practices, 1-50 employees" /></label>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !name.trim()} onClick={async () => { setBusy(true); const ok = await send('/campaigns/lists/new', { name, client: c, icp }, (r) => r.id && go(`campaigns/list/${r.id}`)); setBusy(false); if (ok) onClose(); }}>{busy ? 'Creating…' : 'Create lead list'}</Button>
      </div>
    </Sheet>
  );
}
