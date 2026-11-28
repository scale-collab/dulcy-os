// Small chart bits for HQ (Batch 3: bounce analytics, verification). Plain HTML/CSS, no library.
// Form (dataviz method): a distribution across categories = horizontal bars, sorted, one hue (one
// series: no legend box, the title names it), the value and share written next to each bar in text
// ink, a hover/focus tooltip per bar, recessive track. Reads as a list for screen readers.
import { cx } from './ui';

export interface BarRow { key: string; label: string; n: number; share: number }

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Sorted horizontal bars. onPick makes each row a button (e.g. filter by that campaign). */
export function BarList({ title, rows, unit = 'bounces', onPick, picked, empty = 'Nothing here.', tone = 'accent' }: {
  title: string; rows: BarRow[]; unit?: string; onPick?: (key: string) => void; picked?: string; empty?: string; tone?: 'accent' | 'bad';
}) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {!rows.length ? <p className="mt-2 text-sm text-muted">{empty}</p> : (
        <ul className="mt-3 space-y-2.5" aria-label={title}>
          {rows.map((r) => {
            const body = (
              <>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words text-fg-2 sm:truncate">{r.label}</span>
                  <span className="tabular shrink-0 text-xs text-muted"><span className="font-semibold text-fg">{r.n.toLocaleString('en-US')}</span> · {pct(r.share)}</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-sunken" aria-hidden="true">
                  <div className={cx('h-2 rounded-full', tone === 'bad' ? 'bg-bad' : 'bg-accent', picked && picked !== r.key && 'opacity-40')} style={{ width: `${Math.max(2, Math.round((r.n / max) * 100))}%` }} />
                </div>
              </>
            );
            const tip = `${r.label}: ${r.n.toLocaleString('en-US')} ${unit} (${pct(r.share)})`;
            return (
              <li key={r.key} title={tip}>
                {onPick && r.key !== 'rest'
                  ? <button onClick={() => onPick(r.key)} aria-pressed={picked === r.key} aria-label={tip} className="block w-full rounded-lg py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent sm:py-0">{body}</button>
                  : <div aria-label={tip}>{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Problem → Decision → what supports it: the one conclusion at the top of a view. */
export function Conclusion({ c }: { c: { problem: string; decision: string; support: string; tone: 'bad' | 'warn' | 'good' | 'info' } }) {
  const tone = c.tone === 'bad' ? 'border-bad-line bg-bad-soft' : c.tone === 'warn' ? 'border-warn/25 bg-warn-soft' : c.tone === 'good' ? 'border-line bg-good-soft' : 'border-line bg-sunken';
  return (
    <div className={cx('rounded-2xl border px-4 py-3.5 sm:px-5', tone)} role="status">
      <div className="text-[15px] font-semibold leading-snug text-fg">{c.problem} <span className="text-muted">→</span> {c.decision}</div>
      <div className="mt-1 text-sm text-fg-2">{c.support}</div>
    </div>
  );
}

/** A compact native dropdown that matches ClientPicker (filters are dropdowns, not chip rows). */
export function Select({ label, value, options, onChange, className }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={cx('relative inline-flex min-h-10 min-w-0 items-center', className)}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className="min-h-10 w-full min-w-0 appearance-none truncate rounded-xl border border-line bg-surface py-2 pl-3 pr-8 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-accent sm:w-auto sm:max-w-64">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" className="pointer-events-none absolute right-2.5 text-muted" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
    </label>
  );
}
