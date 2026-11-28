// Content → "Calendar" (Batch 5, 2026-11-27): the Content Center's "Recording and publishing calendar".
// Record days and publish days per month, filter by date kind and channel, and the active items that
// have no date yet. Ideas still waiting for a decision are left out, like the Content Center does.
// Round 4 (2026-11-28): a video on YouTube shows on the day it was POSTED (YouTube Published At, else
// Publish Date, else its YouTube page's date: the engine's postedOn), never under "No date yet" just
// because its plan dates were never filled ("Outbound Funnel Math", posted 11/27). Dates use slashes.
// From a tablet up it is a month grid; on a phone, a list of the days that have something on them.
// Tap an item to open it in Content. Read only.
import { useMemo, useState } from 'react';
import type { ContentCenterView, ContentItem } from '../../api';
import { Card, cx, Empty, go, IconButton } from '../../ui';
import { CHANNEL_OPTIONS, Head, Select, day, readChannel, saveChannel, shortLabel, todayEt, type ChannelKey } from './shared';

type Kind = 'Record' | 'Publish' | 'Posted';
type DateFilter = 'all' | 'recording' | 'publish';
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ContentCalendar({ d }: { d: ContentCenterView }) {
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<DateFilter>('all');
  const [channel, setChannel] = useState<ChannelKey>(readChannel);
  const today = todayEt();
  const month = useMemo(() => { const t = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); t.setUTCMonth(t.getUTCMonth() + offset); return t; }, [today, offset]);
  const monthKey = ymd(month).slice(0, 7);
  const active = useMemo(() => d.pipeline.rows.filter((r) => !r.awaiting && !r.done && (!channel || r.key === channel)), [d, channel]);
  const events = useMemo(() => {
    const m = new Map<string, { r: ContentItem; kind: Kind }[]>();
    const add = (k: string, r: ContentItem, kind: Kind) => m.set(k, [...(m.get(k) ?? []), { r, kind }]);
    for (const r of active) {
      if (r.recordingDate && filter !== 'publish') add(r.recordingDate, r, 'Record');
      // Posted: the posted day replaces the planned publish day.
      if (r.posted) { if (r.postedDate && filter !== 'recording') add(r.postedDate, r, 'Posted'); }
      else if (r.publishDate && filter !== 'recording') add(r.publishDate, r, 'Publish');
    }
    return m;
  }, [active, filter]);
  const pub = (r: ContentItem) => (r.posted ? r.postedDate : r.publishDate);
  // A posted video has nothing left to record: it is never "no recording date".
  const unscheduled = active.filter((r) => (filter === 'recording' ? !r.recordingDate && !r.posted : filter === 'publish' ? !pub(r) : !r.recordingDate && !pub(r)));
  const start = new Date(month); start.setUTCDate(1 - month.getUTCDay());
  const grid = Array.from({ length: 42 }, (_, i) => { const x = new Date(start); x.setUTCDate(start.getUTCDate() + i); return ymd(x); });
  const daysWithEvents = [...events.keys()].filter((k) => k.startsWith(monthKey)).sort();
  const label = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const chip = (e: { r: ContentItem; kind: Kind }, i: number, small = false) => (
    <button key={`${e.r.id}-${e.kind}-${i}`} onClick={() => go(`content/items/${e.r.id}`)}
      className={cx('block w-full min-w-0 rounded-lg border text-left font-semibold leading-snug transition hover:shadow-card', small ? 'px-1.5 py-1 text-[11px]' : 'px-3 py-2 text-sm',
        e.kind === 'Record' ? 'border-accent/30 bg-accent-soft text-accent-ink' : e.kind === 'Posted' ? 'border-line-strong bg-sunken text-fg' : 'border-good/30 bg-good-soft text-good')}>
      <span className={cx('block font-bold uppercase tracking-wider opacity-75', small ? 'text-[9px]' : 'text-[10px]')}>{e.kind}{!channel ? ` · ${shortLabel(e.r.channel)}` : ''}</span>
      <span className={cx('block break-words', small && 'line-clamp-2')}>{e.r.title}</span>
    </button>
  );

  return (
    <div>
      <Head title="Recording and publishing calendar" icon="calendar" sub="Purple is when you record. Green is when it publishes. Grey is when it was posted. Tap one to open it." />
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select label="Dates" value={filter} onChange={setFilter} className="sm:w-48"
          options={[{ value: 'all', label: 'All dates' }, { value: 'recording', label: 'Recording dates' }, { value: 'publish', label: 'Publish and posted dates' }]} />
        <Select label="Channel" value={channel} options={CHANNEL_OPTIONS} onChange={(x) => { setChannel(x); saveChannel(x); }} className="sm:w-48" />
        <div className="col-span-2 flex items-center gap-1 sm:ml-auto">
          <IconButton icon="arrowLeft" label="Previous month" onClick={() => setOffset(offset - 1)} className="border border-line bg-surface" />
          <button onClick={() => setOffset(0)} className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-fg sm:min-w-44 sm:flex-none" title="Back to this month">{label}</button>
          <IconButton icon="arrowRight" label="Next month" onClick={() => setOffset(offset + 1)} className="border border-line bg-surface" />
        </div>
      </div>

      {/* Tablet and up: the month grid */}
      <div className="mt-4 hidden overflow-hidden rounded-2xl border border-line bg-line shadow-card md:grid md:grid-cols-7 md:gap-px">
        {WEEKDAYS.map((w) => <div key={w} className="bg-sunken px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">{w}</div>)}
        {grid.map((k) => {
          const evs = events.get(k) ?? [];
          const inMonth = k.startsWith(monthKey);
          return (
            <div key={k} className={cx('min-h-28 min-w-0 p-1.5', inMonth ? 'bg-surface' : 'bg-sunken')}>
              <div className={cx('mb-1 grid h-6 w-6 place-items-center rounded-full text-xs font-semibold', k === today ? 'bg-ink text-ink-fg' : inMonth ? 'text-fg-2' : 'text-faint')}>{Number(k.slice(8))}</div>
              <div className="space-y-1">{evs.map((e, i) => chip(e, i, true))}</div>
            </div>
          );
        })}
      </div>

      {/* Phone: the days of this month that have something on them */}
      <div className="mt-4 md:hidden">
        {daysWithEvents.length ? (
          <ol className="space-y-3">
            {daysWithEvents.map((k) => (
              <li key={k}>
                <div className={cx('mb-1.5 text-sm font-semibold', k === today ? 'text-accent-ink' : 'text-fg')}>{day(k)}{k === today ? ' · today' : ''}</div>
                <div className="space-y-1.5">{(events.get(k) ?? []).map((e, i) => chip(e, i))}</div>
              </li>
            ))}
          </ol>
        ) : <Card><Empty icon="calendar" title={`Nothing dated in ${label}`} sub="Approved items get their dates when you approve them." /></Card>}
      </div>

      {unscheduled.length > 0 && (
        <section className="mt-6">
          <Head title={`No date yet (${unscheduled.length})`} icon="clock" sub={filter === 'recording' ? 'Active items with no recording date.' : filter === 'publish' ? 'Active items with no publish date.' : 'Active items with no recording or publish date, so they are not on the calendar.'} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unscheduled.slice(0, 12).map((r) => (
              <button key={r.id} onClick={() => go(`content/items/${r.id}`)} className="min-w-0 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2.5 text-left">
                <span className="block break-words text-sm font-semibold text-fg">{r.title}</span>
                <span className="block text-xs text-muted">{r.posted ? 'Posted, no date saved' : r.cc} · {shortLabel(r.channel)}</span>
              </button>
            ))}
          </div>
          {unscheduled.length > 12 && <p className="mt-2 text-xs text-muted">{unscheduled.length - 12} more in Content.</p>}
        </section>
      )}
      <p className="mt-4 text-xs text-muted">Shows items with a date in the last 60 days or later. Finished videos and ideas still waiting for you are left out.</p>
    </div>
  );
}
