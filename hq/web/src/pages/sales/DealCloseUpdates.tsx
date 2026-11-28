// Round 3: on the deal page, what Cole changed in Close after each call review (old → new), or what he
// would change while cole.close_update is not switched on (LIVE_STAGES).
import type { CloseUpdateRow } from '../../api';
import { ExtLink, Pill, SectionHeader, Card } from '../../ui';

const TONE: Record<CloseUpdateRow['status'], 'good' | 'info' | 'plain' | 'warn' | 'bad'> = { updated: 'good', planned: 'info', unchanged: 'plain', no_lead: 'warn', no_opportunity: 'warn', failed: 'bad' };
const LABEL: Record<CloseUpdateRow['status'], string> = { updated: 'Updated in Close', planned: 'Would update (not switched on)', unchanged: 'Close already right', no_lead: 'No Close lead', no_opportunity: 'No open opportunity', failed: 'Close refused' };
const FIELD: Record<string, string> = { confidence: 'Likelihood', value: 'Value', value_period: 'Period' };

export default function DealCloseUpdates({ rows }: { rows: CloseUpdateRow[] | undefined }) {
  if (!rows?.length) return null;
  return (
    <section className="mt-6">
      <SectionHeader title="Close updates by Cole" icon="sparkles" />
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="tabular text-xs text-muted">{new Date(r.created).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</span>
                <Pill tone={TONE[r.status]}>{LABEL[r.status]}</Pill>
                {r.changes.map((c) => <span key={c.field} className="tabular text-sm text-fg">{FIELD[c.field] ?? c.field}: <span className="text-muted line-through">{c.from || 'empty'}</span> → <span className="font-semibold">{c.to}</span></span>)}
              </div>
              <div className="mt-1 break-words text-xs text-muted">{r.note}</div>
              {r.closeUrl && <ExtLink href={r.closeUrl} className="mt-1 inline-flex min-h-10 items-center text-sm sm:min-h-0">Open in Close</ExtLink>}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
