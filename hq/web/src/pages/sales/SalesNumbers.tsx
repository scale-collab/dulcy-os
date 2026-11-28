// Round 3 Numbers tab (owner only): a period picker and real charts (bookings, shows, qualified,
// contracts sent, signed, paid, new monthly money) against the period before, then Capacity.
// Capacity: when Dulcy's calendar cannot be read, it says why, and offers "Connect calendar" (the same
// one-time link as client → AI replier → "Get calendar link"; nothing is emailed).
import { useCallback, useEffect, useState } from 'react';
import { api, type SalesCapacityR3, type SalesCapacitySettings, type SalesInsights, type SalesNumbers as NumbersT, type SalesRate } from '../../api';
import { Button, Card, cx, ErrorBox, ExtLink, Icon, PageSkeleton, SectionHeader, usd } from '../../ui';
import { CompareChart, PeriodPicker, periodQuery, readPeriod, type PeriodState } from './period';

export default function SalesNumbers({ ins, onSaved }: { ins: SalesInsights | null; onSaved: () => void }) {
  const [period, setPeriod] = useState<PeriodState>(() => readPeriod('month'));
  const [d, setD] = useState<NumbersT | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api<NumbersT>(`/sales/numbers?${periodQuery(period)}`).then(setD).catch((e) => setError(e.message));
  }, [period]);
  useEffect(load, [load]);
  const money = d?.metrics.find((m) => m.key === 'money');
  return (
    <div className="space-y-6">
      <section>
        <SectionHeader title="Compare periods" icon="activity" />
        <PeriodPicker value={period} onChange={setPeriod} keys={['month', 'quarter', 'year', 'custom']} pick={d?.period} />
        {error && !d ? <div className="mt-3"><ErrorBox error={error} retry={load} /></div> : !d ? <div className="mt-3"><PageSkeleton kind="grid" /></div> : (
          <>
            <Card className="mt-3 py-3.5"><div className="text-[15px] font-semibold leading-snug text-fg">{d.conclusion}</div></Card>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {d.metrics.map((m) => (
                <div key={m.key} className="min-w-0">
                  <CompareChart title={m.label} now={m.series.now} prev={m.series.prev} labels={d.labels} nowLabel={d.period.now.label} prevLabel={d.period.prev.label} fmt={m.key === 'money' ? (x) => usd(x) : (x) => String(Math.round(x * 10) / 10)} />
                  <div className={cx('mt-1 flex items-center gap-1 px-1 text-xs font-semibold', m.dir === 'up' ? 'text-good' : m.dir === 'down' ? 'text-bad' : 'text-muted')}>
                    {m.dir !== 'same' && <Icon name={m.dir === 'up' ? 'trendUp' : 'trendDown'} size={13} />}
                    {m.dir === 'same' ? 'Same as before' : `${m.diff > 0 ? '+' : '−'}${m.key === 'money' ? usd(Math.abs(m.diff)) : Math.abs(m.diff)}${m.pct !== null ? ` (${m.pct > 0 ? '+' : ''}${m.pct}%)` : ''}`}
                    {m.key === 'money' && (m.unknownNow || m.unknownPrev) ? <span className="font-normal text-muted">· {(m.unknownNow ?? 0) + (m.unknownPrev ?? 0)} signed with no amount</span> : null}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Running totals per {d.unit}. Calls by call date, signed by signing date, paid by the first payment.{money ? ' Money = the monthly fee of deals signed in the period.' : ''}</p>
          </>
        )}
      </section>
      {ins ? <CapacityBlock c={ins.capacity as SalesCapacityR3} settings={ins.settings} onSaved={onSaved} /> : <PageSkeleton kind="list" />}
    </div>
  );
}

function CapacityBlock({ c, settings, onSaved }: { c: SalesCapacityR3; settings: SalesCapacitySettings; onSaved: () => void }) {
  const r = (x: SalesRate) => (x.of ? `${Math.round((x.n / x.of) * 100)}%` : '–');
  const tiles: { label: string; v: string; sub: string }[] = [
    { label: 'Calendars', v: String(c.calendars), sub: c.calendars === 1 ? "Alex's" : 'closers' },
    { label: 'Open slots, 30 days', v: c.open.n === null ? '?' : String(c.open.n), sub: c.open.source === 'calendar' ? `free ${c.slotMinutes}-min slots` : c.open.source === 'setting' ? 'from the setting' : 'UNKNOWN' },
    { label: 'Booked', v: c.bookedPct === null ? '–' : `${c.bookedPct}%`, sub: c.booked ? `${c.bookedNext30} calls booked` : `${c.bookedNext30} calls booked` },
    { label: 'Show rate', v: r(c.showRate), sub: 'past calls, 90 days' },
    { label: 'Qualified', v: r(c.qualifiedRate), sub: 'of shows' },
    { label: 'Close rate', v: r(c.closeRate), sub: 'of shows' },
    { label: 'Days to close', v: c.daysToClose.median === null ? '?' : String(c.daysToClose.median), sub: c.daysToClose.median === null ? 'no signed deal yet' : `middle of ${c.daysToClose.n}` },
    { label: 'Touches per close', v: c.touchesPerClose.avg === null ? '?' : String(c.touchesPerClose.avg), sub: c.touchesPerClose.source === 'close' ? `last ${c.touchesPerClose.n} won (Close)` : 'Connect Close' },
  ];
  const tone = c.limit.key === 'volume' ? 'info' : c.limit.key === 'unknown' ? 'plain' : 'warn';
  const cal = c.calendar;
  return (
    <section>
      <SectionHeader title="Capacity" icon="calendar" />
      <Card className={cx('mb-3 py-3.5', tone === 'warn' ? 'border-warn/30 bg-warn-soft' : tone === 'info' ? 'border-info/25 bg-info-soft' : '')}>
        <div className="text-[15px] font-semibold leading-snug text-fg">{c.limit.text}</div>
        {c.atCapacity && <div className="mt-1 text-sm text-fg-2">A full calendar at today's rates: {c.atCapacity.text}.</div>}
      </Card>
      {cal && !cal.readable && <ConnectCalendar cal={cal} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="text-xs font-medium leading-snug text-muted sm:truncate">{t.label}</div>
            <div className="tabular mt-1 text-[24px] font-bold leading-none tracking-tight text-fg">{t.v}</div>
            <div className="mt-1.5 text-xs leading-snug text-muted sm:truncate" title={t.sub}>{t.sub}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{c.open.note.replace(/\.+$/, '')}. Booked = calls in the next 30 days of all slots (booked + open). Rates: the last 90 days. {c.touchesPerClose.note}</p>
      <CapacitySettingsForm s={settings} onSaved={onSaved} />
    </section>
  );
}

/** Dulcy's calendar is not readable: why, and a one-time connect link (Calendly by default). */
function ConnectCalendar({ cal }: { cal: NonNullable<SalesCapacityR3['calendar']> }) {
  const [email, setEmail] = useState('');
  const [provider, setProvider] = useState('calendly');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const ask = () => {
    setBusy(true); setMsg('');
    api<{ url: string; expiresAt: string }>('/sales/calendar-invite', { body: { provider, email } }).then((r) => setLink(r)).catch((e) => setMsg(e.message)).finally(() => setBusy(false));
  };
  return (
    <Card className="mb-3 border-warn/30 py-3.5">
      <div className="flex items-start gap-3">
        <Icon name="calendar" size={18} className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1 text-sm leading-snug">
          <div className="font-semibold text-fg">{cal.connected ? "Dulcy's calendar is connected but could not be read" : 'Connect calendar'}</div>
          <div className="text-fg-2">{cal.text}</div>
          {cal.canInvite ? (
            link ? (
              <div className="mt-2 space-y-1">
                <ExtLink href={link.url}>Open the one-time connect link</ExtLink>
                <div className="text-xs text-muted">Sign in as {email} and pick the sales meeting type.{link.expiresAt ? ` Expires ${new Date(link.expiresAt).toLocaleString()}.` : ''} Nothing was emailed.</div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted">Calendar<select value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-1 block min-h-10 rounded-xl border border-line bg-surface px-3 text-sm text-fg">
                  <option value="calendly">Calendly</option><option value="google">Google</option><option value="microsoft">Outlook</option></select></label>
                <label className="min-w-0 flex-1 text-xs text-muted">Calendar email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@dulcy.io" className="mt-1 block min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg" /></label>
                <Button tone="primary" icon="link" disabled={busy || !/^\S+@\S+\.\S+$/.test(email)} onClick={ask}>{busy ? 'Asking…' : 'Get calendar link'}</Button>
              </div>
            )
          ) : <div className="mt-1 text-xs text-muted">The connect link needs CALENDAR_ADMIN_TOKEN on the server.</div>}
          {msg && <div className="mt-1 text-sm text-bad">{msg}</div>}
        </div>
      </div>
    </Card>
  );
}

function CapacitySettingsForm({ s, onSaved }: { s: SalesCapacitySettings; onSaved: () => void }) {
  const [v, setV] = useState({ calendars: String(s.calendars), slotMinutes: String(s.slotMinutes), slotsPerMonth: s.slotsPerMonth === null ? '' : String(s.slotsPerMonth) });
  const [msg, setMsg] = useState('');
  const save = () => {
    setMsg('');
    api('/sales/settings', { body: { calendars: Number(v.calendars), slotMinutes: Number(v.slotMinutes), slotsPerMonth: v.slotsPerMonth === '' ? null : Number(v.slotsPerMonth) } })
      .then(() => { setMsg('Saved.'); onSaved(); }).catch((e) => setMsg(e.message));
  };
  const field = (k: keyof typeof v, label: string, help: string) => (
    <label className="min-w-0 text-sm"><span className="block font-semibold text-fg">{label}</span><span className="block text-xs text-muted">{help}</span>
      <input type="number" inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-fg outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft" /></label>
  );
  return (
    <details className="mt-3 rounded-2xl border border-line bg-surface">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-fg-2 hover:bg-hover sm:px-5">Capacity settings</summary>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3 sm:px-5">
        {field('calendars', 'Calendars', 'People taking sales calls')}
        {field('slotMinutes', 'Call length (minutes)', 'One slot = one call')}
        {field('slotsPerMonth', 'Slots a month', 'Only used when the calendar cannot be read')}
        <div className="flex items-center gap-3 sm:col-span-3"><Button tone="primary" onClick={save}>Save</Button>{msg && <span className="text-sm text-muted">{msg}</span>}</div>
      </div>
    </details>
  );
}
