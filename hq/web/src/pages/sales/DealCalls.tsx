// Round 5 (Alex 2026-11-28): the deal page's calls, each named by its type (Outbound consultation /
// Outbound audit / Follow-up …) instead of "Call held", one line on what it was about (Fathom's summary
// or Cole's review, as stored; never made up) and the Fathom recording when it is known.
import { ExtLink, go, Icon, Pill } from '../../ui';
import { slashDate } from '../../dates';
import type { DealCall } from './types';

const STATUS_TONE: Record<string, 'good' | 'info' | 'warn' | 'bad' | 'plain'> = { Held: 'good', Recorded: 'good', Booked: 'info', 'No-show': 'warn', Rescheduled: 'warn', Canceled: 'plain', 'No outcome': 'warn' };
const BY: Record<string, string> = { fathom: 'Fathom', cole: 'Cole', feedback: 'Call Feedback' };

export default function DealCalls({ calls }: { calls: DealCall[] }) {
  if (!calls.length) return <div className="px-5 py-4 text-sm text-muted">No call stored in Sales Data for this deal.</div>;
  return (
    <ul className="divide-y divide-line">
      {calls.map((c, i) => (
        <li key={`${c.day}-${c.name}-${i}`} className="flex items-start gap-3 px-5 py-3">
          <span className="tabular mt-0.5 w-12 shrink-0 text-xs text-muted">{c.day ? slashDate(c.day) : ''}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[15px] font-semibold text-fg">{c.name || c.what}</span>
              {c.status && <Pill tone={STATUS_TONE[c.status] ?? 'plain'}>{c.status}</Pill>}
              {c.score !== null && <span className="text-xs text-muted">Cole {c.score}/10</span>}
            </div>
            {c.about && <div className="mt-0.5 break-words text-sm leading-snug text-fg-2">{c.about}{c.aboutBy && <span className="text-xs text-muted"> · {BY[c.aboutBy]}</span>}</div>}
            {(c.link || c.reviewId) && (
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                {c.link && <ExtLink href={c.link} className="inline-flex min-h-10 items-center sm:min-h-0">{c.linkKind === 'fathom' ? 'Fathom recording' : 'Recording'}</ExtLink>}
                {c.reviewId && <button onClick={() => go(`report/${c.reviewId}`)} className="inline-flex min-h-8 items-center gap-1 font-semibold text-accent-ink hover:underline">Cole's review<Icon name="chevronRight" size={14} /></button>}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
