// Sales → Draft contract (Batch 4a). Pick the deal type, amounts and start date; "Save draft" keeps it in
// HQ; "Create draft in Dulcy Sign" makes ONE Contracts row that Dulcy Sign turns into a DRAFT. Nothing is
// ever sent from here: Alex reviews it in Dulcy Sign, approves it and sends it there.
// Round 5 (Alex 2026-11-28): Retainer or Pay per call (no "Both": pay per call has the monthly tech fee).
// "Pull from Close" fills the client's details (read only; shows what was filled and what is missing).
// Service, term and scope are choices from the templates: no typing for a normal contract. The checkbox
// "Client responds to leads" adds that clause to the agreement. Leaving goes UP (sales/nav.ts), never back.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type SalesClosePull, type SalesContractDraft, type SalesContractForm, type SalesDealType, type SalesSavedDraft } from '../api';
import { BackLink, Button, Card, cx, ErrorBox, ExtLink, Icon, PageSkeleton, Pill, SectionHeader, timeAgo } from '../ui';
import { goUp } from './sales/nav';

const inputCls = 'min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-[15px] text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft';
const same = (a: SalesContractDraft, b: SalesContractDraft) => JSON.stringify(a) === JSON.stringify(b);

export default function SalesContract({ id }: { id: string }) {
  const [form, setForm] = useState<SalesContractForm | null>(null);
  const [x, setX] = useState<SalesContractDraft | null>(null);
  const [saved, setSaved] = useState<SalesSavedDraft | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pull, setPull] = useState<SalesClosePull | null>(null);
  const [pulling, setPulling] = useState(false);
  const load = useCallback(() => {
    setError('');
    api<SalesContractForm>(`/sales/${encodeURIComponent(id)}/contract`).then((f) => { setForm(f); setX(f.draft); setSaved(f.saved); }).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);
  // Back to the deal replaces this page in the history, so Back / "Sales" can never return here in a loop.
  const toDeal = () => goUp(`sales/${id}/contract`, { replace: true });
  const back = <BackLink label="Deal" onClick={toDeal} />;
  if (error) return <>{back}<ErrorBox error={error} retry={load} /></>;
  if (!form || !x) return <>{back}<PageSkeleton kind="list" /></>;
  const set = (patch: Partial<SalesContractDraft>) => { setX((cur) => (cur ? { ...cur, ...patch } : cur)); setMsg(null); };
  const created = saved?.status === 'created';
  const unsaved = !saved || !same(saved.input, x);
  const ro = created;
  const o = form.options;
  const scopeFor = (t: SalesDealType) => o.scope.filter((s) => s.type === t);
  const termFor = (t: SalesDealType) => o.terms.find((s) => s.type === t)?.key ?? '';
  const pickType = (t: SalesDealType) => {
    if (t === x.dealType) return;
    // The other template's scope and term: reset to its standard (an old draft's own text is kept until a choice is made).
    set({ dealType: t, ...(t === 'retainer' ? { perCall: null } : {}), scopeKeys: scopeFor(t).map((s) => s.key), scope: '', ...(x.termKey ? { termKey: termFor(t), term: '' } : {}) });
  };
  const save = () => {
    setBusy(true); setMsg(null);
    api<{ saved: SalesSavedDraft; missing: string[] }>(`/sales/${encodeURIComponent(id)}/contract`, { body: x })
      .then((r) => { setSaved(r.saved); setX(r.saved.input); setForm({ ...form, missing: r.missing }); setMsg({ tone: 'good', text: 'Draft saved in HQ. Nothing was sent.' }); })
      .catch((e) => setMsg({ tone: 'bad', text: e.message })).finally(() => setBusy(false));
  };
  const create = () => {
    if (!saved || !window.confirm('Create this draft in Dulcy Sign? It is NOT sent: you review it there, approve it and send it yourself.')) return;
    setBusy(true); setMsg(null);
    api<{ saved: SalesSavedDraft; message: string }>(`/sales/${encodeURIComponent(id)}/contract/create`, { body: { draftId: saved.id } })
      .then((r) => { setSaved(r.saved); setMsg({ tone: 'good', text: r.message }); })
      .catch((e) => setMsg({ tone: 'bad', text: e.message })).finally(() => setBusy(false));
  };
  const pullClose = () => {
    setPulling(true); setPull(null);
    api<SalesClosePull>(`/sales/${encodeURIComponent(id)}/contract/close?type=${x.dealType}`)
      .then((r) => { setPull(r); if (r.found && r.patch) set(r.patch); })
      .catch((e) => setPull({ connected: true, found: false, error: e.message })).finally(() => setPulling(false));
  };
  const feeLabel = x.dealType === 'retainer' ? 'Monthly fee' : 'Monthly tech fee';
  const legacyService = !x.serviceKey && x.service, legacyTerm = !x.termKey && x.term, legacyScope = !x.scopeKeys.length && x.scope;
  return (
    <div>
      {back}
      <Card className="sm:p-7">
        <div className="text-xs font-medium text-muted">Draft contract · Dulcy Sign</div>
        <h1 className="mt-1 break-words text-[24px] font-bold leading-tight tracking-tight">{form.deal.name || form.deal.company}</h1>
        <div className="mt-1 break-words text-[15px] text-fg-2">{[form.deal.company.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''), form.deal.email].filter(Boolean).join(' · ')}</div>
        <div className="mt-3 rounded-xl bg-info-soft px-3.5 py-3 text-sm leading-snug text-fg-2">
          <span className="font-semibold text-fg">Never sent from here.</span> HQ makes a draft in Dulcy Sign. You review it there, set it to "Approved to send" and press Issue invitation yourself.
        </div>
        {form.deal.agreement && <div className="mt-3 text-sm text-muted">Current agreement on this deal: {form.deal.agreement.title} ({form.deal.agreement.state}).</div>}
        {saved && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><Pill tone={created ? 'good' : saved.status === 'failed' ? 'bad' : 'info'}>{created ? 'In Dulcy Sign (draft)' : saved.status === 'failed' ? 'Failed' : saved.status === 'creating' ? 'Creating…' : 'Saved in HQ'}</Pill><span className="text-muted">{saved.by} · {timeAgo(saved.updated) || 'just now'}</span>{saved.error && <span className="text-bad">{saved.error}</span>}</div>}
      </Card>

      <section className="mt-6">
        <SectionHeader title="Deal type" icon="layers" />
        <div role="radiogroup" aria-label="Deal type" className="grid gap-2 sm:grid-cols-2">
          {form.types.map((t) => (
            <button key={t.key} role="radio" aria-checked={x.dealType === t.key} disabled={ro} onClick={() => pickType(t.key)}
              className={cx('min-h-14 rounded-2xl border px-4 py-3 text-left text-[15px] font-semibold transition disabled:opacity-60', x.dealType === t.key ? 'border-accent bg-accent-soft text-fg ring-2 ring-accent' : 'border-line bg-surface text-fg-2 hover:bg-hover')}>
              {t.label}
              <span className="mt-0.5 block text-xs font-normal text-muted">{t.sub}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <SectionHeader title="Money and start" icon="dollar" />
        <Card className="grid gap-4 sm:grid-cols-2">
          <Money label={feeLabel} help={x.dealType === 'retainer' ? 'Billed monthly, USD' : 'Monthly, covers running the system (USD)'} value={x.monthly} set={(v) => set({ monthly: v })} ro={ro} />
          {x.dealType === 'per_call' && <Money label="Per qualified call" help="USD per call" value={x.perCall} set={(v) => set({ perCall: v })} ro={ro} />}
          <Money label="Initial fee" help="Optional, one time" value={x.initialFee} set={(v) => set({ initialFee: v })} ro={ro} />
          <Field label="Start date"><input type="date" value={x.startDate} disabled={ro} onChange={(e) => set({ startDate: e.target.value })} className={inputCls} /></Field>
        </Card>
      </section>

      <section className="mt-6">
        <SectionHeader title="Client" icon="briefcase" right={!ro && (
          <button type="button" onClick={pullClose} disabled={pulling || !form.closeConnected} title={form.closeConnected ? 'Fill the client details from Close (read only)' : 'Close is not connected on the server'}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-fg-2 transition hover:bg-hover disabled:opacity-50">
            <Icon name="refresh" size={13} strokeWidth={2.1} />{pulling ? 'Pulling…' : 'Pull from Close'}
          </button>
        )} />
        {pull && <PullResult r={pull} />}
        <Card className="grid gap-4 sm:grid-cols-2">
          <Text label="Signer name" value={x.signerName} set={(v) => set({ signerName: v })} ro={ro} max={120} />
          <Text label="Signer email" type="email" value={x.signerEmail} set={(v) => set({ signerEmail: v })} ro={ro} max={200} />
          <Text label="Company / brand" value={x.company} set={(v) => set({ company: v })} ro={ro} max={200} />
          <Text label="Legal name" help="As on the contract" value={x.legalName} set={(v) => set({ legalName: v })} ro={ro} max={200} />
          <Text label="Phone" type="tel" value={x.signerPhone} set={(v) => set({ signerPhone: v })} ro={ro} max={40} />
          <Text label="Address" value={x.address} set={(v) => set({ address: v })} ro={ro} max={500} />
        </Card>
      </section>

      <section className="mt-6">
        <SectionHeader title="Service, term and scope" icon="file" />
        <Card className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Service">
              <select value={x.serviceKey} disabled={ro} onChange={(e) => set({ serviceKey: e.target.value, ...(e.target.value ? { service: '' } : {}) })} className={inputCls}>
                {legacyService && <option value="">Saved earlier: {x.service.slice(0, 60)}</option>}
                {!x.serviceKey && !legacyService && <option value="">Pick a service</option>}
                {o.services.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Term">
              <select value={x.termKey} disabled={ro} onChange={(e) => set({ termKey: e.target.value, ...(e.target.value ? { term: '' } : {}) })} className={inputCls}>
                {legacyTerm && <option value="">Saved earlier: {x.term.slice(0, 60)}</option>}
                {!x.termKey && !legacyTerm && <option value="">Pick a term</option>}
                {o.terms.map((t) => <option key={t.key} value={t.key}>{t.label}{t.type !== x.dealType ? ` (${t.type === 'retainer' ? 'retainer' : 'pay per call'} wording)` : ''}</option>)}
              </select>
            </Field>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold text-fg">Scope <span className="font-normal text-muted">· from the {x.dealType === 'retainer' ? 'retainer' : 'pay per call'} template</span></legend>
            {legacyScope ? (
              <div className="mt-1.5 rounded-xl border border-line bg-sunken px-3 py-2.5 text-sm text-fg-2">
                <div className="whitespace-pre-line">Saved earlier: {x.scope}</div>
                {!ro && <button type="button" onClick={() => set({ scopeKeys: scopeFor(x.dealType).map((s) => s.key), scope: '' })} className="mt-1.5 font-semibold text-accent-ink hover:underline">Use the checkboxes instead</button>}
              </div>
            ) : (
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {scopeFor(x.dealType).map((s) => (
                  <Check key={s.key} label={s.label} checked={x.scopeKeys.includes(s.key)} ro={ro}
                    set={(on) => set({ scope: '', scopeKeys: scopeFor(x.dealType).map((i) => i.key).filter((k) => (k === s.key ? on : x.scopeKeys.includes(k))) })} />
                ))}
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold text-fg">Extra channels</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {([['linkedin', 'LinkedIn'], ['aiCaller', 'AI / cold caller'], ['directMail', 'Direct mail']] as const).map(([k, label]) => (
                <Check key={k} label={label} checked={x.channels[k]} ro={ro} set={(on) => set({ channels: { ...x.channels, [k]: on } })} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold text-fg">Agreement lines</legend>
            <div className="mt-1.5">
              <Check label="Client responds to leads" checked={x.clientRespondsToLeads} ro={ro} set={(on) => set({ clientRespondsToLeads: on })} />
              <p className="mt-1.5 text-xs leading-snug text-muted">Adds to the agreement: “{o.clientRespondsClause}”</p>
            </div>
          </fieldset>
          <details className="group" open={!!x.specialTerms}>
            <summary className="flex min-h-10 cursor-pointer items-center gap-1.5 text-sm font-semibold text-fg-2"><Icon name="plus" size={14} />Add a note (optional)</summary>
            <div className="mt-2"><Area label="Note" help="Printed with the special terms. Only what was agreed; no guarantees or results that were not promised." value={x.specialTerms} set={(v) => set({ specialTerms: v })} ro={ro} max={2000} /></div>
          </details>
        </Card>
      </section>

      {form.missing.length > 0 && !created && (
        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm leading-snug">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warn" />
          <div><span className="font-semibold text-fg">To confirm before sending:</span> <span className="text-fg-2">{form.missing.join(', ')}. You can still make the draft; Dulcy Sign lists these as not confirmed.</span></div>
        </div>
      )}
      {msg && <div className={cx('mt-4 rounded-xl px-4 py-3 text-sm', msg.tone === 'good' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')} role="status">{msg.text}</div>}
      {/* Phone: the bar sits above the bottom tab bar (it was hidden behind it); computer: at the bottom. */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-6 grid grid-cols-1 gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex sm:justify-end sm:px-6 md:bottom-0 md:mx-0 md:px-0">
        {created ? <Button onClick={toDeal} icon="chevronRight">Back to the deal</Button> : (
          <>
            <Button onClick={save} disabled={busy || !unsaved} icon="check">{unsaved ? 'Save draft' : 'Saved'}</Button>
            <Button tone="accent" onClick={create} disabled={busy || unsaved || !saved} icon="file" title={unsaved ? 'Save first' : undefined}>Create draft in Dulcy Sign</Button>
          </>
        )}
      </div>
    </div>
  );
}

/** What "Pull from Close" filled and what Close did not have (nothing is saved until "Save draft"). */
function PullResult({ r }: { r: SalesClosePull }) {
  if (!r.found) return <div className="mb-3 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-fg-2" role="status">{r.error || 'Close has nothing for this deal.'}</div>;
  return (
    <div className="mb-3 rounded-xl border border-line bg-sunken px-4 py-3 text-sm leading-snug" role="status">
      <div className="font-semibold text-fg">From Close{r.lead?.url ? <> · <ExtLink href={r.lead.url}>{r.lead.name}</ExtLink></> : r.lead?.name ? ` · ${r.lead.name}` : ''}</div>
      {!!r.filled?.length && <div className="mt-1 text-fg-2"><span className="text-good">Filled:</span> {r.filled.map((f) => f.label).join(', ')}.</div>}
      {!!r.missing?.length && <div className="mt-1 text-fg-2"><span className="text-warn">Not in Close:</span> {r.missing.join(', ')}.</div>}
      {r.notes?.map((n) => <div key={n} className="mt-1 text-muted">{n}</div>)}
      <div className="mt-1 text-xs text-muted">Check the fields below, then Save draft. Close was only read.</div>
    </div>
  );
}
function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return <label className="block min-w-0"><span className="block text-sm font-semibold text-fg">{label}</span>{help && <span className="block text-xs text-muted">{help}</span>}<span className="mt-1.5 block">{children}</span></label>;
}
function Check({ label, checked, set, ro }: { label: string; checked: boolean; set: (on: boolean) => void; ro: boolean }) {
  return (
    <label className={cx('inline-flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 text-[15px] leading-snug', checked ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface')}>
      <input type="checkbox" checked={checked} disabled={ro} onChange={(e) => set(e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent,currentColor)]" />{label}
    </label>
  );
}
function Text({ label, help, value, set, ro, max, type = 'text' }: { label: string; help?: string; value: string; set: (v: string) => void; ro: boolean; max: number; type?: string }) {
  return <Field label={label} help={help}><input type={type} value={value} maxLength={max} disabled={ro} onChange={(e) => set(e.target.value)} className={inputCls} /></Field>;
}
function Area({ label, help, value, set, ro, max }: { label: string; help?: string; value: string; set: (v: string) => void; ro: boolean; max: number }) {
  return <Field label={label} help={help}><textarea value={value} maxLength={max} disabled={ro} rows={3} onChange={(e) => set(e.target.value)} className={cx(inputCls, 'resize-y py-2.5 leading-relaxed')} /></Field>;
}
function Money({ label, help, value, set, ro }: { label: string; help?: string; value: number | null; set: (v: number | null) => void; ro: boolean }) {
  return (
    <Field label={label} help={help}>
      <span className="relative block">
        <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted">$</span>
        <input type="number" inputMode="decimal" min={0} max={100000} step="any" value={value ?? ''} disabled={ro} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} className={cx(inputCls, 'tabular pl-7')} />
      </span>
    </Field>
  );
}
