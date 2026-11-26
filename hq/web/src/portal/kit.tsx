// Small pieces every portal screen uses. Everything is plain React text (escaped); no raw HTML.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { BackLink, Card, cx, Empty, ErrorBox, go, Icon, PageSkeleton, PageTitle, Pill, StatusDot, timeAgo } from '../ui';
import type { Health } from './types';

/** A date for people: "Nov 24" (with the year when not this year). A plain date (YYYY-MM-DD) stays that day. */
export function niceDate(iso: string, opts: { weekday?: boolean } = {}): string {
  if (!iso) return '';
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(opts.weekday ? { weekday: 'short' } : {}), ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}
export const num = (x: number) => (Number.isFinite(x) ? x : 0).toLocaleString('en-US');
export const money = (x: number, currency = 'USD') => { try { return x.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }); } catch { return `$${num(Math.round(x))}`; } };
/** A rate in plain words, or "–" when there is nothing to divide by. */
export const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : '–');

export function useLoad<T>(path: string) {
  const [d, setD] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<T>(path).then(setD).catch((e) => setError(e.message)); }, [path]);
  useEffect(load, [load]);
  return { d, error, load, setD };
}

/** The standard page frame: title, then an error, a skeleton, or the content. */
export function Page<T>({ title, sub, kicker, right, state, kind = 'list', children }: {
  title: ReactNode; sub?: ReactNode; kicker?: ReactNode; right?: ReactNode;
  state: { d: T | null; error: string; load: () => void }; kind?: 'list' | 'grid' | 'today' | 'board';
  children: (d: T) => ReactNode;
}) {
  const head = <PageTitle kicker={kicker} title={title} sub={sub} right={right} />;
  if (state.error && !state.d) return <>{head}<ErrorBox error={state.error} retry={state.load} /></>;
  if (!state.d) return <>{head}<PageSkeleton kind={kind} /></>;
  return <>{head}{children(state.d)}</>;
}

export function Stat({ label, value, sub, strong, className }: { label: string; value: ReactNode; sub?: ReactNode; strong?: boolean; className?: string }) {
  return (
    <Card className={cx('p-4 sm:p-5', className)}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cx('tabular mt-1 text-[28px] font-bold leading-none tracking-tight sm:text-[34px]', strong ? 'text-accent-ink' : 'text-fg')}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

const HEALTH: Record<Health, { tone: 'good' | 'warn' | 'bad'; label: string }> = {
  healthy: { tone: 'good', label: 'Healthy' }, watching: { tone: 'warn', label: 'Watching' }, fixing: { tone: 'bad', label: 'Being fixed' },
};
export function HealthPill({ h }: { h: Health }) {
  const x = HEALTH[h];
  return <Pill tone={x.tone}><StatusDot tone={x.tone} className="h-1.5 w-1.5" />{x.label}</Pill>;
}
export function HealthLine({ h }: { h: { status: Health; text: string } }) {
  const x = HEALTH[h.status];
  return (
    <Card className="flex items-start gap-3">
      <StatusDot tone={x.tone} className="mt-1.5 h-2.5 w-2.5" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg">Deliverability: {h.text}</div>
        <div className="mt-0.5 text-sm text-muted">Deliverability means your emails land in the inbox, not in spam. We check it every day.</div>
      </div>
    </Card>
  );
}

/** A channel Dulcy has not switched on for this client: a friendly card, never a broken table. */
export function NotActive({ channel, icon, children }: { channel: string; icon: string; children?: ReactNode }) {
  return (
    <Card>
      <Empty icon={icon} title={`${channel} is not active for you yet`} sub={`When we start ${channel} for you, its results show up here.`}>{children}</Empty>
    </Card>
  );
}

export function Updated({ at, extra }: { at?: string; extra?: string }) {
  return <p className="mt-6 text-xs text-muted">{extra ? `${extra} ` : ''}Updated {timeAgo(at) || 'just now'}. Numbers refresh every minute.</p>;
}

export function Segmented<K extends string>({ value, options, onChange, label }: { value: K; options: readonly (readonly [K, ReactNode])[]; onChange: (k: K) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-sunken p-1">
      {options.map(([k, l]) => (
        <button key={k} role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={cx('min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium transition', value === k ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>{l}</button>
      ))}
    </div>
  );
}

export const inputCls = 'mt-1.5 w-full min-h-12 rounded-xl border border-line-strong bg-surface px-4 text-[16px] text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft';
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block text-sm font-medium text-fg-2">{label}{children}{hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}</label>;
}
export function TextArea({ value, onChange, rows = 4, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea className={cx(inputCls, 'py-3 leading-6')} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}
export function Choice<K extends string>({ value, options, onChange, label, columns = 2 }: { value: K | ''; options: readonly K[]; onChange: (k: K) => void; label: string; columns?: 1 | 2 | 3 }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-fg-2">{label}</legend>
      <div role="radiogroup" className={cx('mt-1.5 grid gap-2', columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>
        {options.map((o) => (
          <button type="button" key={o} role="radio" aria-checked={value === o} onClick={() => onChange(o)}
            className={cx('flex min-h-12 items-center gap-2 rounded-xl border px-3 text-left text-[15px] transition', value === o ? 'border-accent bg-accent-soft text-fg font-semibold' : 'border-line-strong bg-surface text-fg-2 hover:bg-hover')}>
            <span aria-hidden="true" className={cx('grid h-4 w-4 shrink-0 place-items-center rounded-full border', value === o ? 'border-accent bg-accent' : 'border-line-strong')}>{value === o && <span className="h-1.5 w-1.5 rounded-full bg-accent-fg" />}</span>
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
export function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-fg-2">How was the call?</legend>
      <div className="mt-1.5 flex gap-1" role="radiogroup">
        {[1, 2, 3, 4, 5].map((s) => (
          <button type="button" key={s} role="radio" aria-checked={value === s} aria-label={`${s} star${s === 1 ? '' : 's'}`} onClick={() => onChange(value === s ? 0 : s)}
            className={cx('grid h-12 w-12 place-items-center rounded-xl transition hover:bg-hover', s <= value ? 'text-warn' : 'text-faint')}>
            <Icon name="star" size={26} strokeWidth={s <= value ? 2.4 : 1.6} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
export function StarRow({ n }: { n: number }) {
  if (!n) return null;
  return <span className="inline-flex text-warn" aria-label={`${n} of 5 stars`}>{[1, 2, 3, 4, 5].map((s) => <Icon key={s} name="star" size={14} strokeWidth={s <= n ? 2.6 : 1.4} className={s <= n ? '' : 'text-faint'} />)}</span>;
}

export function Done({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center py-6 text-center anim-in">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent-ink"><Icon name="check" size={28} strokeWidth={2.4} /></span>
      <p className="mt-4 text-lg font-semibold text-fg">{title}</p>
      {sub && <p className="mt-1 max-w-sm text-sm text-muted">{sub}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function Files({ files }: { files: { name: string; href: string }[] }) {
  if (!files.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {files.map((f, i) => (
        <a key={i} href={f.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-xl border border-line bg-sunken px-3 text-sm font-medium text-fg-2 hover:bg-hover">
          <Icon name="file" size={15} /><span className="truncate">{f.name}</span>
        </a>
      ))}
    </div>
  );
}

export function Quote({ children, clamp }: { children: ReactNode; clamp?: boolean }) {
  return <blockquote className={cx('mt-3 whitespace-pre-line rounded-xl border-l-4 border-line-strong bg-sunken px-3 py-2 text-[15px] leading-relaxed text-fg-2 [overflow-wrap:anywhere]', clamp && 'line-clamp-3')}>{children}</blockquote>;
}

export function Initial({ name, className }: { name: string; className?: string }) {
  return <span aria-hidden="true" className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-sunken text-sm font-semibold text-fg-2', className)}>{(name || '?').slice(0, 1).toUpperCase()}</span>;
}

/** A way back to a tab's main screen from a page under it (Home's sub-pages, a lead, an old link). */
export const BackTo = ({ tab }: { tab: 'home' | 'leads' | 'account' }) => <BackLink label={tab === 'home' ? 'Home' : tab === 'leads' ? 'Leads' : 'Account'} onClick={() => go(tab)} />;
