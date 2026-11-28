// Round 5 (Alex 2026-11-28): the deal page's Calls list. Each call is named by its type (Outbound
// consultation / Outbound audit / Follow-up …) from the Fathom meeting title (the calendar event name)
// or Cole's classification, else the Sales Data stage, instead of "Call held". One line on what the
// meeting was about: Fathom's own "Meeting Purpose" when Cole stored it, else Cole's verdict from the
// call review, never invented. The Fathom recording link when it is known (Cole's review, or a Fathom
// link in Call Feedback). Pure; read only.
import type { Deal, ColeReport } from './sales.js';

const DAY = 86_400_000;
const dayOf = (iso: string) => (!iso ? '' : /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(Date.parse(iso)).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
const gap = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
const isFathom = (u: string) => /^https:\/\/(?:[a-z0-9-]+\.)*fathom\.video\//i.test(u);

/** The call type as a name, from the meeting title, else Cole's call type, else ''. Pure. */
export function callName(title: string, callType = ''): string {
  const t = String(title ?? '').toLowerCase();
  if (/consult/.test(t)) return 'Outbound consultation';
  if (/audit/.test(t)) return 'Outbound audit';
  if (/follow[\s-]?up/.test(t)) return 'Follow-up';
  if (/onboard|kick[\s-]?off/.test(t)) return 'Onboarding call';
  if (/discovery|intro/.test(t)) return 'Discovery call';
  if (/demo/.test(t)) return 'Demo';
  if (/clos(e|ing)\b/.test(t)) return 'Closing call';
  const c = String(callType ?? '').toLowerCase();
  return c === 'follow-up' ? 'Follow-up' : c === 'discovery' ? 'Discovery call' : c === 'close' ? 'Closing call' : '';
}
/** The name from the Sales Data stage (Make "1.0 Booked Meeting" books an audit call). Pure. */
export function stageCallName(stage: string): string {
  if (stage === 'Audit Call Scheduled') return 'Outbound audit';
  if (stage === 'Follow Up Call') return 'Follow-up';
  return 'Sales call';
}

/** One line on what the meeting was about, from Fathom's summary (markdown): the Meeting Purpose, else the first plain line. Pure. */
export function fathomAbout(summary: string): string {
  const lines = String(summary ?? '').split(/\r?\n/).map((l) => l.trim());
  const clean = (l: string) => l.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^[-*•>\d.)\s]+/, '').replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim();
  const purpose = lines.findIndex((l) => /^#{1,6}\s*(meeting\s+)?purpose\b/i.test(l) || /^\*\*(meeting\s+)?purpose\*\*:?$/i.test(l));
  const from = purpose >= 0 ? purpose + 1 : 0;
  for (let i = from; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (/^#{1,6}\s/.test(l)) { if (purpose >= 0) break; continue; }
    const c = clean(l);
    if (c.length >= 8) return c.length > 220 ? `${c.slice(0, 217).replace(/\s+\S*$/, '')}…` : c;
  }
  return '';
}

export type CallStatus = 'Held' | 'Booked' | 'No-show' | 'Canceled' | 'Rescheduled' | 'No outcome' | 'Recorded' | '';
export interface CallRow {
  name: string; status: CallStatus; day: string;
  /** One line on the meeting; `aboutBy` says whose words they are (Fathom's summary or Cole's review). */
  about: string; aboutBy: 'fathom' | 'cole' | 'feedback' | '';
  link: string; linkKind: 'fathom' | 'link' | '';
  score: number | null; reviewId: number | null;
}
const reviewDay = (r: ColeReport) => dayOf(r.meetingAt || r.created);

/** Every call on a deal, newest first: the Sales Data call (with its Cole review when one matches), other recorded calls, re-booked dates. Pure. */
export function dealCalls(d: Pick<Deal, 'callDate' | 'heldDate' | 'airtableStage' | 'stages' | 'reviews' | 'feedback'>, today: string): CallRow[] {
  const out: CallRow[] = [];
  const reviews = [...d.reviews].sort((a, b) => reviewDay(a).localeCompare(reviewDay(b)));
  const fromReview = (r: ColeReport): Pick<CallRow, 'name' | 'about' | 'aboutBy' | 'link' | 'linkKind' | 'score' | 'reviewId'> => {
    const about = r.about ? r.about : r.verdict || r.summary.replace(/^Score \d+\/10 · /, '');
    return {
      name: callName(r.meetingTitle ?? '', r.callType ?? ''), about, aboutBy: r.about ? 'fathom' : about ? 'cole' : '',
      link: r.link, linkKind: r.link ? (isFathom(r.link) ? 'fathom' : 'link') : '', score: r.score, reviewId: r.id,
    };
  };
  const used = new Set<number>();
  if (d.callDate) {
    const st = d.airtableStage;
    const day = d.heldDate || d.callDate;
    const status: CallStatus = d.stages.showed ? 'Held' : st === 'Canceled' ? 'Canceled' : st === 'No Show' ? 'No-show' : st === 'Reschedule' ? 'Rescheduled' : d.callDate >= today ? 'Booked' : 'No outcome';
    // The review of this call: recorded from the day before to 3 days after (Cole reviews within a day or two).
    const match = reviews.filter((r) => { const g = gap(day, reviewDay(r)); return g >= -1 && g <= 3; }).sort((a, b) => Math.abs(gap(day, reviewDay(a))) - Math.abs(gap(day, reviewDay(b))))[0];
    const base: CallRow = { name: stageCallName(st), status, day, about: '', aboutBy: '', link: '', linkKind: '', score: null, reviewId: null };
    if (match) { used.add(match.id); const m = fromReview(match); out.push({ ...base, ...m, name: m.name || base.name, status: status === 'No outcome' || status === 'Booked' ? 'Held' : status }); }
    else out.push(base);
  }
  for (const r of reviews) {
    if (used.has(r.id)) continue;
    const m = fromReview(r);
    out.push({ ...m, name: m.name || 'Sales call', status: 'Recorded', day: reviewDay(r) });
  }
  for (const f of d.feedback) {
    if (f.newDate) out.push({ name: 'Re-booked call', status: f.newDate >= today ? 'Booked' : '', day: dayOf(f.newDate), about: '', aboutBy: '', link: '', linkKind: '', score: null, reviewId: null });
  }
  // A recording link from Call Feedback: on the call it belongs to when that call has none, else its own line.
  for (const f of d.feedback.filter((x) => x.link)) {
    if (out.some((c) => c.link === f.link)) continue;
    const fd = dayOf(f.created);
    const host = out.find((c) => !c.link && c.status !== 'Booked' && c.name !== 'Re-booked call' && fd && gap(c.day, fd) >= 0 && gap(c.day, fd) <= 5);
    const kind: CallRow['linkKind'] = isFathom(f.link) ? 'fathom' : 'link';
    if (host) { host.link = f.link; host.linkKind = kind; }
    else out.push({ name: 'Sales call', status: '', day: fd, about: f.notes ? f.notes.split(/\r?\n/)[0].slice(0, 200) : '', aboutBy: f.notes ? 'feedback' : '', link: f.link, linkKind: kind, score: null, reviewId: null });
  }
  return out.sort((x, y) => y.day.localeCompare(x.day));
}
