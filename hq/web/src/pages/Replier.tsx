// Client hub → AI replier: the client's Reply Agent settings (what Echo follows), in plain words.
// The owner edits; members read. Save sends only what changed; the server checks and logs it.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, CALENDAR_PROVIDERS, type CalendarProvider, type ReplierChange, type ReplierDetail, type ReplierValues } from '../api';
import { Button, Card, cx, ErrorBox, Icon, Label, PageSkeleton, Pill, SectionHeader, timeAgo } from '../ui';
import { NoteList } from './Inbox';

const HANDOFF: Record<string, string> = { Disabled: 'Dulcy replies (client stays out)', 'After First Agent Reply': 'Client takes over after our first reply', 'All Replies': 'Client answers all its replies' };
const MODE: Record<string, string> = { 'Approval Required': 'Every draft waits for an OK', 'Auto High Confidence': 'Sends by itself when confident enough', Autopilot: 'Sends by itself' };
const OOO: Record<string, string> = { 'Approval Required': 'Wait for an OK', 'Auto Send': 'Send by itself' };
const TZS = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Toronto', 'Europe/London', 'Europe/Dublin', 'Europe/Berlin', 'Australia/Sydney', 'UTC'];
const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const isTz = (tz: string) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz); } catch { return false; } };
const isUrl = (u: string) => !u || /^https?:\/\/\S+$/.test(u);
const show = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join(', ') : 'none') : typeof v === 'boolean' ? (v ? 'on' : 'off') : v === '' || v === null || v === undefined ? 'empty' : String(v));

/** First problem with the values, in plain words ('' = fine). Mirrors the server's checks. */
function problem(v: ReplierValues): string {
  if (!isTime(v.officeStart) || !isTime(v.officeEnd)) return 'Office hours need a time like 09:00.';
  if (v.officeStart >= v.officeEnd) return 'Office end must be after office start.';
  if (!isTz(v.timezone)) return 'Timezone must be an IANA name like America/New_York.';
  if (!(v.minConfidence >= 0 && v.minConfidence <= 100)) return 'Minimum confidence is a percent from 0 to 100.';
  if (!Number.isInteger(v.maxAuto) || v.maxAuto < 0 || v.maxAuto > 20) return 'Max automatic replies is a whole number from 0 to 20.';
  if (!isUrl(v.companyUrl) || !isUrl(v.calendarLink)) return 'Links must start with https://';
  return '';
}

export default function ReplierPanel({ clientId }: { clientId: string }) {
  const [d, setD] = useState<ReplierDetail | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<ReplierDetail>(`/clients/${encodeURIComponent(clientId)}/replier`).then(setD).catch((e) => setError(e.message)); }, [clientId]);
  useEffect(load, [load]);
  if (error && !d) return <ErrorBox error={error} retry={load} />;
  if (!d) return <PageSkeleton kind="list" />;
  return <ReplierForm key={`${d.rowId}:${d.lastUpdated}:${d.history.length}`} d={d} reload={load} />;
}

function ReplierForm({ d, reload }: { d: ReplierDetail; reload: () => void }) {
  const base = d.values;
  const [v, setV] = useState<ReplierValues | null>(base);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<ReplierChange[] | null>(null);
  const ro = !d.canEdit;
  const dirty = useMemo(() => (v && base ? (Object.keys(v) as (keyof ReplierValues)[]).filter((k) => JSON.stringify(v[k]) !== JSON.stringify(base[k])) : []), [v, base]);
  const bad = v ? problem(v) : '';
  const set = <K extends keyof ReplierValues>(k: K, x: ReplierValues[K]) => { setV((o) => (o ? { ...o, [k]: x } : o)); setSaved(null); };

  const save = async () => {
    if (!v || !dirty.length || bad) return;
    setBusy(true); setError('');
    try {
      const r = await api<{ changes: ReplierChange[] }>(`/clients/${encodeURIComponent(d.client.id)}/replier`, { body: { values: Object.fromEntries(dirty.map((k) => [k, v[k]])) } });
      setSaved(r.changes); reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div>
      <NoteList notes={d.notes} />
      {ro && d.found && <div className="mt-3 flex items-center gap-2 rounded-xl bg-sunken px-4 py-3 text-sm text-fg-2"><Icon name="lock" size={15} className="text-muted" />Read only: only the owner changes these settings.</div>}
      {saved && <div role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-good-soft px-4 py-3 text-sm font-medium text-good"><Icon name="check" size={15} />{saved.length ? `Saved ${saved.length} change${saved.length === 1 ? '' : 's'}. Echo uses them from the next draft.` : 'Nothing changed.'}</div>}
      {!d.found || !v ? null : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Group title="Sending mode" icon="send">
            <Toggle label="AI replier on" help="Off: Echo drafts nothing for this client." on={v.enabled} set={(x) => set('enabled', x)} ro={ro} />
            <Select label="Who replies" help="Who answers this client's prospects." value={v.handoff} options={d.options.handoff} names={HANDOFF} set={(x) => set('handoff', x)} ro={ro} />
            <Select label="Send mode" help="Approval Required is the safe default." value={v.defaultMode} options={d.options.defaultMode} names={MODE} set={(x) => set('defaultMode', x)} ro={ro} />
            <div className="grid grid-cols-2 gap-3">
              <Num label="Min. confidence %" help="For “sends when confident”." value={v.minConfidence} min={0} max={100} step={0.5} set={(x) => set('minConfidence', x)} ro={ro} />
              <Num label="Max auto replies" help="Per thread, then a person." value={v.maxAuto} min={0} max={20} step={1} set={(x) => set('maxAuto', x)} ro={ro} />
            </div>
            <Select label="Out-of-office replies" help="Whether OOO answers wait for an OK." value={v.oooMode} options={d.options.oooMode} names={OOO} set={(x) => set('oooMode', x)} ro={ro} />
          </Group>

          <Group title="Reply types" icon="layers">
            <Checks label="Answer these types" help="Only ticked types get a draft. None ticked = every type." all={d.options.replyTypes} value={v.replyTypes} set={(x) => set('replyTypes', x)} ro={ro} />
            <Checks label="Always need a person" help="These wait for an OK whatever the send mode." all={d.options.replyTypes} value={v.alwaysReview} set={(x) => set('alwaysReview', x)} ro={ro} />
            <Toggle label="Courtesy reply to “not interested”" help="One short, polite answer; off = no reply." on={v.nudge} set={(x) => set('nudge', x)} ro={ro} />
            <ReadOnly label="Routing groups (read only)" lines={d.summaries?.routing ?? []} />
          </Group>

          <Group title="Voice" icon="pen">
            <div className="grid grid-cols-2 gap-3">
              <Select label="Tone" value={v.tone} options={['', ...d.options.tone]} names={{ '': 'Not set' }} set={(x) => set('tone', x)} ro={ro} />
              <Select label="Length" value={v.length} options={['', ...d.options.length]} names={{ '': 'Not set', 'Very Brief': 'Very brief (1-2 lines)', Brief: 'Brief (< 60 words)', Standard: 'Standard (< 120 words)' }} set={(x) => set('length', x)} ro={ro} />
              <Text label="Writes as: first name" value={v.firstName} max={60} set={(x) => set('firstName', x)} ro={ro} />
              <Text label="Last name" value={v.lastName} max={60} set={(x) => set('lastName', x)} ro={ro} />
              <Text label="Company name" value={v.companyName} max={120} set={(x) => set('companyName', x)} ro={ro} />
              <Text label="Company website" value={v.companyUrl} max={300} type="url" set={(x) => set('companyUrl', x)} ro={ro} />
            </div>
            <Area label="Inbox manager instructions" help="Your own instructions for this client. Echo follows them over the general style." value={v.context} max={10000} set={(x) => set('context', x)} ro={ro} />
            {d.summaries && <ReadOnly label="Also used (read only)" lines={[d.summaries.goal ? `Goal: ${d.summaries.goal}` : 'Goal: not set', `Templates: ${d.summaries.templates.length ? d.summaries.templates.join(', ') : 'none'}`, `Approved links to share: ${d.summaries.assets}`]} />}
          </Group>

          <Group title="Hours" icon="clock">
            <Text label="Timezone" help="IANA name, e.g. America/New_York." value={v.timezone} max={60} list="hq-tz" set={(x) => set('timezone', x)} ro={ro} />
            <datalist id="hq-tz">{TZS.map((z) => <option key={z} value={z} />)}</datalist>
            <div className="grid grid-cols-2 gap-3">
              <Text label="Office start" value={v.officeStart} max={5} type="time" set={(x) => set('officeStart', x)} ro={ro} />
              <Text label="Office end" value={v.officeEnd} max={5} type="time" set={(x) => set('officeEnd', x)} ro={ro} />
            </div>
            <Toggle label="Skip weekends" help="Automatic sends wait for Monday." on={v.noWeekends} set={(x) => set('noWeekends', x)} ro={ro} />
            <Toggle label="Skip US holidays" on={v.noHolidays} set={(x) => set('noHolidays', x)} ro={ro} />
            <p className="text-xs text-muted">Only automatic sends wait for office hours. Replies you approve go out at once.</p>
          </Group>

          <Group title="Follow-ups" icon="history">
            {d.summaries && <ReadOnly label="Plan (read only)" lines={[d.summaries.plan, d.summaries.copies]} />}
            <Area label="Follow-up instructions" help="What Echo should do in follow-ups for this client." value={v.followupInstructions} max={4000} set={(x) => set('followupInstructions', x)} ro={ro} />
          </Group>

          <CalendarGroup d={d} v={v} set={(x) => set('calendarLink', x)} ro={ro} />
        </div>
      )}

      {error && <div className="mt-4"><ErrorBox error={error} /></div>}
      {!ro && dirty.length > 0 && (
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-4 bg-bg/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:bottom-0 md:mx-0 md:rounded-2xl md:px-0">
          {bad && <div className="mb-2 text-sm font-medium text-bad">{bad}</div>}
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-fg-2"><span className="font-semibold">{dirty.length} change{dirty.length === 1 ? '' : 's'}</span> · not saved</span>
            <Button onClick={() => { setV(base); setError(''); }} icon="undo">Undo</Button>
            <Button tone="accent" disabled={busy || !!bad} onClick={() => void save()} icon="check">{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      )}

      <section className="mt-6">
        <SectionHeader title="Changes" icon="activity" right={<span className="text-xs text-muted">who · when · what</span>} />
        <Card className="p-0">
          {d.history.length ? (
            <ul className="divide-y divide-line">
              {d.history.map((h, i) => (
                <li key={i} className="px-5 py-3 text-sm">
                  <div className="text-xs text-muted"><span className="font-semibold text-fg-2">{h.by}</span> · {timeAgo(h.at)} · {h.action === 'save' ? 'saved' : 'asked for a calendar link'}</div>
                  {Array.isArray(h.changes)
                    ? <ul className="mt-1 space-y-0.5">{h.changes.map((c) => <li key={c.field} className="break-words text-fg-2"><span className="font-medium text-fg">{c.field}</span>: {show(c.from)} → {show(c.to)}</li>)}</ul>
                    : <div className="mt-1 text-fg-2">{h.changes.provider} · {h.changes.email}</div>}
                </li>
              ))}
            </ul>
          ) : <div className="px-5 py-4 text-sm text-muted">No changes from HQ yet.{d.lastUpdated ? ` Last updated in Airtable ${timeAgo(d.lastUpdated)}.` : ''}</div>}
        </Card>
      </section>
      {d.found && <p className="mt-4 text-xs text-muted">Airtable: Dulcy Reply Agent Settings · {d.workspaceName || d.workspaceRecordId}</p>}
    </div>
  );
}

function CalendarGroup({ d, v, set, ro }: { d: ReplierDetail; v: ReplierValues; set: (x: string) => void; ro: boolean }) {
  const c = d.summaries?.calendar;
  const [provider, setProvider] = useState(d.invite.provider);
  const [email, setEmail] = useState(d.invite.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<{ url: string; expiresAt: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const connected = c?.status === 'Connected' || c?.jsonStatus === 'connected';
  const ask = async () => {
    setBusy(true); setError('');
    try { setLink(await api<{ url: string; expiresAt: string; email: string }>(`/clients/${encodeURIComponent(d.client.id)}/calendar-invite`, { body: { provider, email } })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const mail = link ? `mailto:${encodeURIComponent(link.email)}?subject=${encodeURIComponent('Connect your calendar')}&body=${encodeURIComponent(`Hi,\n\nConnect your calendar so we can offer your prospects two real times: ${link.url}\n\nIt reads your free times and books only the meetings your prospects agree to; it never changes other events. The link works once and expires ${new Date(link.expiresAt).toLocaleDateString()}.\n\nAlex`)}` : '';
  return (
    <Group title="Calendar" icon="clock">
      {c && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Pill tone={connected ? 'good' : 'warn'} icon={connected ? 'check' : 'alert'}>{connected ? 'Connected' : 'Not connected'}</Pill>
          {!['Not Connected', 'Not set'].includes(c.provider) && <Pill>{c.provider}</Pill>}
          <Pill tone={c.timesOff ? 'warn' : 'good'}>{c.timesOff ? 'Times off' : 'Offers two times'}</Pill>
          {c.linksOff && <Pill>Links off</Pill>}
        </div>
      )}
      <Text label="Booking link (last resort)" help="Echo uses it only when no open time can be read, or the prospect asks for a link." value={v.calendarLink} max={500} type="url" set={set} ro={ro} />
      <div className="rounded-xl border border-line bg-sunken p-3.5">
        <Label>Connect the client's calendar</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr]">
          <select aria-label="Calendar provider" value={provider} onChange={(e) => setProvider(e.target.value as CalendarProvider)} disabled={!d.invite.ready}
            className="min-h-11 rounded-xl border border-line bg-surface px-3 text-[15px] text-fg disabled:opacity-60">
            {CALENDAR_PROVIDERS.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          <input aria-label="Client's calendar email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@company.com" disabled={!d.invite.ready} maxLength={200}
            className="min-h-11 min-w-0 rounded-xl border border-line bg-surface px-3 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent disabled:opacity-60" />
        </div>
        <Button tone="primary" className="mt-2 w-full sm:w-auto" icon="link" disabled={!d.invite.ready || busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)} onClick={() => void ask()}>{busy ? 'Asking…' : 'Get calendar link'}</Button>
        {!d.invite.ready && <p className="mt-2 text-xs text-muted">{d.invite.why}</p>}
        {c?.lastRequest && !link && <p className="mt-2 text-xs text-muted">Last asked for {c.lastRequest.email} ({CALENDAR_PROVIDERS.find(([k]) => k === c.lastRequest?.provider)?.[1] ?? c.lastRequest.provider}){c.lastRequest.at ? ` ${timeAgo(c.lastRequest.at)}` : ''}{c.lastResult?.expiresAt ? `; link ${Date.parse(c.lastResult.expiresAt) < Date.now() ? 'expired' : 'valid until'} ${new Date(c.lastResult.expiresAt).toLocaleDateString()}` : ''}.</p>}
        {error && <div className="mt-2"><ErrorBox error={error} /></div>}
        {link && (
          <div className="mt-3 space-y-2">
            <div className="break-all rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-fg">{link.url}</div>
            <div className="flex flex-wrap gap-2">
              <Button icon={copied ? 'check' : 'file'} onClick={() => { void navigator.clipboard?.writeText(link.url).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? 'Copied' : 'Copy'}</Button>
              <a href={mail} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg hover:bg-hover"><Icon name="send" size={17} />Email to client</a>
            </div>
            <p className="text-xs text-muted">One-time link for {link.email}, expires {new Date(link.expiresAt).toLocaleString()}. HQ never sends the email: it opens in your mail app.</p>
          </div>
        )}
      </div>
      {c && !connected && <p className="text-xs text-muted">Status from Airtable: {c.status}{c.jsonStatus ? ` (${c.jsonStatus})` : ''}.</p>}
    </Group>
  );
}

// ---------- Small form parts ----------
function Group({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <SectionHeader title={title} icon={icon} />
      <Card className="space-y-4">{children}</Card>
    </section>
  );
}
function Field({ label, help, children, htmlFor }: { label: string; help?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-fg">{label}</label>
      {help && <div className="mt-0.5 text-xs text-muted">{help}</div>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
const inputCls = 'min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-[15px] text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft disabled:bg-sunken disabled:text-fg-2';
let uid = 0;
const useId = () => useState(() => `rf${++uid}`)[0];
function Text({ label, help, value, set, ro, max, type = 'text', list }: { label: string; help?: string; value: string; set: (x: string) => void; ro: boolean; max: number; type?: string; list?: string }) {
  const id = useId();
  return <Field label={label} help={help} htmlFor={id}><input id={id} type={type} list={list} value={value} maxLength={max} disabled={ro} onChange={(e) => set(e.target.value)} className={inputCls} /></Field>;
}
function Area({ label, help, value, set, ro, max }: { label: string; help?: string; value: string; set: (x: string) => void; ro: boolean; max: number }) {
  const id = useId();
  return (
    <Field label={label} help={help} htmlFor={id}>
      <textarea id={id} value={value} maxLength={max} disabled={ro} onChange={(e) => set(e.target.value)} rows={Math.min(12, Math.max(4, value.split('\n').length + 1))} className={cx(inputCls, 'resize-y py-2.5 leading-relaxed')} />
      <div className="mt-1 text-right text-[11px] text-faint tabular">{value.length.toLocaleString()} / {max.toLocaleString()}</div>
    </Field>
  );
}
function Num({ label, help, value, set, ro, min, max, step }: { label: string; help?: string; value: number; set: (x: number) => void; ro: boolean; min: number; max: number; step: number }) {
  const id = useId();
  return <Field label={label} help={help} htmlFor={id}><input id={id} type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} disabled={ro} onChange={(e) => set(e.target.value === '' ? NaN : Number(e.target.value))} className={cx(inputCls, 'tabular')} /></Field>;
}
function Select({ label, help, value, options, names, set, ro }: { label: string; help?: string; value: string; options: string[]; names?: Record<string, string>; set: (x: string) => void; ro: boolean }) {
  const id = useId();
  return (
    <Field label={label} help={help} htmlFor={id}>
      <select id={id} value={value} disabled={ro} onChange={(e) => set(e.target.value)} className={inputCls}>
        {options.map((o) => <option key={o} value={o}>{names?.[o] ?? o}</option>)}
      </select>
    </Field>
  );
}
function Toggle({ label, help, on, set, ro }: { label: string; help?: string; on: boolean; set: (x: boolean) => void; ro: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={ro} onClick={() => set(!on)} className="flex w-full items-start gap-3 rounded-xl text-left disabled:cursor-default">
      <span aria-hidden="true" className={cx('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition', on ? 'bg-accent' : 'bg-line-strong', ro && 'opacity-60')}><span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} /></span>
      <span className="min-w-0"><span className="block text-sm font-semibold text-fg">{label}</span>{help && <span className="block text-xs text-muted">{help}</span>}</span>
    </button>
  );
}
function Checks({ label, help, all, value, set, ro }: { label: string; help?: string; all: string[]; value: string[]; set: (x: string[]) => void; ro: boolean }) {
  return (
    <Field label={label} help={help}>
      <div className="flex flex-wrap gap-1.5">
        {all.map((t) => {
          const on = value.includes(t);
          return <button key={t} type="button" aria-pressed={on} disabled={ro} onClick={() => set(on ? value.filter((x) => x !== t) : [...value, t])}
            className={cx('inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm font-medium transition disabled:cursor-default', on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-fg-2 hover:bg-hover', ro && 'opacity-80')}>{on && <Icon name="check" size={13} strokeWidth={2.4} />}{t}</button>;
        })}
      </div>
    </Field>
  );
}
function ReadOnly({ label, lines }: { label: string; lines: string[] }) {
  if (!lines.length) return null;
  return <div className="rounded-xl bg-sunken px-3.5 py-3"><Label>{label}</Label><ul className="mt-1.5 space-y-1 text-sm text-fg-2">{lines.map((l) => <li key={l} className="break-words">{l}</li>)}</ul></div>;
}
