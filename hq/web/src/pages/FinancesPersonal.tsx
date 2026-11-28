// Finances → Personal, linked through Plaid (Alex 2026-11-28). Read only: Alex links his own cards
// and bank accounts once with Plaid Link, then sees each account's balance, limit and, for credit
// cards, statement / minimum / due date. Nothing here moves money. The server keeps the Plaid login
// (sealed); this page only ever gets balances.
import { useCallback, useEffect, useState } from 'react';
import { api, type PersonalAccount, type PersonalConnection, type PersonalData } from '../api';
import { Button, Card, cx, IconButton, SectionHeader, showToast, Skeleton, timeAgo, usd } from '../ui';
import { slashDate } from '../dates';

const PLAID_SRC = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
interface PlaidHandler { open(): void; destroy(): void }
interface PlaidExitError { error_code?: string; error_message?: string; display_message?: string | null }
declare global {
  interface Window {
    Plaid?: { create(o: { token: string; onSuccess: (publicToken: string, metadata: { institution?: { name?: string } | null }) => void; onExit: (err: PlaidExitError | null) => void }): PlaidHandler };
  }
}
let loading: Promise<void> | null = null;
/** Plaid's own Link script, loaded once, only when Alex presses Connect. */
function loadPlaid(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PLAID_SRC; s.async = true;
      s.onload = () => (window.Plaid ? resolve() : reject(new Error('Plaid did not load. Try again.')));
      s.onerror = () => { loading = null; s.remove(); reject(new Error('Plaid did not load. Check the connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** The linked accounts (and the Connect button). onData tells the page which sheet rows they replace. */
export default function PersonalPlaid({ tick, onData }: { tick: number; onData: (d: PersonalData | null) => void }) {
  const [d, setD] = useState<PersonalData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'load' | 'connect' | number>('load');
  const load = useCallback((refresh = false) => {
    setBusy('load'); setError('');
    api<PersonalData>(`/finances/personal${refresh ? '?refresh=1' : ''}`).then((x) => { setD(x); onData(x); })
      .catch((e) => { setError((e as Error).message); onData(null); }).finally(() => setBusy(''));
  }, [onData]);
  useEffect(() => { load(tick > 0); }, [load, tick]);

  const connect = async () => {
    setBusy('connect');
    try {
      const { linkToken } = await api<{ linkToken: string }>('/finances/personal/link-token', { body: {} });
      await loadPlaid();
      const h = window.Plaid!.create({
        token: linkToken,
        onSuccess: (publicToken, metadata) => {
          const institution = metadata?.institution?.name ?? '';
          api<{ institution: string }>('/finances/personal/connect', { body: { publicToken, institution } })
            .then((r) => { showToast({ tone: 'good', text: `${r.institution || 'Account'} connected.` }); load(); })
            .catch((e) => { showToast({ tone: 'bad', text: (e as Error).message }); setBusy(''); })
            .finally(() => h.destroy());
        },
        onExit: (err) => {
          if (err) showToast({ tone: 'bad', text: err.display_message || err.error_message || 'Plaid closed before the account was linked.' });
          setBusy(''); h.destroy();
        },
      });
      h.open();
    } catch (e) { showToast({ tone: 'bad', text: (e as Error).message }); setBusy(''); }
  };
  const remove = async (c: PersonalConnection) => {
    if (!window.confirm(`Remove ${c.institution || 'this connection'}? HQ stops reading it, and the login is ended at Plaid. You can connect it again later.`)) return;
    setBusy(c.id);
    try {
      const r = await api<{ note?: string }>(`/finances/personal/${c.id}/remove`, { body: {} });
      showToast({ tone: 'good', text: r.note ?? `${c.institution || 'Connection'} removed.` });
      load();
    } catch (e) { showToast({ tone: 'bad', text: (e as Error).message }); setBusy(''); }
  };

  const right = d?.configured ? <IconButton icon="refresh" label="Refresh balances" onClick={() => load(true)} className={cx(busy === 'load' && '[&_svg]:animate-spin')} /> : undefined;

  // No Plaid keys on the server: one line, and the P/L sheet figures below stay as they are.
  if (d && !d.configured) return <p className="text-sm text-muted">{d.message}</p>;
  return (
    <section>
      <SectionHeader title="Linked cards and banks" icon="link" right={right} />
      {!d && !error && <Card><Skeleton className="h-5 w-48" /><Skeleton className="mt-3 h-4 w-full" /></Card>}
      {error && !d && <Card className="text-sm text-warn">Linked accounts not read: {error}</Card>}
      {d?.configured && (
        <div className="space-y-3">
          <Button tone="primary" icon="plus" onClick={connect} disabled={busy !== ''} className="w-full sm:w-auto">{busy === 'connect' ? 'Opening Plaid…' : 'Connect a card or bank'}</Button>
          {d.env === 'sandbox' && <p className="text-xs text-warn">Plaid test mode (sandbox): these are not real accounts.</p>}
          {d.totals && d.connections.some((c) => c.accounts.length) && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Card balances" v={usd(d.totals.cardBalance)} sub={`${d.totals.cards} card${d.totals.cards === 1 ? '' : 's'}`} />
              <Tile label="Statements" v={usd(d.totals.statement)} sub="last statement" />
              <Tile label="Minimums due" v={usd(d.totals.minimum)} />
              <Tile label="Cash" v={usd(d.totals.cash)} sub="bank accounts" />
            </div>
          )}
          {!d.connections.length && <Card className="text-sm text-muted">No card or bank linked yet. Press Connect a card or bank and log in to Robinhood, Discover or your bank.</Card>}
          {d.connections.map((c) => (
            <Card key={c.id} className="p-0">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-fg">{c.institution || 'Linked account'}</div>
                  <div className="text-xs text-muted">Linked {slashDate(c.linkedAt)}</div>
                </div>
                <Button tone="danger" onClick={() => remove(c)} disabled={busy !== ''} compact>{busy === c.id ? 'Removing…' : 'Remove'}</Button>
              </div>
              {c.error ? <p className="px-4 py-3 text-sm text-warn sm:px-5">{c.error}</p> : (
                <ul className="divide-y divide-line">{c.accounts.map((a, i) => <Account key={i} a={a} />)}</ul>
              )}
            </Card>
          ))}
          <p className="text-xs text-muted">Read {timeAgo(d.readAt) || 'just now'} from Plaid (read only); kept for 1 hour.</p>
        </div>
      )}
    </section>
  );
}

const KIND: Record<string, string> = { credit: 'Card', depository: 'Bank', loan: 'Loan', investment: 'Investing' };
function Account({ a }: { a: PersonalAccount }) {
  const card = a.type === 'credit';
  const stats: { label: string; v: string; bad?: boolean }[] = [{ label: card ? 'Balance owed' : 'Balance', v: usd(a.current) }];
  if (a.limit !== null) stats.push({ label: 'Credit limit', v: usd(a.limit) });
  if (a.available !== null && !card) stats.push({ label: 'Available', v: usd(a.available) });
  if (a.statement !== null) stats.push({ label: 'Statement', v: usd(a.statement) });
  if (a.minimum !== null) stats.push({ label: 'Minimum', v: usd(a.minimum) });
  if (a.due) stats.push({ label: a.overdue ? 'Late since' : 'Due', v: slashDate(a.due), bad: a.overdue === true });
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-fg">{a.name}{a.mask ? ` ••${a.mask}` : ''}</span>
        <span className="shrink-0 text-xs text-muted">{KIND[a.type] ?? (a.subtype || a.type)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate text-xs text-muted">{s.label}</dt>
            <dd className={cx('tabular text-[15px] font-semibold', s.bad ? 'text-bad' : 'text-fg')}>{s.v}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function Tile({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="text-xs font-medium text-muted max-sm:leading-snug sm:truncate">{label}</div>
      <div className="tabular mt-1 text-[24px] font-bold leading-none tracking-tight text-fg">{v}</div>
      {sub && <div className="mt-1.5 text-xs text-muted max-sm:leading-snug sm:truncate">{sub}</div>}
    </div>
  );
}
