// Sales → Draft contract (owner only, Batch 4a). Pick the deal type, amounts and start date; "Save draft"
// keeps it in HQ; "Create draft in Dulcy Sign" makes ONE Contracts row that Dulcy Sign turns into a
// DRAFT. Nothing is ever sent from here: Alex reviews it in Dulcy Sign, approves it and sends it there.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type SalesContractDraft, type SalesContractForm, type SalesDealType, type SalesSavedDraft } from '../api';
import { BackLink, Button, Card, cx, ErrorBox, go, Icon, PageSkeleton, Pill, SectionHeader, timeAgo } from '../ui';

const inputCls = 'min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-[15px] text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft';
const same = (a: SalesContractDraft, b: SalesContractDraft) => JSON.stringify(a) === JSON.stringify(b);

export default function SalesContract({ id }: { id: string }) {
  const [form, setForm] = useState<SalesContractForm | null>(null);
  const [x, setX] = useState<SalesContractDraft | null>(null);
  const [saved, setSaved] = useState<SalesSavedDraft | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setError('');
    api<SalesContractForm>(`/sales/${encodeURIComponent(id)}/contract`).then((f) => { setForm(f); setX(f.draft); setSaved(f.saved); }).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);
  const back = <BackLink label="Deal" onClick={() => go(`sales/${id}`)} />;
  if (error) return <>{back}<ErrorBox error={error} retry={load} /></>;
  if (!form || !x) return <>{back}<PageSkeleton kind="list" /></>;
  const set = (patch: Partial<SalesContractDraft>) => { setX({ ...x, ...patch }); setMsg(null); };
  const created = saved?.status === 'created';
  const unsaved = !saved || !same(saved.input, x);
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
  const showMonthly = x.dealType !== 'per_call' || x.monthly !== null;
  const showPerCall = x.dealType !== 'retainer';
  const ro = created;
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
        <div role="radiogroup" aria-label="Deal type" className="grid gap-2 sm:grid-cols-3">
          {form.types.map((t) => (
            <button key={t.key} role="radio" aria-checked={x.dealType === t.key} disabled={ro} onClick={() => set({ dealType: t.key as SalesDealType, ...(t.key === 'retainer' ? { perCall: null } : {}) })}
              className={cx('min-h-14 rounded-2xl border px-4 py-3 text-left text-[15px] font-semibold transition disabled:opacity-60', x.dealType === t.key ? 'border-accent bg-accent-soft text-fg ring-2 ring-accent' : 'border-line bg-surface text-fg-2 hover:bg-hover')}>
              {t.label}
              <span className="mt-0.5 block text-xs font-normal text-muted">{t.key === 'retainer' ? 'Monthly / Retainer' : t.key === 'per_call' ? 'PPC / PPL' : 'PPC / PPL with a monthly tech fee'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <SectionHeader title="Money and start" icon="dollar" />
        <Card className="grid gap-4 sm:grid-cols-2">
          {showMonthly && <Money label={x.dealType === 'retainer' ? 'Monthly fee' : 'Monthly tech fee'} help={x.dealType === 'per_call' ? 'Optional for pay per call' : 'Billed monthly, USD'} value={x.monthly} set={(v) => set({ monthly: v })} ro={ro} />}
          {!showMonthly && <div className="text-sm text-muted sm:col-span-1"><button className="font-semibold text-accent-ink hover:underline" onClick={() => set({ monthly: 0 })} disabled={ro}>Add a monthly tech fee</button></div>}
          {showPerCall && <Money label="Per qualified call" help="USD per call" value={x.perCall} set={(v) => set({ perCall: v })} ro={ro} />}
          <Money label="Initial fee" help="Optional, one time" value={x.initialFee} set={(v) => set({ initialFee: v })} ro={ro} />
          <Field label="Start date"><input type="date" value={x.startDate} disabled={ro} onChange={(e) => set({ startDate: e.target.value })} className={inputCls} /></Field>
        </Card>
      </section>

      <section className="mt-6">
        <SectionHeader title="Client" icon="briefcase" />
        <Card className="grid gap-4 sm:grid-cols-2">
          <Text label="Signer name" value={x.signerName} set={(v) => set({ signerName: v })} ro={ro} max={120} />
          <Text label="Signer email" type="email" value={x.signerEmail} set={(v) => set({ signerEmail: v })} ro={ro} max={200} />
          <Text label="Company / brand" value={x.company} set={(v) => set({ company: v })} ro={ro} max={200} />
          <Text label="Legal name" help="As on the contract" value={x.legalName} set={(v) => set({ legalName: v })} ro={ro} max={200} />
          <div className="sm:col-span-2"><Area label="Address" value={x.address} set={(v) => set({ address: v })} ro={ro} max={500} /></div>
        </Card>
      </section>

      <section className="mt-6">
        <SectionHeader title="Terms" icon="file" />
        <Card className="grid gap-4 sm:grid-cols-2">
          <Text label="Service" help="e.g. Cold email outreach" value={x.service} set={(v) => set({ service: v })} ro={ro} max={200} />
          <Text label="Term" help="e.g. Month to month" value={x.term} set={(v) => set({ term: v })} ro={ro} max={200} />
          <div className="sm:col-span-2"><Area label="Scope" value={x.scope} set={(v) => set({ scope: v })} ro={ro} max={3000} /></div>
          <div className="sm:col-span-2"><Area label="Special terms" help="Only what was agreed. No guarantees or results that were not promised." value={x.specialTerms} set={(v) => set({ specialTerms: v })} ro={ro} max={2000} /></div>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-semibold text-fg">Extra channels</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {([['linkedin', 'LinkedIn'], ['aiCaller', 'AI / cold caller'], ['directMail', 'Direct mail']] as const).map(([k, label]) => (
                <label key={k} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[15px]">
                  <input type="checkbox" checked={x.channels[k]} disabled={ro} onChange={(e) => set({ channels: { ...x.channels, [k]: e.target.checked } })} className="h-4 w-4 accent-[var(--accent,currentColor)]" />{label}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      </section>

      {form.missing.length > 0 && !created && (
        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm leading-snug">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warn" />
          <div><span className="font-semibold text-fg">To confirm before sending:</span> <span className="text-fg-2">{form.missing.join(', ')}. You can still make the draft; Dulcy Sign lists these as not confirmed.</span></div>
        </div>
      )}
      {msg && <div className={cx('mt-4 rounded-xl px-4 py-3 text-sm', msg.tone === 'good' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')} role="status">{msg.text}</div>}
      <div className="sticky bottom-0 mt-6 grid grid-cols-1 gap-2 border-t border-line bg-bg/95 py-3 backdrop-blur sm:flex sm:justify-end">
        {created ? <Button onClick={() => go(`sales/${id}`)} icon="chevronRight">Back to the deal</Button> : (
          <>
            <Button onClick={save} disabled={busy || !unsaved} icon="check">{unsaved ? 'Save draft' : 'Saved'}</Button>
            <Button tone="accent" onClick={create} disabled={busy || unsaved || !saved} icon="file" title={unsaved ? 'Save first' : undefined}>Create draft in Dulcy Sign</Button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return <label className="block min-w-0"><span className="block text-sm font-semibold text-fg">{label}</span>{help && <span className="block text-xs text-muted">{help}</span>}<span className="mt-1.5 block">{children}</span></label>;
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
