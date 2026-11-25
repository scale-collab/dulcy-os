// NOT DEPLOYED (2026-11-25): Airtable's custom-element tool rejects the Campaign Center source as too large (HTTP 413,
// even minified to 140 KB). This is the Activity log section Alex wants at the bottom of the Analytics tab; it goes into
// Dulcy HQ's campaign screen, or into Campaign Center if it is ever rebuilt smaller. Wiring: custom property
// activityTable (tbl4DK6tEuy2ZEmbP), records via useRecords, the memo below, and <ActivityPanel rows={relatedActivity}/>.

// "Activity log" (Alex 2026-11-25): this campaign's history from the Activity Log, inside the Analytics tab
// (not a separate page). Newest first, plain words, details on tap.
type ActivityRow = {id: string; when: number; agent: string; type: string; event: string; details: string};
function ActivityPanel({rows}: {rows: ActivityRow[] | null}) {
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(15);
  if (rows === null) return null;
  const tone = (t: string) => /failed/i.test(t) ? 'bg-red-50 text-red-700 border-red-200' : /fixed|approved|done/i.test(t) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : /waiting/i.test(t) ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-gray-600 border-gray-200';
  return <section className="mt-6 space-y-3">
    <div><h3 className="text-base font-semibold text-gray-900">Activity log</h3><p className="mt-1 text-sm text-gray-500">Everything the agents and the engine did on this campaign and its lead list, newest first.</p></div>
    {!rows.length && <div className="rounded-xl border border-gray-200 bg-slate-50 p-6 text-center text-sm text-gray-500">Nothing logged yet for this campaign.</div>}
    {!!rows.length && <ol className="space-y-2">{rows.slice(0, limit).map(row => <li key={row.id} className="rounded-xl border border-gray-200 bg-white p-3">
      <button onClick={() => setOpen(open === row.id ? null : row.id)} className="flex w-full items-start gap-3 text-left">
        <span className="w-24 shrink-0 text-xs tabular-nums text-gray-500">{row.when ? new Date(row.when).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) : ''}</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-gray-900">{row.event}</span>
          <span className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold"><span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-purple-700">{row.agent || 'Engine'}</span>{row.type && <span className={`rounded-full border px-2 py-0.5 ${tone(row.type)}`}>{row.type}</span>}</span></span>
        {row.details && <span className="text-xs text-purple-700">{open === row.id ? 'Hide' : 'Details'}</span>}
      </button>
      {open === row.id && row.details && <div className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-gray-700">{row.details}</div>}
    </li>)}</ol>}
    {rows.length > limit && <button onClick={() => setLimit(limit + 25)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-slate-50">Show older ({rows.length - limit} more)</button>}
  </section>;
}


// --- memo, placed after relatedSequenceAnalytics ---
  const relatedActivity = useMemo((): ActivityRow[] | null => {
    if (!selected || !activityTable) return null;
    const f = (id: string) => activityTable.getFieldIfExists(id) as AnyField | null;
    const [campaignLink, listLink, when, agent, type, event, details] = ['fld8Y7XpBp1TkBBHR', 'fldGDAB3nxnq0aFZi', 'fldZ6krYaZOeCmaxK', 'fldAOwjBYPCrHZmCS', 'fldvkg6fn4bH2bkD2', 'fldglUB3EzzQVC3ZO', 'fldaF3yo6pfSlARXl'].map(f);
    const lists = campaignLeadListLinkField ? linkedIds(selected, campaignLeadListLinkField) : [];
    return activityRecords
      .filter(record => (campaignLink && linkedIds(record, campaignLink).includes(selected.id)) || (listLink && linkedIds(record, listLink).some(id => lists.includes(id))))
      .map(record => ({id: record.id, when: new Date(textValue(record, when) || 0).getTime() || 0, agent: textValue(record, agent), type: textValue(record, type), event: textValue(record, event) || 'Step', details: textValue(record, details)}))
      .sort((a, b) => b.when - a.when);
  }, [selected, activityTable, activityRecords, campaignLeadListLinkField]);
