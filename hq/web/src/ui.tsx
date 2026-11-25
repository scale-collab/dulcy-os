// Small building blocks. Everything is rendered as React text nodes (escaped); no raw HTML anywhere.
import { useEffect, useState, type ReactNode } from 'react';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

export function useRoute(): string[] {
  const read = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'today').split('/').map(decodeURIComponent);
  const [r, setR] = useState(read);
  useEffect(() => { const on = () => setR(read()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  return r;
}
export const go = (path: string) => { window.location.hash = `#/${path}`; };

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const cls = cx('rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-white/[0.04]', onClick && 'w-full text-left transition hover:border-stone-300 active:scale-[0.995] dark:hover:border-white/20', className);
  return onClick ? <button type="button" onClick={onClick} className={cls}>{children}</button> : <div className={cls}>{children}</div>;
}

type Tone = 'primary' | 'quiet' | 'danger' | 'good';
export function Button({ children, onClick, tone = 'quiet', disabled, className, type = 'button' }: { children: ReactNode; onClick?: () => void; tone?: Tone; disabled?: boolean; className?: string; type?: 'button' | 'submit' }) {
  const tones: Record<Tone, string> = {
    primary: 'bg-stone-900 text-white hover:bg-stone-800 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200',
    good: 'bg-accent text-white hover:brightness-110',
    danger: 'border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-400/40 dark:text-red-300 dark:hover:bg-red-400/10',
    quiet: 'border border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-white/15 dark:text-stone-200 dark:hover:bg-white/5',
  };
  return <button type={type} disabled={disabled} onClick={onClick} className={cx('min-h-12 rounded-xl px-4 py-3 text-[15px] font-semibold transition disabled:opacity-40', tones[tone], className)}>{children}</button>;
}

export function Pill({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'good' | 'warn' | 'bad' }) {
  const t = { plain: 'bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-stone-300', good: 'bg-accent-soft text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300', warn: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300', bad: 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300' }[tone];
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', t)}>{children}</span>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{children}</div>;
}

export function Section({ label, text, quote }: { label: string; text: string; quote?: boolean }) {
  if (!text) return null;
  return (
    <div className="mt-4">
      <Label>{label}</Label>
      <div className={cx('mt-1.5 whitespace-pre-wrap text-[15px] leading-6 text-stone-800 dark:text-stone-200', quote && 'border-l-4 border-accent pl-3')}>{text}</div>
    </div>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  return (
    <div>
      <div className="flex justify-between text-xs text-stone-500 dark:text-stone-400"><span>{done} of {total} done</span><span>{Math.max(0, total - done)} left</span></div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-stone-200 dark:bg-white/10"><div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <div className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">{what}…</div>;
}
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-400/10 dark:text-red-300">{error}{retry && <> · <button className="underline" onClick={retry}>Try again</button></>}</div>;
}
export function Empty({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return <div className="py-14 text-center"><div className="text-4xl">{icon}</div><div className="mt-3 text-lg font-semibold">{title}</div>{sub && <div className="mt-1 text-sm text-stone-500 dark:text-stone-400">{sub}</div>}</div>;
}

export function PageTitle({ kicker, title, right }: { kicker?: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>{kicker && <div className="text-sm text-stone-500 dark:text-stone-400">{kicker}</div>}<h1 className="text-2xl font-bold tracking-tight">{title}</h1></div>
      {right}
    </div>
  );
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}
export function dueLabel(due: string): string {
  if (!due) return '';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const d = due.slice(0, 10);
  const diff = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff < 0) return `${-diff} d overdue`;
  if (diff === 0) return 'due today';
  if (diff === 1) return 'due tomorrow';
  return `due ${new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** Safe link: only http(s), opens in a new tab without the opener. */
export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  if (!/^https?:\/\//i.test(href)) return <>{children}</>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline decoration-accent/30 underline-offset-2">{children}</a>;
}

function inline(text: string, key = ''): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)|\*([^*\s][^*]*)\*/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<strong key={k} className="font-semibold">{m[1]}</strong>);
    else if (m[2]) out.push(<ExtLink key={k} href={m[3]}>{m[2]}</ExtLink>);
    else if (m[4]) out.push(<ExtLink key={k} href={m[4]}>{m[4].replace(/^https?:\/\//, '').slice(0, 40)}</ExtLink>);
    else if (m[5]) out.push(<em key={k}>{m[5]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Small markdown: paragraphs, bullets, numbers, quotes, headings, bold, italic, links. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list; list = null;
    const items = L.items.map((it, i) => <li key={i} className="pl-1">{inline(it, `li${blocks.length}-${i}`)}</li>);
    blocks.push(L.ordered ? <ol key={blocks.length} className="my-2 list-decimal space-y-1 pl-5">{items}</ol> : <ul key={blocks.length} className="my-2 list-disc space-y-1 pl-5">{items}</ul>);
  };
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const bullet = /^\s*(?:[•\-*]|•)\s+(.*)$/.exec(line);
    const num = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = !!num && !bullet;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ? bullet[1] : num![2]));
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += `\n${line.trim()}`; continue; }
    flush();
    if (!line.trim()) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { blocks.push(<div key={blocks.length} className="mt-4 mb-1 font-semibold">{inline(h[2], `h${blocks.length}`)}</div>); continue; }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) { blocks.push(<div key={blocks.length} className="my-1 border-l-4 border-stone-300 pl-3 text-stone-600 dark:border-white/20 dark:text-stone-300">{inline(q[1], `q${blocks.length}`)}</div>); continue; }
    blocks.push(<p key={blocks.length} className="my-1.5">{inline(line, `p${blocks.length}`)}</p>);
  }
  flush();
  return <div className={cx('whitespace-pre-line text-[15px] leading-6', className)}>{blocks}</div>;
}

export const AGENT_EMOJI: Record<string, string> = { Ada: '🧭', Atlas: '🚀', Scribe: '✍️', Scout: '🔎', Sean: '💬', Riley: '🛠️', Cole: '🎯', Ledger: '💵', Sienna: '🎬' };
