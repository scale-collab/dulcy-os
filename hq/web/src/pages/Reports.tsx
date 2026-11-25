import type { Report } from '../api';
import { AGENT_EMOJI, Card, go, Pill, timeAgo } from '../ui';

/** A short report card: title + 1-2 lines; a call review shows its score first. Opens the full text. */
export function ReportCard({ r }: { r: Report }) {
  const score = r.kind === 'call_review' && typeof r.data?.score === 'number' ? r.data.score : null;
  return (
    <Card onClick={() => go(`report/${r.id}`)} className="p-4">
      <div className="flex items-start gap-3">
        <div className="text-xl leading-none">{score !== null ? <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-bold ${score >= 7 ? 'bg-accent-soft text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300' : score >= 5 ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300' : 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300'}`}>{score}</span> : AGENT_EMOJI[r.agent] ?? '📄'}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400"><span>{r.agent}</span><span>·</span><span>{timeAgo(r.created)}</span>{r.urgent && <Pill tone="bad">urgent</Pill>}{r.dryRun && <Pill>dry run</Pill>}</div>
          <div className="mt-0.5 truncate font-semibold">{r.title}</div>
          {r.summary && <div className="mt-0.5 line-clamp-2 text-sm text-stone-600 dark:text-stone-300">{r.summary}</div>}
        </div>
        <span className="self-center text-stone-400">›</span>
      </div>
    </Card>
  );
}

export function ReportList({ reports, empty = 'No reports yet.' }: { reports: Report[]; empty?: string }) {
  if (!reports.length) return <div className="text-sm text-stone-500 dark:text-stone-400">{empty}</div>;
  return <div className="space-y-2">{reports.map((r) => <ReportCard key={r.id} r={r} />)}</div>;
}
