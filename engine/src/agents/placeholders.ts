// Placeholder guard (Alex, 2026-11-27): an Echo draft like "here is the [video link for Artisan Luxe
// Beauty]" must never go out as is. findPlaceholders() lists every unfilled placeholder in a reply;
// the reply sender, the Decisions approve flow and Echo's drafter all refuse text that has one.
// A copy lives in hq/web/src/placeholders.ts (the Send button stays off); keep the two identical.

// Words that make a [bracketed] or <angled> bit an instruction to fill in, not normal text.
const FILL_WORDS = [
  'insert', 'add', 'your', 'my', 'their', 'his', 'her', 'link', 'links', 'url', 'video', 'loom', 'calendar', 'calendly', 'booking',
  'name', 'first', 'last', 'company', 'business', 'date', 'day', 'time', 'times', 'slot', 'phone', 'number', 'email', 'address',
  'price', 'pricing', 'cost', 'amount', 'fee', 'case', 'result', 'results', 'stat', 'stats', 'client', 'prospect', 'gap', 'todo',
  'tbd', 'tba', 'placeholder', 'here', 'fill', 'enter', 'replace', 'paste', 'put', 'website', 'site', 'title', 'city', 'industry',
  'offer', 'meeting', 'call', 'attachment', 'example', 'detail', 'details', 'something', 'xx', 'xxx',
];
const FILL_RE = new RegExp(`\\b(?:${FILL_WORDS.join('|')})\\b`, 'i');

/**
 * Every unfilled placeholder in `text`, in order, each once. Caught:
 * - {{first_name}} and {FIRST_NAME} (merge tags never filled in; spintax {a|b} is checked by the sender)
 * - [video link for X], [Your name], [GAP: price], [COMPANY], [X]: square brackets that read as an instruction
 * - <insert case study>, <your name>, <link>: angle brackets with a fill-in word
 * - a bare TBD / TODO / XXX
 * Normal brackets are left alone: (see below), [1], [sic], a markdown link [text](https://…).
 */
export function findPlaceholders(text: string): string[] {
  const s = String(text ?? '');
  const found: { at: number; m: string }[] = [];
  const add = (at: number, m: string) => found.push({ at, m: m.trim() });
  for (const m of s.matchAll(/\{\{[^{}\n]{0,200}\}\}/g)) add(m.index!, m[0]);
  for (const m of s.matchAll(/(?<!\{)\{\s*[A-Za-z_][A-Za-z0-9_ .-]{0,40}\}(?!\})/g)) add(m.index!, m[0]);
  for (const m of s.matchAll(/\[([^[\]\n]{1,160})\](?!\()/g)) {
    const inner = m[1].trim();
    if (!/[A-Za-z]/.test(inner)) continue; // [1], [2024]
    const caps = /^[A-Z0-9 _&'/-]+$/.test(inner) && /[A-Z]{1,}/.test(inner); // [COMPANY], [X], [FIRST NAME]
    if (caps || FILL_RE.test(inner) || /\.{3}|…|_{2,}/.test(inner)) add(m.index!, m[0]);
  }
  for (const m of s.matchAll(/<\s*([^<>\n]{1,120})>/g)) {
    const inner = m[1].trim();
    if (inner.includes('=')) continue; // an HTML tag with attributes
    if (/^\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?$/.test(inner) && !FILL_RE.test(inner)) continue; // <br>, <p>, <b>
    if (/^(?:https?:|mailto:)/i.test(inner) || /^[^\s@]+@[^\s@]+$/.test(inner)) continue; // <https://…>, <jane@acme.com>
    if (FILL_RE.test(inner)) add(m.index!, m[0]);
  }
  for (const m of s.matchAll(/\b(?:TBD|TODO|XXX+)\b/g)) add(m.index!, m[0]);
  // In order, each once; a match inside a longer one ([GAP: {{x}}]) counts as the longer one.
  found.sort((a, b) => a.at - b.at || b.m.length - a.m.length);
  const out: string[] = [];
  let end = -1;
  for (const f of found) {
    if (f.at < end) continue;
    end = f.at + f.m.length;
    if (!out.includes(f.m)) out.push(f.m);
  }
  return out;
}

/** One line for an error: what is unfilled and what to do. Empty when the text is clean. */
export function placeholderProblem(text: string): string {
  const p = findPlaceholders(text);
  if (!p.length) return '';
  const list = p.slice(0, 3).map((x) => `"${x.length > 80 ? `${x.slice(0, 77)}...` : x}"`).join(', ');
  return `the reply still has ${p.length === 1 ? 'a placeholder' : `${p.length} placeholders`}: ${list}${p.length > 3 ? ' and more' : ''}. Replace ${p.length === 1 ? 'it' : 'them'} before sending`;
}
