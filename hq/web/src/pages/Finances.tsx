// Round 4 (Alex 2026-11-28): Finances, its own menu item (owner only; the server answers 403 to
// members). Company = income and costs from Xero (the tool, not the hand-kept P/L sheet), open
// client invoices, and the business cards. Personal = Alex's own cards (Robinhood, Discover).
// Read only: nothing on this screen writes to Xero, the sheet or Airtable.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type FinanceCard, type FinanceMonth, type FinancesData, type User } from '../api';
import { Card, cx, Empty, ErrorBox, go, IconButton, PageSkeleton, PageTitle, SectionHeader, timeAgo, usd } from '../ui';
import { slashDate } from '../dates';
import PersonalPlaid from './FinancesPersonal';
import type { PersonalData } from '../api';

type View = 'company' | 'personal';
const VIEWS: { key: View; label: string }[] = [{ key: 'company', label: 'Company' }, { key: 'personal', label: 'Personal' }];

/** #/finances · #/finances/personal */
export default function Finances({ user, a }: { user: User; a?: string }) {
  const view: View = a === 'personal' ? 'personal' : 'company';
  const [d, setD] = useState<FinancesData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Bumped by the page Refresh: the Personal tab rereads Plaid too.
  const [tick, setTick] = useState(0);
  const load = useCallback((refresh = false) => {
    setBusy(true); setError('');
    api<FinancesData>(`/finances${refresh ? '?refresh=1' : ''}`).then(setD)
      .catch((e) => setError(e instanceof ApiError && e.status === 403 ? 'Not available.' : e.message)).finally(() => setBusy(false));
  }, []);
  useEffect(() => { if (user.role === 'owner') load(); }, [load, user.role]);
  if (user.role !== 'owner') return <><PageTitle title="Finances" /><Card><Empty icon="lock" title="Not available" /></Card></>;
  const title = (
    <PageTitle title="Finances" kicker={view === 'company' ? 'Dulcy Media LLC' : 'Personal'} sub={view === 'company' ? 'Income and costs from Xero. Read only.' : 'Your own cards, kept apart from the company.'}
      right={<IconButton icon="refresh" label="Refresh" onClick={() => { load(true); if (view === 'personal') setTick((t) => t + 1); }} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />} />
  );
  const tabs = (
    <div role="tablist" aria-label="Finances views" className="mb-5 grid grid-cols-2 gap-1 sm:flex">
      {VIEWS.map((x) => (
        <button key={x.key} role="tab" aria-selected={x.key === view} onClick={() => go(x.key === 'company' ? 'finances' : 'finances/personal')}
          className={cx('flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition', x.key === view ? 'bg-ink text-ink-fg shadow-card' : 'text-muted hover:bg-hover hover:text-fg')}>{x.label}</button>
      ))}
    </div>
  );
  if (error && !d) return <>{title}{tabs}<ErrorBox error={error} retry={() => load()} /></>;
  if (!d) return <>{title}{tabs}<PageSkeleton kind="grid" /></>;
  return (
    <div>
      {title}
      {tabs}
      {error && <div className="mb-4"><ErrorBox error={error} retry={() => load()} /></div>}
      {view === 'company' ? <Company d={d} /> : <Personal d={d} tick={tick} />}
      {d.errors.map((e) => <Line key={e} warn>{e}</Line>)}
      <p className="mt-6 text-xs text-muted">Read {timeAgo(d.readAt) || 'just now'}; kept for 5 minutes.</p>
    </div>
  );
}

function Company({ d }: { d: FinancesData }) {
  const c = d.company;
  const [cur, last] = c.xero ?? [];
  return (
    <div className="space-y-8">
      <section>
        <SectionHeader title="Income and costs" icon="trendUp" right={<span className="text-xs text-muted">{d.sources.income}</span>} />
        {!c.xero ? <Card className="text-sm text-muted">Xero not read: income and costs UNKNOWN.</Card> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Income this month" v={usd(cur.income)} sub={rangeOf(cur)} />
            <Tile label="Costs this month" v={usd(cur.costs)} sub={rangeOf(cur)} />
            <Tile label="Income last month" v={usd(last.income)} sub={rangeOf(last)} />
            <Tile label="Costs last month" v={usd(last.costs)} sub={rangeOf(last)} />
            <Tile label="Net this month" v={usd(cur.net)} sub="income − costs, so far" bad={cur.net < 0} />
            <Tile label="Net last month" v={usd(last.net)} sub="income − costs" bad={last.net < 0} />
            <Tile label="Retainers (MRR)" v={usd(c.mrr)} sub="active clients' deals" />
            <Tile label="Open client invoices" v={usd(c.invoices.reduce((a, i) => a + i.amount, 0))} sub={`${c.invoices.length} in Xero${c.invoices.some((i) => i.late) ? `, ${c.invoices.filter((i) => i.late).length} late` : ''}`} bad={c.invoices.some((i) => i.late)} />
          </div>
        )}
      </section>

      {c.xero && (cur.lines?.length || last.lines?.length) ? (
        <section>
          <SectionHeader title="Biggest costs" icon="list" right={<span className="text-xs text-muted">Xero profit and loss</span>} />
          <div className="grid gap-3 md:grid-cols-2">
            {[cur, last].map((m) => (
              <Card key={m.label} className="text-sm">
                <div className="mb-2 text-xs font-medium text-muted">{m.label} ({rangeOf(m)})</div>
                {!m.lines?.length ? <div className="text-muted">No cost lines.</div> : (
                  <ul className="space-y-1">{m.lines.map((l) => <li key={`${l.section}/${l.name}`} className="flex justify-between gap-3"><span className="truncate text-fg-2">{l.name}</span><span className="tabular shrink-0 font-semibold text-fg">{usd(l.amount)}</span></li>)}</ul>
                )}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {c.invoices.length > 0 && (
        <section>
          <SectionHeader title="Open client invoices" icon="file" right={<span className="text-xs text-muted">Xero</span>} />
          <Card className="text-sm">
            <ul className="space-y-1">{c.invoices.map((i, k) => <li key={k} className="flex justify-between gap-3"><span className="truncate text-fg-2">{i.contact}</span><span className={cx('tabular shrink-0', i.late ? 'font-semibold text-bad' : 'text-fg-2')}>{usd(i.amount)} · {i.late ? `late since ${slashDate(i.due)}` : `due ${slashDate(i.due)}`}</span></li>)}</ul>
          </Card>
        </section>
      )}

      <section>
        <SectionHeader title="Business cards" icon="layers" right={<span className="text-xs text-muted">P/L sheet</span>} />
        <Cards cards={c.cards} totals={c.cardTotals} empty="No business cards on the P/L sheet." />
        <Line>{d.sources.cards}. {d.sources.personalRule}</Line>
      </section>
    </div>
  );
}

function Personal({ d, tick }: { d: FinancesData; tick: number }) {
  const p = d.personal;
  const [plaid, setPlaid] = useState<PersonalData | null>(null);
  // Linked accounts (Plaid) replace the sheet's Robinhood / Discover rows they stand for.
  const replaced = plaid?.replaces ?? [];
  const cards = p.cards ? p.cards.filter((c) => !replaced.some((k) => c.card.toLowerCase().includes(k))) : null;
  const totals = cards ? sumCards(cards) : null;
  const allReplaced = Boolean(p.cards?.length) && cards !== null && cards.length === 0;
  return (
    <div className="space-y-8">
      <PersonalPlaid tick={tick} onData={setPlaid} />
      {!allReplaced && (
        <section>
          <SectionHeader title="Personal cards" icon="layers" right={<span className="text-xs text-muted">P/L sheet</span>} />
          {totals && cards && cards.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tile label="Balance" v={usd(totals.balance)} sub={`${cards.length} card${cards.length === 1 ? '' : 's'}`} />
              <Tile label="Statements" v={usd(totals.statement)} />
              <Tile label="Minimums due" v={usd(totals.minimum)} />
            </div>
          )}
          <Cards cards={cards} totals={null} empty="No Robinhood or Discover card on the P/L sheet." />
          <Line>{d.sources.personalRule}{replaced.length ? ` Linked accounts replace the sheet's ${replaced.map((k) => k[0].toUpperCase() + k.slice(1)).join(' and ')} rows.` : ''}</Line>
        </section>
      )}
    </div>
  );
}
const sumCards = (cards: FinanceCard[]) => {
  const s = (k: 'statement' | 'balance' | 'minimum') => Math.round(cards.reduce((a, c) => a + c[k], 0) * 100) / 100;
  return { statement: s('statement'), balance: s('balance'), minimum: s('minimum') };
};

function Cards({ cards, totals, empty }: { cards: FinanceCard[] | null; totals: FinancesData['company']['cardTotals']; empty: string }) {
  if (cards === null) return <Card className="text-sm text-muted">P/L sheet not read: cards UNKNOWN.</Card>;
  if (!cards.length) return <Card className="text-sm text-muted">{empty}</Card>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="border-b border-line bg-sunken text-xs text-muted"><tr><th className="px-5 py-2.5 font-medium">Card</th><th className="px-3 py-2.5 font-medium">Due</th><th className="px-3 py-2.5 text-right font-medium">Statement</th><th className="px-3 py-2.5 text-right font-medium">Balance</th><th className="px-5 py-2.5 text-right font-medium">Minimum</th></tr></thead>
        <tbody className="divide-y divide-line">
          {cards.map((c) => <tr key={c.card}><td className="px-5 py-2.5 font-medium text-fg">{c.card}</td><td className="px-3 py-2.5 text-fg-2">{dueOf(c.dueDate)}</td><td className="tabular px-3 py-2.5 text-right text-fg-2">{usd(c.statement)}</td><td className="tabular px-3 py-2.5 text-right font-semibold text-fg">{usd(c.balance)}</td><td className="tabular px-5 py-2.5 text-right text-fg-2">{usd(c.minimum)}</td></tr>)}
        </tbody>
        {totals && <tfoot className="border-t border-line bg-sunken"><tr><td className="px-5 py-2.5 font-semibold text-fg" colSpan={2}>Total</td><td className="tabular px-3 py-2.5 text-right text-fg-2">{usd(totals.statement)}</td><td className="tabular px-3 py-2.5 text-right font-bold text-fg">{usd(totals.balance)}</td><td className="tabular px-5 py-2.5 text-right text-fg-2">{usd(totals.minimum)}</td></tr></tfoot>}
      </table>
    </Card>
  );
}

/** "2026-11-01" → "11/1"; the sheet's "12/10/2026" → "12/10". */
const dueOf = (x: string) => { const m = /^(\d{1,2})\/(\d{1,2})\/\d{4}$/.exec(x.trim()); return m ? `${Number(m[1])}/${Number(m[2])}` : slashDate(x) || x || '–'; };
const rangeOf = (m: FinanceMonth) => `${slashDate(m.from)} to ${slashDate(m.to)}`;
function Tile({ label, v, sub, bad }: { label: string; v: string; sub?: string; bad?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="truncate text-xs font-medium text-muted">{label}</div>
      <div className={cx('tabular mt-1 text-[24px] font-bold leading-none tracking-tight', bad ? 'text-bad' : 'text-fg')}>{v}</div>
      {sub && <div className="mt-1.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}
const Line = ({ children, warn }: { children: ReactNode; warn?: boolean }) => <p className={cx('mt-2 text-xs', warn ? 'text-warn' : 'text-muted')}>{children}</p>;
