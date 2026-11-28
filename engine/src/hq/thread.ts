// HQ Inbox thread view (Alex 2026-11-27: "thread history is hard to read (spacing, can't tell email
// 1/2/3)"). Turns the Emails "Conversation History" text into one clean timeline, oldest first:
//   - each message with its sender, email and date; the prospect's messages apart from ours;
//   - quoted history split off (the page folds it under "Show earlier quoted text");
//   - our cold sequence emails (usually only inside the prospect's quoted text) pulled out and
//     labelled Email 1 / Email 2 / Email 3 from the campaign's own step copy (Campaigns table);
//     when the copy can't be matched, by the order they were sent.
// Everything here is pure: no reads, no writes.

/** One message of the timeline. */
export interface ThreadMsg {
  who: 'them' | 'us' | 'unknown';
  name: string; email: string;
  /** ISO time ('' = unknown). Times in quoted headers carry no zone: read as UTC, so ± a few hours. */
  at: string;
  body: string; quoted: string;
  /** sequence = one of our cold campaign emails; reply = a message after the prospect first answered. */
  kind: 'sequence' | 'reply' | 'message';
  /** Email N of the campaign (null = not a sequence email, or the step is not known). */
  step: number | null;
  /** copy = matched to the campaign's step copy; order = numbered by send order (no copy to match). */
  stepFrom: 'copy' | 'order' | null;
  /** The prospect's latest message (the one Echo answers). */
  latest: boolean;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
const DATE_RE = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:,?\s*(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/;

/** "Nov 25, 2026, 6:39 PM UTC" / "Tue, Nov 24, 2026 at 10:35 AM" / "Wed, Nov 11, 2026 11:33:15 AM" → ISO ('' = none). Pure. */
export function parseLooseDate(raw: string): string {
  const m = DATE_RE.exec(String(raw ?? ''));
  if (!m) return '';
  const mon = MONTHS[m[1].toLowerCase().slice(0, m[1].toLowerCase() === 'sept' ? 4 : 3)];
  if (mon === undefined) return '';
  let h = m[4] ? Number(m[4]) : 12;
  const min = m[5] ? Number(m[5]) : 0, sec = m[6] ? Number(m[6]) : 0;
  if (m[7]) { const pm = /p/i.test(m[7]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  const t = Date.UTC(Number(m[3]), mon, Number(m[2]), h, min, sec);
  return Number.isFinite(t) && h < 24 && min < 60 ? new Date(t).toISOString() : '';
}

const clean = (s: string) => s.replace(/mailto:[^\s>)\]]*/gi, '').replace(/ /g, ' ');
const emailOf = (s: string) => (EMAIL_RE.exec(clean(s))?.[0] ?? '').toLowerCase();
const norm = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[│>]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Where quoted history starts in a message body. */
const QUOTE_START = /^(?:On\s[^\n]+(?:\n[^\n]*)?wrote:|[>│]|-{3,}\s*Original Message|_{8,}\s*$|From:\s.+\nSent:\s|[▃━─=]{6,}\s*\n+From:\s)/m;
function splitQuoted(b: string): { body: string; quoted: string } {
  const m = QUOTE_START.exec(b);
  return { body: (m ? b.slice(0, m.index) : b).trim().slice(0, 8000), quoted: m ? b.slice(m.index).trim().slice(0, 12000) : '' };
}

const HEAD = /^([^\n]{1,200}?)\s·\s(Received|Sent|Provider time)\s+([^\n]*)\n|^([^\n]{1,200}?)\s·\sTime unavailable\s*\n/;
const LABEL = /^(Reply|Received|Prospect|SENT|Sent|Our reply|Dulcy)\s*:\s*\n?/i;
const SEPARATOR = /\n[ \t]*[▃━─=]{6,}[ \t]*(?=\n|$)/;

interface Raw { who: ThreadMsg['who']; name: string; email: string; at: string; text: string; canonical: boolean }

/**
 * The history text → messages in the order of the text. Canonical entries ("<sender> · Received <date>")
 * and the old labelled blocks ("Reply:", "SENT:") both work. A separator line inside a message (an
 * Outlook "From: … Sent: …" quote) does not start a new message. Pure.
 */
export function historyBlocks(history: string, prospectEmail = ''): Raw[] {
  const text = `\n${String(history ?? '').replace(/\r\n/g, '\n').trim()}\n`;
  const prospect = prospectEmail.trim().toLowerCase();
  const out: Raw[] = [];
  for (const part of text.split(SEPARATOR)) {
    let b = part.replace(/^\n+/, '').replace(/\s+$/, '');
    if (!b.trim()) continue;
    const head = HEAD.exec(`${b}\n`);
    const label = LABEL.exec(b);
    if (head) {
      const sender = (head[1] ?? head[4] ?? '').trim(), kind = head[2] ?? '';
      const email = emailOf(sender);
      const name = clean(sender).replace(EMAIL_RE, '').replace(/[<>]/g, '').trim() || email;
      const who: Raw['who'] = kind === 'Received' ? 'them' : kind === 'Sent' ? 'us' : prospect && email ? (email === prospect ? 'them' : 'us') : 'unknown';
      b = `${b}\n`.slice(head[0].length).trim();
      if (b) out.push({ who, name, email, at: head[3] ? parseLooseDate(head[3]) : '', text: b, canonical: true });
    } else if (label) {
      const who: Raw['who'] = /^(reply|received|prospect)$/i.test(label[1]) ? 'them' : 'us';
      b = b.slice(label[0].length).trim();
      if (b) out.push({ who, name: '', email: '', at: '', text: b, canonical: false });
    } else if (out.length && out[out.length - 1].canonical) {
      // A separator line inside a message (Outlook quote): it belongs to the message above.
      out[out.length - 1].text += `\n\n──────────\n\n${b.trim()}`;
    } else out.push({ who: 'unknown', name: '', email: '', at: '', text: b.trim(), canonical: false });
  }
  return out;
}

export interface Quoted { name: string; email: string; at: string; body: string }

/**
 * The emails inside a message's quoted history ("On <date> <name> <email> wrote:" and Outlook
 * "From: / Sent:" headers), outermost first. Quote marks (│ >) are dropped. Pure.
 */
export function quoteChain(quoted: string): Quoted[] {
  const lines = clean(String(quoted ?? '').replace(/\r\n/g, '\n')).split('\n').map((l) => l.replace(/^(?:[ \t]*[│>|][ \t]?)+/, '').replace(/[ \t]+$/, ''));
  // Wrapped headers: "On Tue, Nov 24, 2026 at 10:35 AM Ryan Labrie <" + "ryan@x.com> wrote:"
  const flat = `\n${lines.join('\n')}`.replace(/\n(On [^\n]{4,240})\n([^\n]{0,240}wrote:)/g, (all, a: string, b: string) => (/wrote:\s*$/.test(a) ? all : `\n${a} ${b}`));
  const heads: { at: number; end: number; name: string; email: string; date: string }[] = [];
  const onRe = /^On ([^\n]{4,400}?)\s*wrote:[ \t]*$/gm;
  for (let m; (m = onRe.exec(flat));) {
    const h = m[1];
    const email = emailOf(h);
    const dm = DATE_RE.exec(h);
    let name = h.replace(DATE_RE, '').replace(EMAIL_RE, '').replace(/[<>]/g, '').replace(/^[\s,]+|[\s,]+$/g, '').replace(/^\w{3},?\s*/, (x) => (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(x) ? '' : x)).trim();
    name = name.replace(/^[\s,]+|[\s,]+$/g, '');
    heads.push({ at: m.index, end: m.index + m[0].length, name: name || email, email, date: dm ? parseLooseDate(dm[0]) : '' });
  }
  const fromRe = /^From:[ \t]*([^\n]+)\nSent:[ \t]*([^\n]+)\n(?:To:[^\n]*\n)?(?:Cc:[^\n]*\n)?(?:Subject:[^\n]*\n)?/gm;
  for (let m; (m = fromRe.exec(flat));) {
    const email = emailOf(m[1]);
    heads.push({ at: m.index, end: m.index + m[0].length, name: m[1].replace(EMAIL_RE, '').replace(/[<>]/g, '').trim() || email, email, date: parseLooseDate(m[2]) });
  }
  heads.sort((a, b) => a.at - b.at);
  return heads.map((h, i) => {
    const raw = flat.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : undefined);
    const body = raw.replace(/\n[ \t]*[▃━─=]{6,}[ \t]*\n?\s*$/, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
    return { name: h.name, email: h.email, at: h.date, body };
  }).filter((q) => q.body);
}

// ---------- Email 1 / 2 / 3 from the campaign's step copy ----------
export interface StepCopy { step: number; texts: string[] }

/** The Campaigns row (cells by field name) → each step's copy texts (every version and spintax). Pure. */
export function stepCopies(cells: Record<string, unknown>): StepCopy[] {
  const out: StepCopy[] = [];
  const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '').trim();
  for (let s = 1; s <= 4; s++) {
    const names = [`Campaign Email ${s} Body`];
    for (let v = 1; v <= 10; v++) names.push(`Campaign Body ${s} Version ${v}`, `Campaign Email ${s} Body Spintax ${v}`);
    const texts = [...new Set(names.map((n) => str(cells[n])).filter(Boolean))];
    if (texts.length) out.push({ step: s, texts });
  }
  return out;
}

const STOP = new Set(['the', 'and', 'you', 'your', 'for', 'that', 'this', 'with', 'are', 'can', 'our', 'was', 'have', 'has', 'not', 'but', 'its', 'it’s', "it's", 'from', 'they', 'them', 'what', 'would', 'could', 'like', 'just']);
/** Words of a copy text: {FIRST_NAME}-style variables dropped, every spintax option kept. Pure. */
export function copyWords(text: string): Set<string> {
  const t = String(text ?? '').replace(/\\_/g, '_').replace(/\{[A-Z0-9_ ]+\}/g, ' ').replace(/[{}|]/g, ' ').toLowerCase();
  return new Set((t.match(/[a-z0-9$][a-z0-9$’'.,-]*[a-z0-9]/g) ?? []).map((w) => w.replace(/[.,]+$/, '')).filter((w) => w.length >= 3 && !STOP.has(w)));
}

/**
 * Which campaign step an email is (null = no clear match). Score = share of the email's words found
 * in the step's copy; the best step must reach 45% and beat the next step by 8 points. Pure.
 */
export function matchStep(body: string, copies: StepCopy[]): number | null {
  const words = copyWords(body.split(/\n--\s*\n|\nP\.?S\.?\b/i)[0]);
  if (words.size < 4 || !copies.length) return null;
  const scored = copies.map((c) => {
    let best = 0;
    for (const t of c.texts) { const cw = copyWords(t); let hit = 0; for (const w of words) if (cw.has(w)) hit++; best = Math.max(best, hit / words.size); }
    return { step: c.step, score: best };
  }).sort((a, b) => b.score - a.score);
  const [a, b] = scored;
  return a.score >= 0.45 && (!b || a.score - b.score >= 0.08) ? a.step : null;
}

/**
 * Email N labels for our sequence emails (oldest first). Matched to the campaign copy when it can be;
 * when no email matches any copy (or there is no copy), numbered by send order. A mix keeps only
 * the matched numbers (a guess next to a real number would mislead). Pure.
 */
export function emailStepLabels(emails: { body: string }[], copies: StepCopy[]): { step: number | null; stepFrom: ThreadMsg['stepFrom'] }[] {
  const matched = emails.map((e) => matchStep(e.body, copies));
  if (matched.some((x) => x !== null)) return matched.map((s) => ({ step: s, stepFrom: s === null ? null : 'copy' }));
  return emails.map((_, i) => ({ step: i + 1, stepFrom: 'order' }));
}

// ---------- The timeline ----------
const MIN = 60_000;
const sameText = (a: string, b: string) => { const x = norm(a).slice(0, 160), y = norm(b).slice(0, 160); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };

/**
 * The whole thread, oldest first: our sequence emails (labelled Email N), then every message, the
 * prospect's latest one marked. `latest` (the Latest Reply cell) is added when the history lacks it. Pure.
 */
export function buildTimeline(history: string, o: { prospectEmail?: string; latest?: string; latestAt?: string; copies?: StepCopy[] } = {}): ThreadMsg[] {
  const prospect = (o.prospectEmail ?? '').trim().toLowerCase();
  const blocks = historyBlocks(history, prospect);
  // Canonical entries are written newest first, the old labelled blocks oldest first (and older).
  const legacy = blocks.filter((b) => !b.canonical), canon = blocks.filter((b) => b.canonical).reverse();
  let msgs: ThreadMsg[] = [...legacy, ...canon].map((b) => ({ who: b.who, name: b.name, email: b.email, at: b.at, ...splitQuoted(b.text), kind: 'message', step: null, stepFrom: null, latest: false }));
  if (msgs.length && msgs.every((m) => m.at)) msgs = msgs.map((m, i) => ({ m, i })).sort((a, b) => a.m.at.localeCompare(b.m.at) || a.i - b.i).map((x) => x.m);
  msgs = msgs.filter((m) => m.body || m.quoted);
  // Drop exact repeats (the same message admitted twice).
  msgs = msgs.filter((m, i) => !msgs.slice(0, i).some((p) => p.who === m.who && sameText(p.body, m.body) && (!p.at || !m.at || Math.abs(Date.parse(p.at) - Date.parse(m.at)) < 5 * MIN)));

  // The prospect's latest message: in the history, or added from the Latest Reply cell.
  const latestText = String(o.latest ?? '').trim();
  if (latestText) {
    const lb = splitQuoted(latestText.replace(/\r\n/g, '\n'));
    const at = o.latestAt ? (Number.isFinite(Date.parse(o.latestAt)) ? new Date(o.latestAt).toISOString() : '') : '';
    let hit = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.who === 'us') continue;
      if (sameText(m.body, lb.body) || (at && m.at && Math.abs(Date.parse(m.at) - Date.parse(at)) < 3 * MIN)) { hit = i; break; }
    }
    if (hit >= 0) { msgs[hit].latest = true; if (msgs[hit].who === 'unknown') msgs[hit].who = 'them'; }
    else msgs.push({ who: 'them', name: '', email: prospect, at, ...lb, kind: 'message', step: null, stepFrom: null, latest: true });
  }
  for (const m of msgs) if (m.who === 'unknown' && prospect && m.email) m.who = m.email === prospect ? 'them' : 'us';

  // Who is "us": senders of our messages; anyone else not on the prospect's side (their colleagues too).
  const usEmails = new Set(msgs.filter((m) => m.who === 'us' && m.email).map((m) => m.email));
  const themEmails = new Set(msgs.filter((m) => m.who === 'them' && m.email).map((m) => m.email));
  if (prospect) themEmails.add(prospect);
  const theirDomains = new Set([...themEmails].map((e) => e.split('@')[1]).filter((d) => d && !/^(gmail|yahoo|outlook|hotmail|icloud|aol)\./.test(d)));
  const isUs = (email: string) => !!email && (usEmails.has(email) || (!themEmails.has(email) && !theirDomains.has(email.split('@')[1])));

  // Our cold emails: everything we sent before the prospect's first message, from the quoted history.
  const firstThem = msgs.findIndex((m) => m.who !== 'us');
  const firstAt = firstThem >= 0 ? msgs[firstThem].at : '';
  const before = (at: string) => !firstAt || !at || Date.parse(at) < Date.parse(firstAt);
  const seq: ThreadMsg[] = [];
  const topSeq = msgs.slice(0, firstThem < 0 ? msgs.length : firstThem).filter((m) => m.who === 'us');
  for (const m of msgs) {
    for (const q of quoteChain(m.quoted)) {
      if (!isUs(q.email) || !q.at || !before(q.at)) continue;
      const dup = [...seq, ...topSeq].some((s) => sameText(s.body, q.body) || (s.at && Math.abs(Date.parse(s.at) - Date.parse(q.at)) < 2 * MIN));
      if (!dup) seq.push({ who: 'us', name: q.name, email: q.email, at: q.at, body: q.body, quoted: '', kind: 'sequence', step: null, stepFrom: null, latest: false });
    }
  }
  for (const m of topSeq) m.kind = 'sequence';
  const seqMsgs = [...seq, ...topSeq].map((m, i) => ({ m, i })).sort((a, b) => (a.m.at && b.m.at ? a.m.at.localeCompare(b.m.at) : 0) || a.i - b.i).map((x) => x.m);
  emailStepLabels(seqMsgs, o.copies ?? []).forEach((l, i) => { seqMsgs[i].step = l.step; seqMsgs[i].stepFrom = l.stepFrom; });
  const rest = msgs.filter((m) => m.kind !== 'sequence');
  for (const m of rest) m.kind = 'reply';
  return [...seqMsgs, ...rest];
}
