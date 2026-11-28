// One lead list, as the Airtable Lead List Center's record panel (Round 2, 2026-11-27): the stage, the
// next step, Automation status, and the same tabs: Overview · Source & ICP · Company Review · Contact
// Review · Verification · Enrichment · QA. Each tab has that stage's buttons (Generate filters, Check
// TAM, Company sample, Approve sample, Expand, Restart, Find contacts, Approve contacts, Verify,
// Recover with LeadMagic, Enrichment prompt / run / skip, Run QA). Each press writes what the screen
// writes; the engine runs it (dry run until its stage is in LIVE_STAGES). Build Campaign is on the
// campaign (Campaign Center), as in Airtable.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type LeadListDetailR2 } from '../../api';
import { BackLink, Card, cx, ErrorBox, ExtLink, go, Icon, PageSkeleton, Pill, SectionHeader, timeAgo } from '../../ui';
import { ActionBar, AutomationStatus, num, slash, slashTime, Tabs } from './shared';
import { ListCenterSection } from './CenterParity';

type Tab = 'overview' | 'source' | 'companies' | 'contacts' | 'verification' | 'enrichment' | 'qa';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'source', label: 'Source & ICP' }, { key: 'companies', label: 'Company Review' }, { key: 'contacts', label: 'Contact Review' },
  { key: 'verification', label: 'Verification' }, { key: 'enrichment', label: 'Enrichment' }, { key: 'qa', label: 'QA' },
];
const SECTION_OF_STAGE: Record<string, Tab> = { Draft: 'source', 'Source & ICP': 'source', Targeting: 'source', Searching: 'companies', 'Source Imported': 'companies', 'Contacts Ready': 'contacts', Verification: 'verification', Enrichment: 'enrichment', QA: 'qa', Ready: 'qa', Uploaded: 'qa' };

export function LeadListPage({ id }: { id: string }) {
  const [d, setD] = useState<LeadListDetailR2 | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const load = useCallback(() => { setError(''); api<LeadListDetailR2>(`/campaigns/lists/${encodeURIComponent(id)}`).then(setD).catch((e) => setError(e.message)); }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!d?.list.automation.locked) return;
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [d?.list.automation.locked, load]);
  const back = <BackLink label="Lead List Center" onClick={() => go(`campaigns/lists${d?.list.clientKey ? `/${encodeURIComponent(d.list.clientKey)}` : ''}`)} />;
  if (error) return <>{back}<ErrorBox error={error} retry={load} /></>;
  if (!d) return <>{back}<PageSkeleton kind="list" /></>;
  const l = d.list;
  const bar = (section: string) => <ActionBar className="mt-4" actions={d.actions.filter((a) => a.section === section)} what={`${l.name} · ${l.client}`} endpoint={`/campaigns/lists/${id}/action`} onDone={load} />;
  return (
    <div>
      {back}
      <Card className="sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-[24px] font-bold leading-tight tracking-tight sm:text-[26px]">{l.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <span>{l.client}</span><Pill tone="info">{l.stage}</Pill>{l.qa && l.qa !== 'Not Checked' && <Pill tone={l.qa === 'Passed' ? 'good' : 'warn'}>QA {l.qa}</Pill>}{l.test && <Pill>test</Pill>}
              {l.added && <span>· made {slash(l.added)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {l.sheet && <ExtLink href={l.sheet} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg hover:bg-hover">Open Google Sheet</ExtLink>}
            {l.campaigns.map((c) => <button key={c.id} onClick={() => go(`campaigns/${c.id}`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-[15px] font-semibold text-ink-fg shadow-card hover:bg-ink-hover"><Icon name="megaphone" size={17} />{c.name || 'Open the campaign'}</button>)}
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm"><span className="font-medium text-fg-2">Step {l.step} of {l.steps}</span></div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Lead list stage" aria-valuemin={0} aria-valuemax={l.steps} aria-valuenow={l.step}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((l.step / l.steps) * 100)}%` }} />
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-accent-soft px-3.5 py-3 text-[15px] text-fg"><Icon name="arrowRight" size={18} className="mt-0.5 shrink-0 text-accent-ink" /><span><span className="font-semibold">Next: </span>{d.next}</span>
          {SECTION_OF_STAGE[l.stage] && tab === 'overview' && <button onClick={() => setTab(SECTION_OF_STAGE[l.stage])} className="ml-auto shrink-0 text-sm font-semibold text-accent-ink hover:underline">Go to {TABS.find((t) => t.key === SECTION_OF_STAGE[l.stage])?.label}</button>}
        </div>
        <AutomationStatus a={l.automation} className="mt-4" />
      </Card>

      <div className="mt-5"><Tabs label="Lead list" value={tab} onChange={setTab} tabs={TABS} /></div>

      {tab === 'overview' && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[['Companies', l.company.total], ['Usable companies', l.company.good], ['Usable contacts', l.contact.good], ['Verified good', l.verify.good], ['Final direct', l.final.direct], ['Final generic', l.final.generic]].map(([k, v]) => (
              <div key={String(k)} className="rounded-2xl border border-line bg-surface p-4 shadow-card"><div className="text-xs text-muted">{k}</div><div className="tabular mt-1 text-[22px] font-bold leading-none text-fg">{Number(v) ? num(Number(v)) : '–'}</div></div>
            ))}
          </div>
          <Card className="p-4 text-sm text-fg-2">
            <Row k="Contacts found by">{l.source}</Row>
            <Row k="Emails verified by">{l.verifiers || 'Not verified yet'}</Row>
            <Row k="Linked campaign">{l.campaigns.length ? l.campaigns.map((c) => c.name || c.id).join(', ') : 'None: list only'}</Row>
          </Card>
          <History d={d} />
        </div>
      )}

      {tab === 'source' && (
        <div className="mt-4">
          <Card className="p-4 text-sm text-fg-2">
            <Row k="Targeting sentence (ICP)">{l.icp || <span className="text-warn">Not written yet (Lead List Center)</span>}</Row>
            {l.thesis && <Row k="Campaign thesis"><span className="whitespace-pre-line">{l.thesis}</span></Row>}
            <Row k="Company filters">{l.hasFilters ? l.filters : <span className="text-muted">Not generated yet</span>}</Row>
            <Row k="TAM (free count)">{l.tam ? (l.tam.status === 'complete' && l.tam.count !== null ? `${num(l.tam.count)} companies match (checked ${slash(l.tam.checkedAt)})` : l.tam.status === 'requested' ? 'Counting…' : l.tam.message || l.tam.status) : 'Not checked'}</Row>
          </Card>
          {bar('source')}
        </div>
      )}

      {tab === 'companies' && (
        <div className="mt-4">
          <Card className="p-4 text-sm text-fg-2">
            <Row k="Sample">{l.company.good || l.company.bad ? `${num(l.company.good)} fit, ${num(l.company.bad)} cut${l.company.rate !== null ? ` (${l.company.rate}% usable)` : ''}${l.company.status ? ` · ${l.company.status}` : ''}` : `Not run yet (sample size ${l.sampleSize})`}</Row>
            <Row k="Sample approved">{l.sampleApproved ? 'Yes' : 'No'}</Row>
            <Row k="Expansion target">{l.target ? num(l.target) : 'Not set (Lead List Center)'}</Row>
            <Row k="Deep review (DiscoGen)">{l.useDeepReview ? 'On: runs by itself after the sample and each expand' : 'Off'}</Row>
            {l.company.summary && <Row k="Summary"><span className="whitespace-pre-wrap">{l.company.summary}</span></Row>}
            <p className="mt-2 text-xs text-muted">Fit target 80% usable (85%+ preferred): a warning, never a lock (Alex 2026-11-23).</p>
          </Card>
          {bar('companies')}
        </div>
      )}

      {tab === 'contacts' && (
        <div className="mt-4">
          <Card className="p-4 text-sm text-fg-2">
            <Row k="Who to contact (Persona DNA)">{l.persona || <span className="text-muted">Not written</span>}</Row>
            <Row k="Contacts">{l.contact.good || l.contact.bad ? `${num(l.contact.good)} usable, ${num(l.contact.bad)} cut${l.contact.rate !== null ? ` (${l.contact.rate}% usable)` : ''}${l.contact.status ? ` · ${l.contact.status}` : ''}` : 'Not run yet'}</Row>
            <Row k="Contact sample approved">{l.contactApproved ? 'Yes' : 'No'}</Row>
            {l.contact.summary && <Row k="Summary"><span className="whitespace-pre-wrap">{l.contact.summary}</span></Row>}
          </Card>
          {bar('contacts')}
        </div>
      )}

      {tab === 'verification' && (
        <div className="mt-4">
          <Card className="p-4 text-sm text-fg-2">
            <Row k="Include">{[l.includeDirect && 'Direct', l.includeGeneric && 'Generic'].filter(Boolean).join(' + ') || 'Neither ticked'}</Row>
            <Row k="Verify result">{l.verify.good || l.verify.risky || l.verify.bad ? `${num(l.verify.good)} good · ${num(l.verify.risky)} risky · ${num(l.verify.bad)} bad` : 'Not run yet'}</Row>
            <Row k="Final leads">{l.final.leads ? `${num(l.final.leads)} (${num(l.final.direct)} direct, ${num(l.final.generic)} generic)` : '–'}</Row>
            <Row k="LeadMagic">{l.useLeadMagic ? 'On (risky direct contacts)' : 'Off'}</Row>
            <p className="mt-2 text-xs text-muted">MillionVerifier first; an email is never paid for twice. Catch-all is not treated as confirmed.</p>
          </Card>
          {bar('verification')}
        </div>
      )}

      {tab === 'enrichment' && (
        <div className="mt-4">
          <Card className="p-4 text-sm text-fg-2">
            <Row k="Custom Variables Requested">{l.customVars ? <span className="whitespace-pre-wrap">{l.customVars}</span> : <span className="text-muted">Nothing requested: skip enrichment if the copy only uses {'{FIRST_NAME}'} and {'{COMPANY}'}.</span>}</Row>
          </Card>
          {bar('enrichment')}
        </div>
      )}

      {tab === 'qa' && (
        <div className="mt-4">
          <Card className="p-4 text-sm text-fg-2">
            <Row k="QA">{l.qa || 'Not checked'}</Row>
            <Row k="Stage">{l.stage}</Row>
            <p className="mt-2 text-xs text-muted">QA needs the campaign copy: it proves every lead has the variables the copy uses. Build Campaign is on the campaign (Campaign Center).</p>
          </Card>
          {bar('qa')}
        </div>
      )}
      {/* Center parity (2026-11-28): the Lead List Center's field edits and non-engine buttons for this tab. */}
      <ListCenterSection id={id} tab={tab} onDone={load} />
      <p className="mt-6 text-xs text-muted">Read {timeAgo(d.readAt) || 'just now'} from Airtable and the engine. Buttons press the same engine steps as the Airtable Lead List Center.</p>
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return <div className="grid gap-0.5 border-b border-line py-2 last:border-0 sm:grid-cols-[200px_1fr] sm:gap-3"><div className="text-muted">{k}</div><div className="min-w-0 break-words text-fg-2">{children}</div></div>;
}

function History({ d }: { d: LeadListDetailR2 }) {
  return (
    <section>
      <SectionHeader title="Stage history" icon="history" right={<span className="text-xs text-muted">engine</span>} />
      <Card className="p-0">
        {d.history.length ? (
          <ol className="divide-y divide-line">
            {d.history.slice(0, 30).map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex gap-3 px-5 py-3">
                <span className="tabular w-24 shrink-0 text-xs text-muted sm:w-28">{slashTime(h.at)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[15px] text-fg">{h.what}<Pill tone={h.status === 'failed' ? 'bad' : h.status === 'succeeded' ? 'good' : 'plain'}>{h.status}</Pill>{h.dryRun && <Pill>dry run</Pill>}</div>
                  {h.message && <div className={cx('mt-0.5 break-words text-xs', h.status === 'failed' ? 'text-bad' : 'text-muted')}>{h.message}</div>}
                </div>
              </li>
            ))}
          </ol>
        ) : <div className="px-5 py-4 text-sm text-muted">No engine steps on this list yet.</div>}
      </Card>
    </section>
  );
}
