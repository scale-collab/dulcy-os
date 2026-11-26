// Tab 3, Account: "Your account" (v3, 2026-11-26). One page of plain rows; each opens a sheet (a panel
// from the bottom on the phone, from the right on a computer) with the screen it had before:
// Onboarding answers · Documents · Access & logins · Billing · Notifications · Getting started ·
// Profile & password, then the outside links (Dulcy ESP portal, Partnership info), the theme and Sign out.
// A sheet is a route (#/account/<sheet>), so Back closes it and an old link still lands on it.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Card, cx, go, Icon, IconButton, useTheme, type ThemeMode } from '../ui';
import { Access, Billing, Documents, Notifications, Onboarding, Pathway, Profile } from './More';
import type { Session } from './types';

export const SHEETS = ['onboarding', 'documents', 'access', 'billing', 'notifications', 'pathway', 'profile'] as const;
export type SheetKey = (typeof SHEETS)[number];
const ROWS: { key: SheetKey; label: string; sub: string; icon: string }[] = [
  { key: 'onboarding', label: 'Onboarding answers', sub: 'Your company, offer and ideal clients', icon: 'file' },
  { key: 'documents', label: 'Documents', sub: 'Scripts, decks and files we share', icon: 'folder' },
  { key: 'access', label: 'Access & logins', sub: 'Sending accounts and tool logins we keep for you', icon: 'key' },
  { key: 'billing', label: 'Billing', sub: 'Your invoices and payments', icon: 'dollar' },
  { key: 'notifications', label: 'Notifications', sub: "What's new", icon: 'bell' },
  { key: 'pathway', label: 'Getting started', sub: 'The steps from sign-up to your first meetings', icon: 'flag' },
  { key: 'profile', label: 'Profile & password', sub: 'Your name and password', icon: 'shield' },
];
const THEMES: { mode: ThemeMode; icon: string; label: string }[] = [{ mode: 'system', icon: 'monitor', label: 'System' }, { mode: 'light', icon: 'sun', label: 'Light' }, { mode: 'dark', icon: 'moon', label: 'Dark' }];

export function AccountTab({ session, sheet, onSignOut, onChanged, onRenamed }: {
  session: Session; sheet: SheetKey | null; onSignOut: () => void; onChanged: () => void; onRenamed: (name: string) => void;
}) {
  const [mode, setMode] = useTheme();
  const row = (inner: ReactNode, key: string, onClick?: () => void, href?: string) => href
    ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-hover sm:px-5">{inner}</a>
    : <button key={key} onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover sm:px-5">{inner}</button>;
  const label = (icon: string, l: string, sub: string, right: ReactNode) => (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-muted"><Icon name={icon} size={18} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium text-fg">{l}</span><span className="block truncate text-sm text-muted">{sub}</span></span>
      {right}
    </>
  );
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-fg sm:text-[28px]">Your account</h1>
      <p className="mb-6 mt-1 text-[15px] text-muted [overflow-wrap:anywhere]">{session.user.email} · {session.client.name}</p>
      <Card className="divide-y divide-line p-0">
        {ROWS.map((r) => row(label(r.icon, r.label, r.sub, <>
          {r.key === 'notifications' && session.badges.unread > 0 && <span className="text-sm font-medium text-accent-ink">{session.badges.unread} new</span>}
          <Icon name="chevronRight" size={16} className="text-faint" />
        </>), r.key, () => go(`account/${r.key}`)))}
      </Card>
      <Card className="mt-4 divide-y divide-line p-0">
        {row(label('external', 'Dulcy ESP portal', 'Your sending inboxes (its own login)', <Icon name="external" size={15} className="text-faint" />), 'esp', undefined, session.go.esp)}
        {row(label('external', 'Partnership info', 'Your plan and purchases', <Icon name="external" size={15} className="text-faint" />), 'partnership', undefined, session.go.partnership)}
      </Card>
      <Card className="mt-4 flex flex-wrap items-center gap-3">
        <span className="flex-1 text-[15px] font-medium text-fg">Look</span>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-sunken p-1">
          {THEMES.map((t) => (
            <button key={t.mode} role="radio" aria-checked={mode === t.mode} onClick={() => setMode(t.mode)}
              className={cx('flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition', mode === t.mode ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>
              <Icon name={t.icon} size={14} />{t.label}
            </button>
          ))}
        </div>
      </Card>
      <button onClick={onSignOut} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-[15px] font-semibold text-bad shadow-card hover:bg-bad-soft">
        <Icon name="logout" size={18} />Sign out
      </button>
      {sheet && (
        <Sheet label={ROWS.find((r) => r.key === sheet)!.label} onClose={() => go('account')}>
          {sheet === 'onboarding' && <Onboarding />}
          {sheet === 'documents' && <Documents />}
          {sheet === 'access' && <Access />}
          {sheet === 'billing' && <Billing />}
          {sheet === 'notifications' && <Notifications onChange={onChanged} />}
          {sheet === 'pathway' && <Pathway />}
          {sheet === 'profile' && <Profile session={session} onRenamed={onRenamed} />}
        </Sheet>
      )}
    </div>
  );
}

/** A panel over the Account list: from the bottom on the phone, from the right on a computer. Esc or ✕ closes. */
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const was = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = was; window.removeEventListener('keydown', key); before?.focus?.(); };
  }, [onClose]);
  // On <body>, above the bars: the page's entry animation would otherwise trap it in its own layer.
  return createPortal(
    <div className="fixed inset-0 z-40">
      <button aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/40 anim-fade" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className="sheet-panel absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl border border-line bg-bg shadow-pop outline-none md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[min(640px,100%)] md:rounded-none md:rounded-l-3xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2 sm:px-6">
          <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-line-strong md:hidden" />
          <span className="flex-1 truncate pt-1 text-sm font-semibold text-muted">Account</span>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-5 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
