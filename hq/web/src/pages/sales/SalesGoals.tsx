// Round 5 (Alex 2026-11-28): Cole's take on the month (replaces "November so far vs October") with a
// "Talk to Cole" button, and this month's goals vs actuals under the key numbers. Goals are read from
// Airtable's Sales Goals (set on the 1st by the n8n "Airtable Monthly Goals Auto"); HQ never writes them.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { Avatar, Button, Card, cx, go, Icon, Pill, usd } from '../../ui';
import { chatHref } from '../chatState';
import { slashDate } from '../../dates';
import type { GoalLine, SalesGoals } from './types';

/** GET /sales/goals once per screen (Cole's words are cached for the day on the server). */
export function useSalesGoals(refreshKey: number) {
  const [g, setG] = useState<SalesGoals | null>(null);
  const [error, setError] = useState('');
  const load = useCallback((refresh: boolean) => {
    setError('');
    api<SalesGoals>(`/sales/goals${refresh ? '?refresh=1' : ''}`).then(setG).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => load(refreshKey > 0), [load, refreshKey]);
  return { g, error, retry: () => load(false) };
}

/** Cole's 1-2 sentence verdict and the way to talk it through with him (opens Chat with the numbers typed in, not sent). */
export function ColeTake({ g, error }: { g: SalesGoals | null; error: string }) {
  const text = g?.take.text ?? (error ? "Cole's take could not be loaded just now." : 'Cole is reading the numbers…');
  return (
    <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-line bg-accent-soft px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar name="Cole" size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted">Cole's take{g ? ` · ${g.title.split(' ')[0]} up to ${slashDate(g.today)}` : ''}</div>
          <div className={cx('text-[15px] font-semibold leading-snug', g ? 'text-fg' : 'text-muted')} aria-live="polite">{text}</div>
        </div>
      </div>
      <Button tone="accent" icon="message" disabled={!g} onClick={() => g && go(chatHref('Cole', { fresh: true, ask: g.ask }))} className="min-h-11 shrink-0 self-start sm:self-center">Talk to Cole</Button>
    </div>
  );
}

const TONE: Record<GoalLine['status'], 'good' | 'info' | 'warn' | 'plain'> = { hit: 'good', on_pace: 'info', behind: 'warn', no_goal: 'plain' };
const WORD: Record<GoalLine['status'], string> = { hit: 'Goal hit', on_pace: 'On pace', behind: 'Behind', no_goal: 'No goal' };
const fmt = (l: GoalLine, x: number | null) => (x === null ? '–' : l.money ? usd(x) : String(Math.round(x * 10) / 10));

/** This month's goals vs actuals: a bar per goal with a tick where the month should be by today. */
export function GoalsCard({ g }: { g: SalesGoals }) {
  const [how, setHow] = useState(false);
  const lines = g.lines.filter((l) => l.goal !== null || l.actual > 0);
  return (
    <section aria-label={`${g.title} goals`} className="mt-3">
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 sm:px-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-fg"><Icon name="target" size={16} className="text-accent-ink" />{g.title.split(' ')[0]} goals</div>
          <span className="text-xs text-muted">Day {g.dayOfMonth} of {g.daysInMonth}</span>
        </div>
        {!g.goals ? <div className="px-4 py-3 text-sm text-muted sm:px-5">{g.source.text}</div> : (
          <ul className="grid gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
            {lines.map((l) => {
              const w = l.goal ? Math.min(100, Math.round((l.actual / l.goal) * 100)) : 0;
              const tick = l.goal && l.expected !== null ? Math.min(100, Math.round((l.expected / l.goal) * 100)) : null;
              return (
                <li key={l.key} className="min-w-0">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-medium text-muted">{l.label}</span><Pill tone={TONE[l.status]}>{WORD[l.status]}</Pill></div>
                  <div className="tabular mt-1 text-[17px] font-bold leading-tight text-fg">{fmt(l, l.actual)}<span className="text-sm font-semibold text-muted"> of {fmt(l, l.goal)}{l.pct !== null ? ` · ${l.pct}%` : ''}</span></div>
                  <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${l.label}: ${l.text}${l.expected !== null ? `; by today the line is ${fmt(l, l.expected)}` : ''}`}>
                    <span className={cx('absolute inset-y-0 left-0 rounded-full', l.status === 'behind' ? 'bg-warn' : l.status === 'hit' ? 'bg-good' : 'bg-accent')} style={{ width: `${w}%` }} />
                    {tick !== null && tick < 100 && <span className="absolute inset-y-0 w-0.5 bg-fg/50" style={{ left: `${tick}%` }} />}
                  </div>
                  {l.expected !== null && l.status !== 'hit' && <div className="mt-1 text-xs text-muted">By today: {fmt(l, l.expected)}</div>}
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-line px-4 py-2.5 sm:px-5">
          <button onClick={() => setHow(!how)} aria-expanded={how} className="flex min-h-9 w-full items-center gap-1.5 text-left text-xs font-semibold text-fg-2 hover:text-fg">
            How the goals were set<Icon name="chevronDown" size={14} className={cx('transition', how && 'rotate-180')} />
          </button>
          {how && (
            <div className="space-y-1.5 pb-1 text-xs leading-snug text-fg-2">
              <p>{g.source.text}</p>
              {g.source.reasoning && <p className="text-muted">Why: {g.source.reasoning}</p>}
              {g.next && <p>{g.next.title.split(' ')[0]} at this pace (same rules, no AI review): {g.next.calls} calls, {g.next.deals} deals{g.next.revenue ? `, ${usd(g.next.revenue)} revenue` : ''}{g.next.cash ? `, ${usd(g.next.cash)} cash` : ''}.</p>}
              {g.warning && <p className="text-warn">{g.warning}</p>}
              <p className="text-muted">Actuals are HQ's: calls by call date, deals and revenue (monthly value) by signing date, cash paid on the deals signed this month.</p>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
