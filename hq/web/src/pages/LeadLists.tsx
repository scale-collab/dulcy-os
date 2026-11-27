// Lead lists (Batch 3): the Lead List Center in HQ, inside Campaigns. Lists in progress and done per
// active client, their stage, counts and verifier, including a client who buys only a list (no
// campaign linked: marked "List only"). Read only; building the list still runs through the Lead
// List Center buttons and the engine's stage gates.
import { useEffect, useMemo, useState } from 'react';
import { api, type LeadListRowB3, type LeadListsB3 } from '../api';
import { Card, cx, Empty, ErrorBox, go, PageSkeleton, Pill, timeAgo } from '../ui';
import { Select } from '../charts';

const SHOW = [
  { value: 'open', label: 'In progress + failed' }, { value: 'done', label: 'Done' }, { value: 'listOnly', label: 'List only (no campaign)' }, { value: 'all', label: 'All' },
];
const num = (x: number) => x.toLocaleString('en-US');

export function LeadLists({ client, refresh }: { client: string; refresh: number }) {
  const [d, setD] = useState<LeadListsB3 | null>(null);
  const [error, setError] = useState('');
  const [show, setShow] = useState('open');
  const [again, setAgain] = useState(0);
  useEffect(() => {
    setError('');
    const qs = new URLSearchParams({ ...(client ? { client } : {}), ...(refresh ? { refresh: '1' } : {}) });
    api<LeadListsB3>(`/campaigns/lists?${qs}`).then(setD).catch((e) => setError(e.message));
  }, [client, refresh, again]);
  const rows = useMemo(() => (d?.rows ?? []).filter((r) => show === 'all' || (show === 'open' ? r.group !== 'done' : show === 'done' ? r.group === 'done' : r.listOnly)), [d, show]);
  if (error && !d) return <div className="mt-4"><ErrorBox error={error} retry={() => setAgain((x) => x + 1)} /></div>;
  if (!d) return <div className="mt-4"><PageSkeleton kind="list" /></div>;
  const c = d.counts;
  return (
    <div className="mt-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select label="Show" value={show} onChange={setShow} options={SHOW.map((o) => ({ ...o, label: `${o.label} (${o.value === 'open' ? c.building + c.failed : o.value === 'done' ? c.done : o.value === 'listOnly' ? c.listOnly : d.rows.length})` }))} />
        <span className="text-sm text-muted"><span className="tabular font-semibold text-fg-2">{c.building}</span> building · <span className={cx('tabular font-semibold', c.failed ? 'text-bad' : 'text-fg-2')}>{c.failed}</span> failed · <span className="tabular font-semibold text-fg-2">{c.done}</span> done (last {d.doneDays} days)</span>
      </div>
      <div className="mt-4">
        {!rows.length ? <Card><Empty icon="list" title="No lead lists here" sub={show === 'open' ? 'Nothing is being built right now.' : 'Pick another view or client.'} /></Card> : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {rows.map((r) => <ListCard key={r.id} r={r} showClient={!client} />)}
          </ul>
        )}
      </div>
      <p className="mt-4 text-xs text-muted">From Airtable (Lead Lists), read {timeAgo(d.readAt) || 'just now'}; kept 1 minute. Stages: {d.stages.join(' → ')}. Hidden and archived lists are left out.</p>
    </div>
  );
}

function ListCard({ r, showClient }: { r: LeadListRowB3; showClient: boolean }) {
  const tone = r.group === 'failed' ? 'bad' : r.group === 'done' ? 'good' : 'info';
  return (
    <li>
      <Card className={cx('h-full p-4', r.group === 'failed' && 'border-bad-line')}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="break-words text-[15px] font-semibold leading-snug text-fg">{r.name}</div>
            <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">{showClient && <span>{r.client}</span>}{r.updated && <span>· {timeAgo(r.updated)}</span>}</div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <Pill tone={tone}>{r.group === 'failed' ? 'Failed' : r.group === 'done' ? 'Done' : 'Building'}</Pill>
            {r.listOnly && <Pill tone="accent">List only</Pill>}
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-sm"><span className="font-medium text-fg-2">{r.stage}{r.qa && r.qa !== 'Not Checked' ? ` · QA ${r.qa}` : ''}</span><span className="tabular text-xs text-muted">step {r.step} of {r.steps}</span></div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Lead list stage" aria-valuemin={0} aria-valuemax={r.steps} aria-valuenow={r.step}>
            <div className={cx('h-full rounded-full', r.group === 'failed' ? 'bg-bad' : 'bg-accent')} style={{ width: `${Math.round((r.step / r.steps) * 100)}%` }} />
          </div>
          {r.progress !== null && <div className="mt-1 text-xs text-muted">Running: {Math.round(r.progress * 100)}% of this step</div>}
        </div>
        <dl className="mt-3 grid grid-cols-4 gap-1 text-xs">
          {[['Companies', r.companies], ['Direct', r.direct], ['Generic', r.generic], ['Leads', r.leads]].map(([k, v]) => (
            <div key={String(k)}><dt className="text-muted">{k}</dt><dd className="tabular font-semibold text-fg-2">{Number(v) ? num(Number(v)) : '–'}</dd></div>
          ))}
        </dl>
        <div className="mt-2 text-xs text-muted">{[r.source && `Found by ${r.source}`, r.verifiers && `verified by ${r.verifiers}`].filter(Boolean).join(', ') || 'Verifier not set yet'}</div>
        {r.campaigns.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.campaigns.map((c) => <button key={c.id} onClick={() => go(`campaigns/${c.id}`)} className="min-h-8 rounded-lg border border-line px-2 text-xs font-medium text-accent-ink hover:bg-hover">{c.name || 'Campaign'}</button>)}
          </div>
        )}
        {r.message && <div className={cx('mt-2 break-words text-xs', r.group === 'failed' ? 'text-bad' : 'text-fg-2')}>{r.group === 'failed' ? `${r.owner}: ` : ''}{r.message}</div>}
      </Card>
    </li>
  );
}
