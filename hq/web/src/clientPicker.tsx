// One client dropdown for every HQ screen (Alex, 2026-11-27): a dropdown, not a row of buttons; it
// remembers the last choice per screen; only ACTIVE clients are offered (the screen's API decides
// which clients are active and passes only those in `options`).
import { useEffect } from 'react';
import { cx, Icon } from './ui';

export interface ClientOption { key: string; name: string; count?: number }

const read = (k: string): string => { try { return localStorage.getItem(`hq.client.${k}`) ?? ''; } catch { return ''; } };
const write = (k: string, v: string) => { try { if (v) localStorage.setItem(`hq.client.${k}`, v); else localStorage.removeItem(`hq.client.${k}`); } catch { /* private window */ } };

/** The client to start with on a screen: the URL's choice, else the last one saved for this screen. */
export function rememberedClient(screen: string, fromUrl: string | undefined): string {
  return fromUrl || read(screen);
}

export function ClientPicker({ screen, value, options, onChange, allLabel = 'All active clients', className }: {
  /** Storage key, e.g. "campaigns". */ screen: string;
  value: string; options: ClientOption[]; onChange: (key: string) => void; allLabel?: string; className?: string;
}) {
  // A saved client that is no longer active falls back to "all".
  useEffect(() => { if (value && options.length && !options.some((o) => o.key === value)) onChange(''); }, [value, options, onChange]);
  return (
    <label className={cx('relative inline-flex min-h-10 items-center', className)}>
      <span className="sr-only">Client</span>
      <Icon name="briefcase" size={16} className="pointer-events-none absolute left-3 text-muted" />
      <select value={value} onChange={(e) => { write(screen, e.target.value); onChange(e.target.value); }}
        className="min-h-10 w-full appearance-none rounded-xl border border-line bg-surface py-2 pl-9 pr-9 text-sm font-medium text-fg focus:outline-none focus:ring-2 focus:ring-accent sm:w-64">
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.key} value={o.key}>{o.name}{typeof o.count === 'number' ? ` (${o.count})` : ''}</option>)}
      </select>
      <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-3 text-muted" />
    </label>
  );
}
