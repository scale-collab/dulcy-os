// Lead List Center in HQ (Round 2 rebuild, Alex 2026-11-27): the same as the Airtable Lead List
// Center: lists newest first (Alex: "why is 'NJ Real Estate Test' at the top?"), stage, counts, who
// verified the emails, the linked campaign, a client who buys only a list ("List only"). Test lists
// and lists finished 60+ days ago are hidden unless asked. Tap a list for its stage tabs and buttons.
import { useEffect, useMemo, useState } from 'react';
import { api, type LeadListRowR2, type LeadListsR2 } from '../api';
import { Card, cx, Empty, ErrorBox, go, PageSkeleton, Pill, timeAgo } from '../ui';
import { Select } from '../charts';
import { num, slash } from './campaign/shared';

const SHOW = [
  { value: 'all', label: 'All stages' }, { value: 'open', label: 'In progress + failed' }, { value: 'running', label: 'Running now' }, { value: 'done', label: 'Ready / uploaded' }, { value: 'listOnly', label: 'List only (no campaign)' },
];

export function LeadLists({ client, refresh }: { client: string; refresh: number }) {
  const [d, setD] = useState<LeadListsR2 | null>(null);
  const [error, setError] = useState('');
  const [show, setShow] = useState('all');
  const [stage, setStage] = useState('');
  const [q, setQ] = useState('');
  const [tests, setTests] = useState(false);
  const [old, setOld] = useState(false);
  const [again, setAgain] = useState(0);
  const [limit, setLimit] = useState(60);
  useEffect(() => {
    setError('');
    const qs = new URLSearchParams({ ...(client ? { client } : {}), ...(refresh ? { refresh: '1' } : {}), ...(tests ? { tests: '1' } : {}), ...(old ? { old: '1' } : {}) });
    api<LeadListsR2>(`/campaigns/lists?${qs}`).then(setD).catch((e) => setError(e.message));
  }, [client, refresh, again, tests, old]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (d?.rows ?? []).filter((r) => (show === 'all' || (show === 'open' ? r.group !== 'done' : show === 'running' ? r.running : show === 'done' ? r.group === 'done' : r.listOnly))
      && (!stage || r.stage === stage) && (!term || `${r.name} ${r.client} ${r.campaigns.map((c) => c.name).join(' ')}`.toLowerCase().includes(term)));
  }, [d, show, stage, q]);
  if (error && !d) return <div className="mt-4"><ErrorBox error={error} retry={() => setAgain((x) => x + 1)} /></div>;
  if (!d) return <div className="mt-4"><PageSkeleton kind="list" /></div>;
  const c = d.counts;
  const stages = [...new Set(d.rows.map((r) => r.stage))];
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill>{rows.length} showing</Pill><Pill tone="good">{c.done} ready</Pill><Pill tone="info">{c.running} running</Pill>{c.failed > 0 && <Pill tone="bad">{c.failed} failed</Pill>}<Pill tone="accent">{c.listOnly} list only</Pill>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select label="Show" value={show} onChange={setShow} options={SHOW} />
        <Select label="Stage" value={stage} onChange={setStage} options={[{ value: '', label: 'Any stage' }, ...stages.map((s) => ({ value: s, label: s }))]} />
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search lead lists</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lead lists" maxLength={100}
            className="min-h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-fg outline-none placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft" />
        </label>
        <label className="inline-flex min-h-10 items-center gap-2 text-sm text-fg-2"><input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} className="h-4 w-4" />Show tests ({c.tests})</label>
        <label className="inline-flex min-h-10 items-center gap-2 text-sm text-fg-2"><input type="checkbox" checked={old} onChange={(e) => setOld(e.target.checked)} className="h-4 w-4" />Finished 60+ days ago ({c.old})</label>
        <span className="text-xs text-muted sm:ml-auto">Newest first</span>
      </div>
      {!rows.length ? <Card className="mt-4"><Empty icon="list" title="No lead lists here" sub="Pick another view or client." /></Card> : (
        <>
          <ul className="mt-4 space-y-2 md:hidden">{rows.slice(0, limit).map((r) => <li key={r.id}><ListCard r={r} showClient={!client} /></li>)}</ul>
          <Card className="mt-4 hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] table-fixed text-left text-sm">
                <thead className="border-b border-line bg-sunken text-xs text-muted"><tr>
                  <th className="px-5 py-2.5 font-medium">Lead list</th><th className="w-44 px-3 py-2.5 font-medium">Stage</th><th className="w-24 px-3 py-2.5 text-right font-medium">Companies</th>
                  <th className="w-20 px-3 py-2.5 text-right font-medium">Direct</th><th className="w-20 px-3 py-2.5 text-right font-medium">Generic</th><th className="w-20 px-3 py-2.5 text-right font-medium">Leads</th>
                  <th className="w-36 px-3 py-2.5 font-medium">Verified by</th><th className="w-48 px-3 py-2.5 font-medium">Campaign</th><th className="w-20 px-5 py-2.5 text-right font-medium">Made</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.slice(0, limit).map((r) => (
                    <tr key={r.id} onClick={() => go(`campaigns/list/${r.id}`)} className="cursor-pointer align-top transition hover:bg-hover">
                      <td className="px-5 py-3">
                        <a href={`#/campaigns/list/${r.id}`} className="block break-words font-semibold text-fg">{r.name}</a>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">{!client && <span>{r.client}</span>}{r.test && <Pill>test</Pill>}{r.listOnly && <Pill tone="accent">List only</Pill>}</div>
                        {r.message && <div className={cx('mt-1 line-clamp-2 break-words text-xs', r.group === 'failed' ? 'text-bad' : 'text-muted')}>{r.message}</div>}
                      </td>
                      <td className="px-3 py-3"><StageCell r={r} /></td>
                      <td className="tabular px-3 py-3 text-right">{r.companies ? num(r.companies) : '–'}</td>
                      <td className="tabular px-3 py-3 text-right">{r.direct ? num(r.direct) : '–'}</td>
                      <td className="tabular px-3 py-3 text-right">{r.generic ? num(r.generic) : '–'}</td>
                      <td className="tabular px-3 py-3 text-right font-semibold text-fg">{r.leads ? num(r.leads) : '–'}</td>
                      <td className="px-3 py-3 text-xs text-fg-2">{r.verifiers || '–'}</td>
                      <td className="px-3 py-3 text-xs">{r.campaigns.length ? r.campaigns.map((x) => <button key={x.id} onClick={(e) => { e.stopPropagation(); go(`campaigns/${x.id}`); }} className="block min-h-7 max-w-full truncate text-left font-medium text-accent-ink hover:underline">{x.name || 'Campaign'}</button>) : <span className="text-muted">–</span>}</td>
                      <td className="tabular px-5 py-3 text-right text-xs text-muted">{slash(r.added)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {rows.length > limit && <button onClick={() => setLimit(limit + 100)} className="mt-2 min-h-11 w-full rounded-xl border border-line text-sm font-semibold text-fg-2 hover:bg-hover">Show {Math.min(100, rows.length - limit)} more</button>}
        </>
      )}
      <p className="mt-4 text-xs text-muted">From Airtable (Lead Lists), read {timeAgo(d.readAt) || 'just now'}; kept 1 minute. Stages: {d.stages.join(' → ')}. Hidden and archived lists are left out.</p>
    </div>
  );
}

function StageCell({ r }: { r: LeadListRowR2 }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 text-xs font-medium text-fg-2">{r.stage}{r.qa && r.qa !== 'Not Checked' && <span className="text-muted">· QA {r.qa}</span>}{r.running && <Pill tone="info">running</Pill>}{r.group === 'failed' && <Pill tone="bad">failed</Pill>}</div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Lead list stage" aria-valuemin={0} aria-valuemax={r.steps} aria-valuenow={r.step}>
        <div className={cx('h-full rounded-full', r.group === 'failed' ? 'bg-bad' : 'bg-accent')} style={{ width: `${Math.round((r.step / r.steps) * 100)}%` }} />
      </div>
      <div className="mt-0.5 text-[11px] text-muted">step {r.step} of {r.steps}{r.progress !== null ? ` · ${Math.round(r.progress * 100)}% of this step` : ''}</div>
    </div>
  );
}

function ListCard({ r, showClient }: { r: LeadListRowR2; showClient: boolean }) {
  return (
    <Card onClick={() => go(`campaigns/list/${r.id}`)} className={cx('p-4', r.group === 'failed' && 'border-bad-line')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-[15px] font-semibold leading-snug text-fg">{r.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">{showClient && <span>{r.client}</span>}<span>· made {slash(r.added)}</span></div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">{r.test && <Pill>test</Pill>}{r.listOnly && <Pill tone="accent">List only</Pill>}</div>
      </div>
      <div className="mt-2.5"><StageCell r={r} /></div>
      <dl className="mt-2.5 grid grid-cols-4 gap-1 text-xs">
        {[['Companies', r.companies], ['Direct', r.direct], ['Generic', r.generic], ['Leads', r.leads]].map(([k, v]) => (
          <div key={String(k)}><dt className="text-muted">{k}</dt><dd className="tabular font-semibold text-fg-2">{Number(v) ? num(Number(v)) : '–'}</dd></div>
        ))}
      </dl>
      {r.message && <div className={cx('mt-2 break-words text-xs', r.group === 'failed' ? 'text-bad' : 'text-fg-2')}>{r.message}</div>}
    </Card>
  );
}
