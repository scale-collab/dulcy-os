// Small building blocks. Everything is rendered as React text nodes (escaped); no raw HTML anywhere.
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

export function useRoute(): string[] {
  const read = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'today').split('/').map(decodeURIComponent);
  const [r, setR] = useState(read);
  useEffect(() => { const on = () => setR(read()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  return r;
}
export const go = (path: string) => { window.location.hash = `#/${path}`; };

/* ---------- Theme: system / light / dark (saved per device) ---------- */
export type ThemeMode = 'system' | 'light' | 'dark';
const readTheme = (): ThemeMode => { try { const t = localStorage.getItem('hq-theme'); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; } };
let themeMode: ThemeMode = readTheme();
const themeSubs = new Set<() => void>();
export function useTheme(): [ThemeMode, (m: ThemeMode) => void] {
  const mode = useSyncExternalStore((f) => { themeSubs.add(f); return () => { themeSubs.delete(f); }; }, () => themeMode);
  const setMode = useCallback((m: ThemeMode) => {
    try { if (m === 'system') localStorage.removeItem('hq-theme'); else localStorage.setItem('hq-theme', m); } catch { /* not saved: still applied now */ }
    if (m === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', m);
    themeMode = m; themeSubs.forEach((f) => f());
  }, []);
  return [mode, setMode];
}

/* ---------- Counts for the navigation badges (filled by pages as they load; no extra API calls) ---------- */
let counts: Record<string, number> = {};
const countSubs = new Set<() => void>();
export function setCount(key: string, n: number) { if (counts[key] === n) return; counts = { ...counts, [key]: n }; countSubs.forEach((f) => f()); }
export function useCounts(): Record<string, number> {
  return useSyncExternalStore((f) => { countSubs.add(f); return () => { countSubs.delete(f); }; }, () => counts);
}

/* ---------- Icons (inline SVG, stroke = currentColor) ---------- */
const P = (d: string) => <path d={d} />;
const ICONS: Record<string, ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4" />{P('M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41')}</>,
  moon: P('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'),
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" />{P('M8 21h8M12 17v4')}</>,
  inbox: <>{P('M22 12h-6l-2 3h-4l-2-3H2')}{P('M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z')}</>,
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  users: <>{P('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2')}<circle cx="9" cy="7" r="4" />{P('M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75')}</>,
  message: P('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
  logout: P('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'),
  arrowLeft: P('M19 12H5M12 19l-7-7 7-7'),
  arrowRight: P('M5 12h14M12 5l7 7-7 7'),
  chevronRight: P('m9 18 6-6-6-6'),
  chevronDown: P('m6 9 6 6 6-6'),
  refresh: P('M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 16h5v5'),
  plus: P('M12 5v14M5 12h14'),
  play: P('M7 4.5v15l12-7.5z'),
  pause: P('M8 4.5v15M16 4.5v15'),
  check: P('M20 6 9 17l-5-5'),
  x: P('M18 6 6 18M6 6l12 12'),
  clock: <><circle cx="12" cy="12" r="9" />{P('M12 7v5l3 2')}</>,
  external: P('M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'),
  send: P('m22 2-7 20-4-9-9-4zM22 2 11 13'),
  pen: P('M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'),
  history: P('M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2'),
  reply: P('M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v2'),
  megaphone: P('m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6'),
  wrench: P('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'),
  dollar: P('M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'),
  layers: P('m12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5'),
  sparkles: P('M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2zM19 3v4M21 5h-4'),
  file: P('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8'),
  keyboard: <><rect x="2" y="6" width="20" height="12" rx="2" />{P('M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10')}</>,
  alert: P('M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01'),
  flag: P('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7'),
  link: P('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'),
  database: P('M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'),
  undo: P('M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'),
  activity: P('M22 12h-4l-3 9L9 3l-3 9H2'),
  terminal: P('m4 17 6-6-6-6M12 19h8'),
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" />{P('M7 11V7a5 5 0 0 1 10 0v4')}</>,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" />{P('M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20')}</>,
  shield: P('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4'),
  user: <>{P('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2')}<circle cx="12" cy="7" r="4" /></>,
  userPlus: <>{P('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M19 8v6M22 11h-6')}<circle cx="9" cy="7" r="4" /></>,
  trendUp: P('m22 7-8.5 8.5-5-5L2 17M16 7h6v6'),
  trendDown: P('m22 17-8.5-8.5-5 5L2 7M16 17h6v-6'),
  key: P('M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4'),
  bell: P('M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0'),
  list: P('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'),
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" />{P('m22 7-10 6L2 7')}</>,
  film: <><rect x="2" y="5" width="15" height="14" rx="2" />{P('m17 10 5-3v10l-5-3')}</>,
  // Client portal (2026-11-26)
  home: <>{P('m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z')}{P('M9 22V12h6v10')}</>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" />{P('M16 2v4M8 2v4M3 10h18')}</>,
  phone: P('M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'),
  star: P('m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z'),
  // Voice mode (2026-11-28)
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" />{P('M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8')}</>,
  waves: P('M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4'),
  'chevron-down': P('m6 9 6 6 6-6'),
  menu: P('M4 6h16M4 12h16M4 18h16'),
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  folder: P('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'),
};

/* ---------- Clients ---------- */
export const lightTone: Record<string, Tone> = { red: 'bad', yellow: 'warn', green: 'good', inactive: 'idle' };
export const lightLabel: Record<string, string> = { red: 'Red', yellow: 'Yellow', green: 'Green', inactive: 'Inactive' };
export const usd = (x: number | null | undefined) => (x === null || x === undefined ? 'UNKNOWN' : `$${Math.round(x).toLocaleString('en-US')}`);
/** Same rule as the server (engine/src/hq/clients.ts clientKey): the name without "(…)" and a trailing Internal / Trial. "Dulcy Free Campaigns" stays its own client (Alex 2026-11-28). */
export const clientKey = (name: string) => String(name ?? '').toLowerCase().replace(/^client:\s*/, '').replace(/\([^)]*\)/g, ' ').replace(/\b(internal|trial)\s*$/g, ' ').replace(/[^a-z0-9]+/g, '');
export type IconName = keyof typeof ICONS;
export function Icon({ name, size = 18, className, strokeWidth = 1.8 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cx('shrink-0', className)}>
      {ICONS[name] ?? null}
    </svg>
  );
}

/* ---------- Agents: initial + one colour each ---------- */
export const AGENT_COLOR: Record<string, string> = {
  Ada: '#4f46e5', Atlas: '#0369a1', Scribe: '#7c3aed', Scout: '#0f766e', Echo: '#15803d',
  Riley: '#c2410c', Cole: '#be123c', Ledger: '#a16207', Sienna: '#a21caf',
};
const AGENT_FACES = ['Ada', 'Atlas', 'Scribe', 'Scout', 'Echo', 'Riley', 'Cole', 'Ledger', 'Sienna'];
export function Avatar({ name, size = 'md', className, round }: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className?: string; round?: boolean }) {
  const s = { xs: 'h-5 w-5 text-[10px] rounded-md', sm: 'h-7 w-7 text-xs rounded-lg', md: 'h-9 w-9 text-sm rounded-[10px]', lg: 'h-11 w-11 text-base rounded-xl', xl: 'h-14 w-14 text-xl rounded-2xl' }[size].replace(/rounded-\S+/, round ? 'rounded-full' : '$&');
  const bg = AGENT_COLOR[name] ?? '#57534e';
  // Agents have their own illustrated faces (Notionists by Zoish, CC0, generated once into public/agents/).
  if (AGENT_FACES.includes(name)) {
    return <img src={`${import.meta.env.BASE_URL}agents/${name.toLowerCase()}.svg`} alt="" aria-hidden="true" draggable={false} className={cx('shrink-0 select-none object-cover', s, className)} style={{ background: bg + '22' }} />;
  }
  return <span aria-hidden="true" className={cx('inline-grid shrink-0 place-items-center font-semibold text-white select-none', s, className)} style={{ background: bg }}>{(name || '?').slice(0, 1).toUpperCase()}</span>;
}

export type Tone = 'good' | 'warn' | 'bad' | 'idle';
export function StatusDot({ tone, className, label }: { tone: Tone; className?: string; label?: string }) {
  const c = { good: 'bg-dot-good', warn: 'bg-dot-warn', bad: 'bg-dot-bad', idle: 'bg-dot-idle' }[tone];
  return <span role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cx('inline-block h-2 w-2 shrink-0 rounded-full', c, className)} />;
}
/** The team check line → a tone and the text without its leading ✓ / ⚠️ / ·. */
export function teamTone(ok: boolean | null | undefined, line = ''): Tone {
  if (ok === true) return 'good';
  if (ok === false) return /failed/i.test(line) ? 'bad' : 'warn';
  return 'idle';
}
export const cleanLine = (line = '') => line.replace(/^\s*(?:⚠️|⚠|✓|✔️|·)\s*/u, '');
export const toneLabel: Record<Tone, string> = { good: 'Fine', warn: 'Needs you', bad: 'Failed', idle: 'Quiet' };

/* ---------- Surfaces ---------- */
export function Card({ children, className, onClick, label }: { children: ReactNode; className?: string; onClick?: () => void; label?: string }) {
  // A padding class (e.g. p-0 for lists) replaces the default p-5 instead of fighting it in the CSS order.
  const cls = cx('min-w-0 rounded-2xl border border-line bg-surface shadow-card', /(^|\s)p-\d/.test(className ?? '') ? '' : 'p-5', onClick && 'w-full text-left transition duration-150 hover:border-line-strong hover:shadow-pop active:scale-[0.995]', className);
  return onClick ? <button type="button" onClick={onClick} aria-label={label} className={cls}>{children}</button> : <div className={cls}>{children}</div>;
}

type BtnTone = 'primary' | 'accent' | 'quiet' | 'danger' | 'ghost';
export function Button({ children, onClick, tone = 'quiet', disabled, className, type = 'button', icon, kbd, size = 'md', title, compact }: {
  children?: ReactNode; onClick?: () => void; tone?: BtnTone; disabled?: boolean; className?: string; type?: 'button' | 'submit'; icon?: string; kbd?: string; size?: 'md' | 'lg'; title?: string;
  /** Phone width: no icon and tighter padding (for rows of three buttons). */
  compact?: boolean;
}) {
  const tones: Record<BtnTone, string> = {
    primary: 'bg-ink text-ink-fg hover:bg-ink-hover shadow-card',
    accent: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-card',
    quiet: 'border border-line-strong bg-surface text-fg hover:bg-hover',
    danger: 'border border-bad-line bg-surface text-bad hover:bg-bad-soft',
    ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
  };
  const sizes = { md: compact ? 'min-h-12 px-2 text-sm sm:px-4 sm:text-[15px] gap-2 rounded-xl' : 'min-h-11 px-4 text-[15px] gap-2 rounded-xl', lg: 'min-h-12 px-5 text-base gap-2.5 rounded-xl' };
  return (
    <button type={type} disabled={disabled} onClick={onClick} title={title}
      className={cx('inline-flex items-center justify-center whitespace-nowrap font-semibold transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45', sizes[size], tones[tone], className)}>
      {icon && <Icon name={icon} size={size === 'lg' ? 19 : 17} strokeWidth={2.1} className={compact ? 'hidden sm:block' : undefined} />}
      {children}
      {kbd && <span className="ml-1 hidden md:inline-flex"><Kbd className={tone === 'primary' || tone === 'accent' ? 'border-current/30 bg-current/10 text-current' : ''}>{kbd}</Kbd></span>}
    </button>
  );
}
export function IconButton({ icon, label, onClick, className, active }: { icon: string; label: string; onClick?: () => void; className?: string; active?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={cx('inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-hover hover:text-fg', active && 'bg-hover text-fg', className)}>
      <Icon name={icon} size={19} />
    </button>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cx('inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-sunken px-1.5 font-sans text-[11px] font-semibold leading-none text-muted', className)}>{children}</kbd>;
}

type ChipTone = 'plain' | 'good' | 'warn' | 'bad' | 'info' | 'accent';
const CHIP: Record<ChipTone, string> = {
  plain: 'bg-sunken text-fg-2 border border-line',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent-soft text-accent-ink',
};
export function Pill({ children, tone = 'plain', className, icon }: { children: ReactNode; tone?: ChipTone; className?: string; icon?: string }) {
  return <span className={cx('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', CHIP[tone], className)}>{icon && <Icon name={icon} size={12} strokeWidth={2.2} />}{children}</span>;
}
export function Count({ n, strong }: { n: number; strong?: boolean }) {
  return <span className={cx('tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold', strong && n ? 'bg-ink text-ink-fg' : 'bg-sunken text-muted border border-line')}>{n}</span>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('text-[11px] font-semibold uppercase tracking-[0.08em] text-muted', className)}>{children}</div>;
}
export function SectionHeader({ title, icon, right, className }: { title: ReactNode; icon?: string; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex min-h-6 items-center justify-between gap-3', className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">{icon && <Icon name={icon} size={16} className="text-muted" />}{title}</h2>
      {right}
    </div>
  );
}

export function Section({ label, text, quote }: { label: string; text: string; quote?: boolean }) {
  if (!text) return null;
  return (
    <div className="mt-5">
      <Label>{label}</Label>
      <div className={cx('mt-1.5 whitespace-pre-wrap text-[15px] leading-6 text-fg-2', quote && 'border-l-2 border-accent pl-3')}>{text}</div>
    </div>
  );
}

export function Progress({ done, total, className }: { done: number; total: number; className?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  return (
    <div className={className}>
      <div className="flex justify-between text-xs font-medium text-muted"><span className="tabular">{done} of {total} done</span><span className="tabular">{Math.max(0, total - done)} left</span></div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Progress">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------- Loading, errors, empty ---------- */
export function Skeleton({ className }: { className?: string }) { return <div aria-hidden="true" className={cx('skeleton', className)} />; }
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cx('rounded-2xl border border-line bg-surface p-5 shadow-card', className)}>
      <div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-[10px]" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-1/5" /></div></div>
      <div className="mt-5 space-y-2.5">{Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cx('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />)}</div>
    </div>
  );
}
/** Page-shaped placeholders while data loads (no spinners). */
export function PageSkeleton({ kind = 'list' }: { kind?: 'today' | 'list' | 'deck' | 'grid' | 'board' }) {
  return (
    <div role="status" aria-label="Loading" className="anim-fade">
      {kind === 'today' && (
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"><SkeletonCard lines={5} /><SkeletonCard lines={4} /></div>
        </div>
      )}
      {kind === 'deck' && <div className="mx-auto max-w-2xl space-y-4"><Skeleton className="h-2 w-full" /><SkeletonCard lines={7} /></div>}
      {kind === 'grid' && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} lines={2} />)}</div>}
      {kind === 'board' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} lines={4} />)}</div>}
      {kind === 'list' && <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} lines={2} />)}</div>}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
export function Loading({ what = 'Loading' }: { what?: string }) {
  return (
    <div role="status" className="grid min-h-[50dvh] place-items-center">
      <div className="flex flex-col items-center gap-4 anim-fade"><Logo className="h-10 w-10 animate-pulse" /><div className="text-sm text-muted">{what}…</div></div>
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-bad-line bg-bad-soft p-4 text-sm text-bad">
      <Icon name="alert" size={18} className="mt-px" />
      <div className="min-w-0 flex-1 break-words">{error}</div>
      {retry && <button onClick={retry} className="-my-1.5 min-h-8 shrink-0 rounded-lg px-2 font-semibold underline underline-offset-2 hover:bg-bad-soft">Try again</button>}
    </div>
  );
}
export function Empty({ icon, title, sub, children, tone = 'plain' }: { icon: string; title: string; sub?: string; children?: ReactNode; tone?: 'plain' | 'good' }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center anim-in">
      <div className={cx('grid h-14 w-14 place-items-center rounded-2xl', tone === 'good' ? 'bg-accent-soft text-accent-ink' : 'bg-sunken text-muted border border-line')}><Icon name={icon} size={26} /></div>
      <div className="mt-4 text-lg font-semibold tracking-tight">{title}</div>
      {sub && <div className="mt-1 max-w-sm text-sm text-muted">{sub}</div>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function PageTitle({ kicker, title, sub, right }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {kicker && <div className="mb-1 text-sm font-medium text-muted">{kicker}</div>}
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-fg sm:text-[28px]">{title}</h1>
        {sub && <div className="mt-1 text-[15px] text-muted">{sub}</div>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted transition hover:bg-hover hover:text-fg">
      <Icon name="arrowLeft" size={16} />{label}
    </button>
  );
}

export function Logo({ className }: { className?: string }) {
  // The real Dulcy mark (from dulcy.io), served with the app.
  return <img src={`${import.meta.env.BASE_URL}dulcy-mark.png`} alt="" aria-hidden="true" draggable={false} className={cx('shrink-0 rounded-[22%]', className)} />;
}

/* ---------- Text helpers ---------- */
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
export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (!/^https?:\/\//i.test(href)) return <>{children}</>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className={cx('font-medium text-accent-ink underline decoration-accent-ink/30 underline-offset-2 hover:decoration-accent-ink', className)}>{children}</a>;
}

function inline(text: string, key = ''): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)|\*([^*\s][^*]*)\*|`([^`]+)`/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<strong key={k} className="font-semibold text-fg">{m[1]}</strong>);
    else if (m[2]) out.push(<ExtLink key={k} href={m[3]}>{m[2]}</ExtLink>);
    else if (m[4]) out.push(<ExtLink key={k} href={m[4]}>{m[4].replace(/^https?:\/\//, '').slice(0, 40)}</ExtLink>);
    else if (m[5]) out.push(<em key={k}>{m[5]}</em>);
    else if (m[6]) out.push(<code key={k} className="rounded-md border border-line bg-surface px-1 py-px font-mono text-[0.9em] text-fg">{m[6]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
export const Inline = ({ text }: { text: string }) => <>{inline(text, 'i')}</>;

/** Small markdown: paragraphs, bullets, numbers, quotes, headings, bold, italic, links. */
export function Markdown({ text, className, small }: { text: string; className?: string; small?: boolean }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list; list = null;
    const items = L.items.map((it, i) => <li key={i} className="pl-1 marker:text-faint">{inline(it, `li${blocks.length}-${i}`)}</li>);
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
    if (h) { blocks.push(<div key={blocks.length} className="mt-5 mb-1 font-semibold text-fg first:mt-0">{inline(h[2], `h${blocks.length}`)}</div>); continue; }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) { blocks.push(<div key={blocks.length} className="my-1.5 border-l-2 border-line-strong pl-3 text-muted">{inline(q[1], `q${blocks.length}`)}</div>); continue; }
    blocks.push(<p key={blocks.length} className="my-1.5">{inline(line, `p${blocks.length}`)}</p>);
  }
  flush();
  return <div className={cx('whitespace-pre-line break-words leading-relaxed text-fg-2', small ? 'text-sm' : 'text-[15px]', className)}>{blocks}</div>;
}

/* ---------- Toast (Batch 1, 2026-11-27): a clear result for every button, with Undo when it is cheap ---------- */
export interface ToastMsg { text: string; tone?: 'good' | 'bad' | 'plain'; undo?: () => void; ms?: number }
let toastNow: (ToastMsg & { id: number }) | null = null;
let toastSeq = 0;
const toastSubs = new Set<() => void>();
/** Show one short result line (the newest replaces the last). Undo shows a button. */
export function showToast(t: ToastMsg) { toastNow = { ...t, id: ++toastSeq }; toastSubs.forEach((f) => f()); }
export function hideToast() { toastNow = null; toastSubs.forEach((f) => f()); }
/** Mounted once (App). Phone: under the header; desktop: bottom centre. */
export function Toaster() {
  const t = useSyncExternalStore((f) => { toastSubs.add(f); return () => { toastSubs.delete(f); }; }, () => toastNow);
  useEffect(() => {
    if (!t) return;
    const id = t.id;
    const timer = window.setTimeout(() => { if (toastNow?.id === id) hideToast(); }, t.ms ?? (t.undo ? 6000 : 4000));
    return () => window.clearTimeout(timer);
  }, [t]);
  if (!t) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4 md:bottom-6 md:top-auto md:pl-64">
      <div role="status" aria-live="polite" className={cx('anim-in pointer-events-auto flex min-h-12 max-w-lg items-center gap-3 rounded-2xl px-4 py-2.5 text-[15px] font-medium shadow-pop',
        t.tone === 'bad' ? 'bg-bad text-surface' : 'bg-ink text-ink-fg')}>
        <Icon name={t.tone === 'bad' ? 'alert' : t.tone === 'good' ? 'check' : 'sparkles'} size={17} strokeWidth={2.2} />
        <span className="min-w-0 flex-1">{t.text}</span>
        {t.undo && <button onClick={() => { const u = t.undo; hideToast(); u?.(); }} className="min-h-9 shrink-0 rounded-lg px-2.5 text-sm font-semibold underline-offset-2 hover:underline">Undo</button>}
        <button onClick={hideToast} aria-label="Close" className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg opacity-80 hover:opacity-100"><Icon name="x" size={15} /></button>
      </div>
    </div>
  );
}

/** Text with the given bits marked (e.g. unfilled placeholders), as escaped React text. */
export function Marked({ text, marks }: { text: string; marks: string[] }) {
  if (!marks.length) return <>{text}</>;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${marks.map(esc).join('|')})`, 'g'));
  return <>{parts.map((p, i) => (marks.includes(p) ? <mark key={i} className="rounded bg-warn-soft px-0.5 font-semibold text-warn">{p}</mark> : <span key={i}>{p}</span>))}</>;
}
