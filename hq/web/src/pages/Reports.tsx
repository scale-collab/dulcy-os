import type { Report } from '../api';
import { Avatar, cx, go, Icon, Pill, timeAgo } from '../ui';

export const scoreTone = (score: number) => (score >= 7 ? 'bg-good-soft text-good' : score >= 5 ? 'bg-warn-soft text-warn' : 'bg-bad-soft text-bad');

/** A short report row: title + 1-2 lines; a call review shows its score first. Opens the full text. */
export function ReportCard({ r }: { r: Report }) {
  const score = r.kind === 'call_review' && typeof r.data?.score === 'number' ? r.data.score : null;
  return (
    <button type="button" onClick={() => go(`report/${r.id}`)} className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-hover">
      {score !== null
        ? <span className={cx('tabular grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-sm font-bold', scoreTone(score))} aria-label={`Score ${score} of 10`}>{score}</span>
        : <Avatar name={r.agent} />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="font-medium text-fg-2">{r.agent}</span><span aria-hidden="true">·</span><span>{timeAgo(r.created)}</span>
          {r.urgent && <Pill tone="bad">urgent</Pill>}{r.dryRun && <Pill>dry run</Pill>}
        </div>
        <div className="mt-0.5 break-words text-[15px] font-semibold text-fg sm:truncate">{r.title}</div>
        {r.summary && <div className="mt-0.5 line-clamp-2 text-sm text-muted">{r.summary}</div>}
      </div>
      <Icon name="chevronRight" size={18} className="mt-2.5 text-faint transition group-hover:translate-x-0.5 group-hover:text-muted" />
    </button>
  );
}

export function ReportList({ reports, empty = 'No reports yet.' }: { reports: Report[]; empty?: string }) {
  if (!reports.length) return <div className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">{empty}</div>;
  return <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">{reports.map((r) => <ReportCard key={r.id} r={r} />)}</div>;
}
