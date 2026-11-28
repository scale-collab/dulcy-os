// Round 4 (Alex 2026-11-28): Finances, its own menu item (the server answers 403 to members).
// Company = income and costs from Xero (the tool, not the hand-kept P/L sheet), open client invoices,
// and the business cards. Personal = Alex's own cards and the P/L sheet's personal expenses.
// Round 5 (Alex 2026-11-28 evening): personal cards Cash Preferred, Amex Gold, Chase Personal too
// (with Robinhood, Discover); a Both tab (money left over at the end of the month); click an open
// invoice or a month's costs for the detail; a Ledger chat beside it (the same chat as HQ Chat → Ledger).
// Read only: nothing on this screen writes to Xero, the sheet or Airtable.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type FinanceCard, type FinanceInvoice, type FinanceInvoiceDetail, type FinanceLeftover, type FinanceMonth, type FinancesData, type User } from '../api';
import { Card, cx, Empty, ErrorBox, ExtLink, go, Icon, IconButton, PageSkeleton, PageTitle, SectionHeader, Skeleton, timeAgo, usd } from '../ui';
import { slashDate } from '../dates';
import PersonalPlaid from './FinancesPersonal';
import AgentChatBox from './AgentChatBox';
import { Sheet } from './campaign/shared';
import type { PersonalData } from '../api';

type View = 'company' | 'personal' | 'both';
const VIEWS: { key: View; label: string }[] = [{ key: 'company', label: 'Company' }, { key: 'personal', label: 'Personal' }, { key: 'both', label: 'Both' }];
const SUB: Record<View, string> = {
  company: 'Income and costs from Xero. Read only.',
  personal: 'Your own cards and expenses, kept apart from the company.',
  both: 'Company and Personal together: what is left at the end of the month.',
};

/** #/finances · #/finances/personal · #/finances/both */
export default function Finances({ user, a }: { user: User; a?: string }) {
  const view: View = a === 'personal' ? 'personal' : a === 'both' ? 'both' : 'company';
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
    <PageTitle title="Finances" kicker={view === 'company' ? 'Dulcy Media LLC' : view === 'personal' ? 'Personal' : 'Company + Personal'} sub={SUB[view]}
      right={<IconButton icon="refresh" label="Refresh" onClick={() => { load(true); if (view === 'personal') setTick((t) => t + 1); }} className={cx('border border-line bg-surface', busy && '[&_svg]:animate-spin')} />} />
  );
  const tabs = (
    <div role="tablist" aria-label="Finances views" className="mb-5 grid grid-cols-3 gap-1 sm:flex">
      {VIEWS.map((x) => (
        <button key={x.key} role="tab" aria-selected={x.key === view} onClick={() => go(x.key === 'company' ? 'finances' : `finances/${x.key}`)}
          className={cx('flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition', x.key === view ? 'bg-ink text-ink-fg shadow-card' : 'text-muted hover:bg-hover hover:text-fg')}>{x.label}</button>
      ))}
    </div>
  );
  let body: ReactNode;
  if (error && !d) body = <ErrorBox error={error} retry={() => load()} />;
  else if (!d) body = <PageSkeleton kind="grid" />;
  else body = (
    <>
      {error && <div className="mb-4"><ErrorBox error={error} retry={() => load()} /></div>}
      {view === 'company' ? <Company d={d} /> : view === 'personal' ? <Personal d={d} tick={tick} /> : <Both d={d} />}
      {d.errors.map((e) => <Line key={e} warn>{e}</Line>)}
      <p className="mt-6 text-xs text-muted">Read {timeAgo(d.readAt) || 'just now'}; kept for 5 minutes.</p>
    </>
  );
  // Ledger beside the numbers on a computer; under them on the phone.
  return (
    <div>
      {title}
      {tabs}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-6">
        <div className="min-w-0">{body}</div>
        <AgentChatBox agent="Ledger" role="Money" className="mt-8 h-[30rem] xl:sticky xl:top-6 xl:mt-0 xl:h-[calc(100dvh-8rem)]" />
      </div>
    </div>
  );
}

function Company({ d }: { d: FinancesData }) {
  const c = d.company;
  const [cur, last] = c.xero ?? [];
  const [costsOf, setCostsOf] = useState<FinanceMonth | null>(null);
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  return (
    <div className="space-y-8">
      <section>
        <SectionHeader title="Income and costs" icon="trendUp" right={<span className="text-xs text-muted">{d.sources.income}</span>} />
        {!c.xero ? <Card className="text-sm text-muted">Xero not read: income and costs UNKNOWN.</Card> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Income this month" v={usd(cur.income)} sub={rangeOf(cur)} />
            <Tile label="Costs this month" v={usd(cur.costs)} sub="tap for every line" onClick={() => setCostsOf(cur)} />
            <Tile label="Income last month" v={usd(last.income)} sub={rangeOf(last)} />
            <Tile label="Costs last month" v={usd(last.costs)} sub="tap for every line" onClick={() => setCostsOf(last)} />
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
                <button onClick={() => setCostsOf(m)} className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-ink">Every cost line ({(m.allLines ?? m.lines ?? []).length})<Icon name="arrowRight" size={14} /></button>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {c.invoices.length > 0 && (
        <section>
          <SectionHeader title="Open client invoices" icon="file" right={<span className="text-xs text-muted">Xero · tap one for the detail</span>} />
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {c.invoices.map((i, k) => (
                <li key={i.id || k}>
                  <button onClick={() => setInvoice(i)} disabled={!i.id} className="flex min-h-12 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-left text-sm transition hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent sm:flex-nowrap sm:px-5">
                    <span className="min-w-0"><span className="block break-words font-medium text-fg sm:truncate">{i.contact}</span>{i.number && <span className="block text-xs text-muted">{i.number}</span>}</span>
                    {/* Phone: the amount and due date get their own line (the client name is no longer cut). */}
                    <span className={cx('tabular flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-start', i.late ? 'font-semibold text-bad' : 'text-fg-2')}>{usd(i.amount)} · {i.late ? `late since ${slashDate(i.due)}` : `due ${slashDate(i.due)}`}{i.id && <Icon name="chevronRight" size={15} className="text-muted" />}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <SectionHeader title="Business cards" icon="layers" right={<span className="text-xs text-muted">P/L sheet</span>} />
        <Cards cards={c.cards} totals={c.cardTotals} empty="No business cards on the P/L sheet." />
        <Line>{d.sources.cards}. {d.sources.personalRule}</Line>
      </section>

      {costsOf && <CostsSheet m={costsOf} onClose={() => setCostsOf(null)} />}
      {invoice && <InvoiceSheet inv={invoice} onClose={() => setInvoice(null)} />}
    </div>
  );
}

/** Every cost line of one month (Xero profit and loss), by section. */
function CostsSheet({ m, onClose }: { m: FinanceMonth; onClose: () => void }) {
  const lines = m.allLines ?? m.lines ?? [];
  const sections = [...new Set(lines.map((l) => l.section))];
  return (
    <Sheet label={`Costs · ${m.label}`} onClose={onClose}>
      <h2 className="text-[20px] font-bold leading-tight text-fg">Costs {m.label.toLowerCase()}</h2>
      <div className="mt-1 text-sm text-muted">{rangeOf(m)} · Xero profit and loss (read only)</div>
      <div className="mt-4 rounded-2xl border border-line bg-surface p-4"><div className="text-xs font-medium text-muted">Total costs</div><div className="tabular mt-1 text-[28px] font-bold leading-none text-fg">{usd(m.costs)}</div></div>
      {!lines.length ? <p className="mt-5 text-sm text-muted">No cost lines in Xero for this month.</p> : sections.map((s) => {
        const ls = lines.filter((l) => l.section === s);
        return (
          <div key={s} className="mt-6">
            <div className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-[0.08em] text-muted"><span>{s}</span><span className="tabular">{usd(ls.reduce((a, l) => a + l.amount, 0))}</span></div>
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {ls.map((l) => <li key={l.name} className="flex justify-between gap-3 px-4 py-2.5 text-sm"><span className="min-w-0 text-fg-2">{l.name}</span><span className="tabular shrink-0 font-semibold text-fg">{usd(l.amount)}</span></li>)}
            </ul>
          </div>
        );
      })}
    </Sheet>
  );
}

/** One open client invoice, read from Xero when opened. */
function InvoiceSheet({ inv, onClose }: { inv: FinanceInvoice; onClose: () => void }) {
  const [x, setX] = useState<FinanceInvoiceDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api<FinanceInvoiceDetail>(`/finances/invoices/${inv.id}`).then((r) => { if (live) setX(r); }).catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [inv.id]);
  const late = x ? x.daysOverdue > 0 : inv.late;
  return (
    <Sheet label={`Invoice ${inv.number || ''}`.trim()} onClose={onClose}>
      <h2 className="text-[20px] font-bold leading-tight text-fg">{inv.contact}</h2>
      <div className="mt-1 text-sm text-muted">{inv.number || 'Invoice'} · Xero (read only)</div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile label="Still owed" v={usd(x ? x.amountDue : inv.amount)} bad={late} />
        <Tile label={late ? 'Days late' : 'Due'} v={late ? String(x?.daysOverdue ?? '–') : slashDate(x?.due ?? inv.due) || '–'} sub={late ? `due ${slashDate(x?.due ?? inv.due)}` : undefined} bad={late} />
      </div>
      {error && <div className="mt-4"><ErrorBox error={error} /></div>}
      {!x && !error && <div className="mt-5 space-y-2" aria-label="Loading"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-1/2" /></div>}
      {x && (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Fact k="Invoice date" v={slashDate(x.date) || '–'} />
            <Fact k="Due date" v={slashDate(x.due) || '–'} />
            <Fact k="Status" v={STATUS[x.status] ?? (x.status ? x.status[0] + x.status.slice(1).toLowerCase() : '–')} />
            <Fact k="Total" v={usd(x.total)} />
            <Fact k="Paid" v={usd(x.paid)} />
            {x.reference && <Fact k="Reference" v={x.reference} />}
          </dl>
          <div className="mt-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Line items</div>
            {!x.lines.length ? <p className="text-sm text-muted">Xero has no line items on this invoice.</p> : (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {x.lines.map((l, i) => (
                  <li key={i} className="px-4 py-2.5 text-sm">
                    <div className="flex justify-between gap-3"><span className="min-w-0 whitespace-pre-wrap text-fg-2">{l.description || 'Line'}</span><span className="tabular shrink-0 font-semibold text-fg">{usd(l.amount)}</span></div>
                    {l.quantity !== null && l.unitAmount !== null && <div className="tabular mt-0.5 text-xs text-muted">{l.quantity} × {usd(l.unitAmount)}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {x.xeroUrl && <p className="mt-5 text-sm"><ExtLink href={x.xeroUrl}>Open in Xero</ExtLink></p>}
        </>
      )}
    </Sheet>
  );
}
/** Xero's invoice statuses in plain words. */
const STATUS: Record<string, string> = { AUTHORISED: 'Awaiting payment', SUBMITTED: 'Awaiting approval', DRAFT: 'Draft', PAID: 'Paid', VOIDED: 'Voided', DELETED: 'Deleted' };
const Fact = ({ k, v }: { k: string; v: string }) => <div className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="truncate font-medium text-fg">{v}</dd></div>;

function Personal({ d, tick }: { d: FinancesData; tick: number }) {
  const p = d.personal;
  const [plaid, setPlaid] = useState<PersonalData | null>(null);
  // Linked accounts (Plaid) replace the sheet rows of the same personal cards.
  const replaced = plaid?.replaces ?? [];
  const cards = p.cards ? p.cards.filter((c) => !(c.key && replaced.includes(c.key))) : null;
  const totals = cards ? sumCards(cards) : null;
  const allReplaced = Boolean(p.cards?.length) && cards !== null && cards.length === 0;
  const named = (keys: string[]) => keys.map((k) => k.replace(/\b\w/g, (ch) => ch.toUpperCase())).join(', ');
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
          <Cards cards={cards} totals={null} empty="No personal card on the P/L sheet." />
          <Line>{d.sources.personalRule}{replaced.length ? ` Linked accounts replace the sheet's ${named(replaced)} rows.` : ''}</Line>
        </section>
      )}
      <Expenses d={d} />
    </div>
  );
}

function Expenses({ d }: { d: FinancesData }) {
  const e = d.personal.expenses;
  return (
    <section>
      <SectionHeader title="Personal expenses" icon="list" right={<span className="text-xs text-muted">P/L sheet · monthly</span>} />
      {!e ? <Card className="text-sm text-muted">{d.errors.some((x) => /P\/L sheet/.test(x)) ? 'P/L sheet not read: personal expenses UNKNOWN.' : 'No personal expenses on the P/L sheet.'}</Card> : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label="Every month" v={usd(e.total)} sub={e.totalFrom === 'sheet' ? "the sheet's total" : `${e.lines.length} lines added up`} />
            {e.asideTotal > 0 && <Tile label="Coming up" v={usd(e.asideTotal)} sub="not paying yet, not in left over" />}
          </div>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {e.lines.map((l, i) => (
                <li key={`${l.name}-${i}`} className="flex justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span className="min-w-0"><span className="block truncate text-fg-2">{l.name}</span>{(l.note || l.aside !== null) && <span className="block truncate text-xs text-muted">{l.aside !== null ? 'coming up: not paying yet' : l.note}</span>}</span>
                  <span className={cx('tabular shrink-0', l.amount === null ? 'text-muted' : 'font-semibold text-fg')}>{usd(l.amount ?? l.aside)}</span>
                </li>
              ))}
            </ul>
          </Card>
          {e.paidWith.length > 0 && <Line>Paid with: {e.paidWith.map((x) => `${x.name} ${usd(x.amount)}`).join(' · ')}</Line>}
          <Line>{d.sources.expenses}. Coming up = costs you will pay but not yet (beside the list in the sheet): shown here, left out of the total and of Both until you start paying them.</Line>
        </>
      )}
    </section>
  );
}

function Both({ d }: { d: FinancesData }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-3 md:grid-cols-2">
        {d.both.months.map((m) => <LeftoverCard key={m.label} m={m} />)}
      </div>
      <section>
        <SectionHeader title="Not counted" />
        <ul className="space-y-1.5 text-sm text-fg-2">{d.both.notCounted.map((x) => <li key={x} className="flex gap-2"><span aria-hidden="true" className="text-muted">·</span><span>{x}</span></li>)}</ul>
      </section>
    </div>
  );
}
function LeftoverCard({ m }: { m: FinanceLeftover }) {
  const bad = m.left !== null && m.left < 0;
  return (
    <Card>
      <div className="text-xs font-medium text-muted">{m.label}{m.from ? ` (${slashDate(m.from)} to ${slashDate(m.to)})` : ''}</div>
      <div className="mt-1 text-sm font-semibold text-fg-2">Left over</div>
      <div className={cx('tabular mt-1 text-[36px] font-bold leading-none tracking-tight', m.left === null ? 'text-muted' : bad ? 'text-bad' : 'text-fg')}>{m.left === null ? 'UNKNOWN' : signed(m.left)}</div>
      {m.unknown.length > 0 && <div className="mt-2 text-xs text-warn">UNKNOWN because {m.unknown.join(' and ').toLowerCase()} {m.unknown.length === 1 ? 'is' : 'are'} not known.</div>}
      <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
        {m.parts.map((p) => (
          <li key={p.label} className="flex justify-between gap-3">
            <span className="min-w-0"><span className="block text-fg-2">{p.label}</span><span className="block truncate text-xs text-muted">{p.source}</span></span>
            <span className={cx('tabular shrink-0 font-semibold', p.amount === null ? 'text-muted' : 'text-fg')}>{p.amount === null ? 'UNKNOWN' : signed(p.amount)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold"><span className="text-fg">Left over</span><span className={cx('tabular', bad ? 'text-bad' : 'text-fg')}>{m.left === null ? 'UNKNOWN' : signed(m.left)}</span></li>
      </ul>
    </Card>
  );
}
/** "+$1,200" / "−$300". */
const signed = (x: number) => (x < 0 ? `−${usd(-x)}` : x > 0 ? `+${usd(x)}` : usd(0));

const sumCards = (cards: FinanceCard[]) => {
  const s = (k: 'statement' | 'balance' | 'minimum') => Math.round(cards.reduce((a, c) => a + c[k], 0) * 100) / 100;
  return { statement: s('statement'), balance: s('balance'), minimum: s('minimum') };
};

function Cards({ cards, totals, empty }: { cards: FinanceCard[] | null; totals: FinancesData['company']['cardTotals']; empty: string }) {
  if (cards === null) return <Card className="text-sm text-muted">P/L sheet not read: cards UNKNOWN.</Card>;
  if (!cards.length) return <Card className="text-sm text-muted">{empty}</Card>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="sticky-first w-full min-w-[520px] text-left text-sm">
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
function Tile({ label, v, sub, bad, onClick }: { label: string; v: string; sub?: string; bad?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2"><span className="min-w-0 text-xs font-medium text-muted max-sm:leading-snug sm:truncate">{label}</span>{onClick && <Icon name="chevronRight" size={14} className="shrink-0 text-muted" />}</div>
      <div className={cx('tabular mt-1 text-[24px] font-bold leading-none tracking-tight', bad ? 'text-bad' : 'text-fg')}>{v}</div>
      {sub && <div className="mt-1.5 text-xs text-muted max-sm:leading-snug sm:truncate">{sub}</div>}
    </>
  );
  const cls = 'min-w-0 rounded-2xl border border-line bg-surface p-4 text-left shadow-card';
  return onClick ? <button type="button" onClick={onClick} className={cx(cls, 'transition hover:border-line-strong hover:shadow-pop active:scale-[0.99]')}>{inner}</button> : <div className={cls}>{inner}</div>;
}
const Line = ({ children, warn }: { children: ReactNode; warn?: boolean }) => <p className={cx('mt-2 text-xs', warn ? 'text-warn' : 'text-muted')}>{children}</p>;
