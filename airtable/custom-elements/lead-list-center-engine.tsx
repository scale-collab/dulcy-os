import React, {useMemo, useState} from 'react';
import {initializeBlock, useBase, useRecords, expandRecord} from '@airtable/blocks/interface/ui';

// Lead List Center (Engine): runs lead-list stages on the Dulcy engine server.
// A button sets Engine Action (and ticks Runs on Engine); the engine picks it up within about
// 30 seconds and writes progress and results back to the same record. Targeting and filter
// generation stay in the regular Lead List Center (same records).

type AnyRecord = any;
type AnyField = any;

const LEAD_LISTS = 'tblVOg9BkPOMmnitt';
const ID = {
    name: 'fldbg5PAnKyFHc3uy', client: 'fldEujtSLqwdpOyGD', icp: 'fldcYwP7Dlq4uyC39', thesis: 'fldg6HZIKqe8c8RtW', filters: 'fldC2hZQ3gSqLmi1y',
    sampleApproved: 'fldqGx4RU4zDYxitK', target: 'fldYzvqGmQZxXL9AP', contactFilters: 'fld8Y8iYpvUV4FDDX', persona: 'fldRIomZHeVxPWveE',
    contactSampleSize: 'fldE2XBsGSES6fT6X', contactApproved: 'fldVz983EKKiPSzjc', includeDirect: 'fldfFcn3BB2RyiWer', includeGeneric: 'fldIXN5t3bqfiZ0Wu',
    footprint200: 'fldAFATYp9G26MmVj', sheet: 'fldSOTvnUxzKWXMDD', processing: 'fldf9wpMGWg0SebHV', error: 'fldBiCrm8Xm1V6FxF',
    runsOnEngine: 'fldKPpOJP097SYrhS', action: 'fldZgT9Rbnra2x5GP', status: 'fldpuekpeAVeP0Kqn', jobId: 'fldUjq8KXRscLHOWd', message: 'fld37FC33xjt25nSQ',
    companies: 'fldRLtvugIxH9qun1', companyGood: 'fldAWCY4Tl9jpQtYc', companyBad: 'fldqaiJodYBS3GpRu', companyRate: 'fldDD7HGFq0j3Iwfp',
    companyStatus: 'fldY1i1787UwZFOr6', companySummary: 'fld6BhZSLdGOkCJCZ', contactGood: 'fldkWL67N8ZaBIaDi', contactBad: 'flda4qjRC0sCeStBg',
    contactRate: 'fldbiciFuOmAzv38D', contactStatus: 'fldVH77A3Ozjh4t8k', contactSummary: 'fldnScb360OZ17VRt', vGood: 'fld8kUuSdLo5autI7',
    vRisky: 'fldXl4sV7ma4YAOv7', vBad: 'fld9Jgzxc9JqeFAus', finalDirect: 'fldQZJCpTofahmTkl', finalGeneric: 'fld0FHomkh3uyx0FD', leads: 'fld2G5D1yCPFGFiVF',
} as const;
type Key = keyof typeof ID;

const STAGES: {action: string; label: string; help: string; ready: (r: AnyRecord, g: Getters) => string | null}[] = [
    {action: 'Run Company Sample', label: '1. Company sample (100)', help: 'Free count, then up to 100 companies, fit check in code.', ready: (r, g) => g.text(r, 'filters') ? null : 'Generate the DiscoLike filters in Lead List Center first'},
    {action: 'Expand Companies', label: '2. Expand companies', help: 'Grows to the Expansion Target in batches of 2,500.', ready: (r, g) => !g.bool(r, 'sampleApproved') ? 'Approve the company sample first' : !g.num(r, 'target') ? 'Set an Expansion Target' : null},
    {action: 'Refit Companies', label: 'Re-check companies', help: 'Free. Re-runs the fit check on every saved company.', ready: (r, g) => g.text(r, 'filters') ? null : 'No filters on this list'},
    {action: 'Find Contacts', label: '3. Find contacts', help: 'Not approved: a contact sample. Approved: every usable company left.', ready: () => null},
    {action: 'Verify and Finalize', label: '4. Verify (MillionVerifier)', help: 'Verifies the Contacts tab and writes the Final tabs.', ready: (r, g) => g.bool(r, 'includeDirect') || g.bool(r, 'includeGeneric') ? null : 'Tick Include Direct or Include Generic'},
];
const ACTIVE = ['Queued', 'Running', 'Waiting'];

interface Getters { text: (r: AnyRecord, k: Key) => string; num: (r: AnyRecord, k: Key) => number; bool: (r: AnyRecord, k: Key) => boolean; option: (r: AnyRecord, k: Key) => string }

function EnginePanel(): React.ReactElement {
    const base = useBase();
    const table = base.tables.find((t: any) => t.id === LEAD_LISTS) ?? null;
    const records = ((useRecords(table as any) ?? []) as AnyRecord[]).filter(r => r?.id);
    const field = (k: Key): AnyField | null => (table as any)?.fields?.find((f: AnyField) => f.id === ID[k]) ?? null;
    const g: Getters = useMemo(() => {
        const raw = (r: AnyRecord, k: Key) => { const f = field(k); if (!r || !f) return null; try { return r.getCellValue(f.id); } catch { return null; } };
        return {
            text: (r, k) => { const f = field(k); if (!r || !f) return ''; try { return String(r.getCellValueAsString(f.id) ?? '').trim(); } catch { return ''; } },
            num: (r, k) => Number(raw(r, k) ?? 0) || 0,
            bool: (r, k) => Boolean(raw(r, k)),
            option: (r, k) => { const v = raw(r, k); return v && typeof v === 'object' ? String(v.name ?? '') : String(v ?? ''); },
        };
    }, [table]);

    const [query, setQuery] = useState('');
    const [engineOnly, setEngineOnly] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [notice, setNotice] = useState<{kind: 'info' | 'error'; text: string} | null>(null);
    const [busy, setBusy] = useState(false);

    if (!table) return <div className="p-8 text-red-700">The Lead Lists table is not available to this page.</div>;
    const list = records
        .filter(r => !engineOnly || g.bool(r, 'runsOnEngine'))
        .filter(r => !query || g.text(r, 'name').toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => Number(g.bool(b, 'runsOnEngine')) - Number(g.bool(a, 'runsOnEngine')) || g.text(a, 'name').localeCompare(g.text(b, 'name')));
    const sel = records.find(r => r.id === selectedId) ?? null;

    async function set(k: Key, v: unknown) {
        if (!sel) return;
        try { await (table as any).updateRecordAsync(sel.id, {[ID[k]]: v}); } catch (e: any) { setNotice({kind: 'error', text: e?.message ?? 'Could not save'}); }
    }
    async function run(action: string) {
        if (!sel || busy) return;
        const status = g.option(sel, 'status');
        if (ACTIVE.includes(status) || g.option(sel, 'action')) { setNotice({kind: 'info', text: 'This list already has a request waiting or running. Wait for it to finish.'}); return; }
        setBusy(true);
        try {
            await new Promise(res => setTimeout(res, 500)); // let a field being edited save first
            await (table as any).updateRecordAsync(sel.id, {[ID.runsOnEngine]: true, [ID.action]: {name: action}});
            setNotice({kind: 'info', text: `${action} sent to the engine. It starts within about 30 seconds.`});
        } catch (e: any) {
            setNotice({kind: 'error', text: e?.message ?? `Could not send ${action}`});
        } finally { setBusy(false); }
    }

    const pct = (r: AnyRecord, k: Key) => { const n = g.num(r, k); return n ? `${Math.round(n * 1000) / 10}%` : '–'; };
    const n = (r: AnyRecord, k: Key) => { const x = g.num(r, k); return x ? x.toLocaleString() : '–'; };
    const chip = (s: string) => s === 'Done' || s === 'Passed' ? 'bg-emerald-100 text-emerald-800' : s === 'Failed' ? 'bg-red-100 text-red-800' : s === 'Needs Review' ? 'bg-amber-100 text-amber-800' : ACTIVE.includes(s) ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600';
    const Stat = ({label, children}: {label: string; children: React.ReactNode}) => <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-xl font-black text-slate-900">{children}</div></div>;
    const Check = ({k, label}: {k: Key; label: string}) => <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={g.bool(sel, k)} onChange={e => set(k, e.target.checked)}/>{label}</label>;
    const Num = ({k, label}: {k: Key; label: string}) => <label className="text-sm font-semibold text-slate-700">{label}<input type="number" min={0} className="mt-1 block w-36 rounded-lg border border-slate-300 px-3 py-2" defaultValue={g.num(sel, k) || ''} key={`${sel?.id}-${k}`} onBlur={e => set(k, e.target.value === '' ? null : Number(e.target.value))}/></label>;

    return <div className="flex h-screen bg-slate-50 text-slate-900">
        <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
                <h1 className="text-xl font-black">Lead List Center (Engine)</h1>
                <p className="mt-1 text-xs text-slate-500">Stages run on the Dulcy engine server.</p>
                <input className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Search lists" value={query} onChange={e => setQuery(e.target.value)}/>
                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={engineOnly} onChange={e => setEngineOnly(e.target.checked)}/>Only lists on the engine</label>
            </div>
            <div className="flex-1 overflow-y-auto">{list.map(r => <button key={r.id} onClick={() => { setSelectedId(r.id); setNotice(null); }} className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${r.id === selectedId ? 'bg-indigo-50' : ''}`}>
                <div className="truncate text-sm font-bold">{g.text(r, 'name') || r.name || r.id}</div>
                <div className="mt-1 flex items-center gap-2 text-xs">{g.bool(r, 'runsOnEngine') ? <span className={`rounded-full px-2 py-0.5 font-semibold ${chip(g.option(r, 'status'))}`}>{g.option(r, 'status') || 'On engine'}</span> : <span className="text-slate-400">n8n</span>}<span className="truncate text-slate-500">{g.text(r, 'client')}</span></div>
            </button>)}</div>
        </aside>
        <main className="flex-1 overflow-y-auto p-6">{!sel ? <div className="mt-20 text-center text-slate-500">Pick a lead list on the left.</div> : <div className="mx-auto max-w-5xl space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div><h2 className="text-2xl font-black">{g.text(sel, 'name') || sel.name}</h2><div className="mt-1 text-sm text-slate-500">{g.text(sel, 'client')}</div></div>
                <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" onClick={() => expandRecord(sel)}>Open record</button>
            </div>
            <div className={`rounded-xl border p-4 ${g.option(sel, 'status') === 'Failed' ? 'border-red-200 bg-red-50' : 'border-indigo-200 bg-indigo-50'}`}>
                <div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-sm font-bold ${chip(g.option(sel, 'status'))}`}>Engine: {g.option(sel, 'status') || (g.bool(sel, 'runsOnEngine') ? 'Idle' : 'Not on engine yet')}</span>{g.text(sel, 'jobId') && <span className="text-xs text-slate-500">job {g.text(sel, 'jobId')}</span>}{g.option(sel, 'action') && <span className="text-xs font-semibold text-indigo-700">waiting for the engine to pick up: {g.option(sel, 'action')}</span>}</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{g.text(sel, 'message') || 'Pressing a stage below runs this list on the engine.'}</div>
            </div>
            {notice && <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${notice.kind === 'error' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>{notice.text}</div>}

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold">Setup (edit targeting and filters in Lead List Center)</h3>
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm"><div><div className="font-semibold text-slate-500">Targeting sentence</div><div className="mt-1 whitespace-pre-wrap">{g.text(sel, 'icp') || '–'}</div></div><div><div className="font-semibold text-slate-500">List thesis</div><div className="mt-1 whitespace-pre-wrap">{g.text(sel, 'thesis') || '–'}</div></div></div>
                <div className="mt-3 text-sm"><span className="font-semibold text-slate-500">Company filters: </span>{g.text(sel, 'filters') ? <span className="font-semibold text-emerald-700">ready</span> : <span className="font-semibold text-red-700">not generated</span>}<span className="ml-6 font-semibold text-slate-500">Contact filters: </span>{g.text(sel, 'contactFilters') ? 'set' : 'default'}<span className="ml-6 font-semibold text-slate-500">Persona: </span>{g.text(sel, 'persona') ? 'set' : '–'}</div>
                <div className="mt-4 flex flex-wrap items-end gap-6"><Num k="target" label="Expansion Target"/><Num k="contactSampleSize" label="Contact sample (companies)"/><Check k="sampleApproved" label="Company sample approved"/><Check k="contactApproved" label="Contact sample approved"/><Check k="includeDirect" label="Include Direct"/><Check k="includeGeneric" label="Include Generic"/><Check k="footprint200" label="Generic: footprint 200 or less"/></div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold">Run a stage</h3>
                <div className="mt-3 grid grid-cols-5 gap-3">{STAGES.map(s => { const why = s.ready(sel, g); const blocked = Boolean(why) || busy || ACTIVE.includes(g.option(sel, 'status')) || Boolean(g.option(sel, 'action')); return <div key={s.action} className="flex flex-col"><button disabled={blocked} title={why ?? s.help} onClick={() => run(s.action)} className="rounded-xl bg-indigo-600 px-3 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">{s.label}</button><div className={`mt-1 text-xs ${why ? 'text-red-700' : 'text-slate-500'}`}>{why ?? s.help}</div></div>; })}</div>
            </section>

            <section className="grid grid-cols-4 gap-3">
                <Stat label="Companies">{n(sel, 'companies')}</Stat><Stat label="Usable (Tier 1+2)">{n(sel, 'companyGood')}</Stat><Stat label="Cut">{n(sel, 'companyBad')}</Stat><Stat label={`Usable rate · ${g.option(sel, 'companyStatus') || '–'}`}>{pct(sel, 'companyRate')}</Stat>
                <Stat label="Usable contacts">{n(sel, 'contactGood')}</Stat><Stat label="Cut contacts">{n(sel, 'contactBad')}</Stat><Stat label={`Contact rate · ${g.option(sel, 'contactStatus') || '–'}`}>{pct(sel, 'contactRate')}</Stat><Stat label="Leads (final)">{n(sel, 'leads')}</Stat>
                <Stat label="Verified good">{n(sel, 'vGood')}</Stat><Stat label="Risky">{n(sel, 'vRisky')}</Stat><Stat label="Bad">{n(sel, 'vBad')}</Stat><Stat label="Final direct / generic">{n(sel, 'finalDirect')} / {n(sel, 'finalGeneric')}</Stat>
            </section>
            {g.text(sel, 'sheet') && <a className="block rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-800" href={g.text(sel, 'sheet')} target="_blank" rel="noreferrer">Open the list's Google Sheet ↗</a>}
            {[['companySummary', 'Company review summary'], ['contactSummary', 'Contact review summary'], ['error', 'Last error']].map(([k, label]) => g.text(sel, k as Key) ? <details key={k} className="rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer px-4 py-3 text-sm font-bold">{label}</summary><pre className="whitespace-pre-wrap border-t border-slate-100 px-4 py-3 text-xs text-slate-700">{g.text(sel, k as Key)}</pre></details> : null)}
        </div>}</main>
    </div>;
}

initializeBlock({interface: () => <EnginePanel/>});
