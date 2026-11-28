// Account health loop (Alex 2026-11-25, rules/RULES.md "Account health loop").
//  - An email account scoring under 60% on an inbox placement test is RESTED: cold daily limit 0
//    (1 if EmailBison refuses 0) for a week, old limit saved. Automatic; Alex is told in Slack.
//  - The next weekly (Friday) test is the retest. Better → the old limit comes back (automatic).
//    Still bad → the domain's blacklist result is read again, and a replacement (1 .com domain at
//    $9.99 + 2 Google accounts via Cheap Inboxes) goes to the Spam Remediation Queue + a Slack
//    decision. Nothing is bought without Alex's ✅ (then the existing n8n "Approve Domain
//    Replacement" flow prepares the purchase request).
//  - Also used by the bounce agent when one account is the cause of the bounces.
// Replaces the n8n "[Email Accounts] Automated Spam Protocol" (it never processed a test).
import type { Stage } from './index.js';
import type { JobContext } from '../context.js';
import { PermanentError } from '../errors.js';
import { createBisonClient } from '../providers/emailbison.js';
import { createAirtableClient, type AirtableClient } from '../providers/airtable.js';
import { DECISIONS, DF } from '../decisions/fields.js';
import { logActivity } from '../activity.js';
import { alert } from '../log.js';
import { saveReport, slackReports } from '../hq/reports.js';
import { trackClose, trackTask } from '../hq/agentTasks.js';

/** HQ: one Riley task per rested account (rest → retest → recovered or replaced). */
export const restTaskKey = (accountRecordId: string) => `rest:${accountRecordId}`;

export const PLACEMENT = 'tblGjv6A5r7md3kxX';
export const PT = {
  email: 'fldBOeDrX0BGFeY6X', emailId: 'fld0Nxt1E3rI6lLFX', workspaceId: 'fldN4eGJiYsVTJwjl', testId: 'fldBis89MNzkqMYt2',
  overall: 'fldYG3TvlGxy61KFT', google: 'fldd7MeNv7pQBlfvn', outlook: 'fldG8jFN4BRJswCXH', testDate: 'fldJRrQ2jtZ8PkiPb', client: 'fldACO8xl50dYOjYt',
  processed: 'fldJD138nxBbamCB0', outcome: 'fld3e9lL2t10b1tYG', error: 'fldGYnsHNtyKLnF5i', processedAt: 'fldr1zN2ToL0wuz9r',
} as const;
export const ACCOUNTS = 'tblMSOBJ0wMgxSg4l';
export const EA = {
  email: 'fldRYSB93NNdBc4Js', emailId: 'fldR19WUqSSBVQcPO', workspaceId: 'fldWB4pvEgQ8aYlT2', client: 'flduDcGap2GSsqUia', dailyLimit: 'fldBP1gljUUM44JMk',
  status: 'fldzPjNciWil86nkI', healthReason: 'fldkU6bwyH0dsCGBE', campaigns: 'fldJJWRwowtWJhIfg', domains: 'fldzuKJl0AnFCtYEB',
  stage: 'fldkK0KB2ttWIqKul', restStarted: 'fldZID9r0H6FhD0Ya', retestDue: 'fldPeFfqi3dxGQYrN', lastScore: 'fldIJE2zZVbkMIYuD', previousLimit: 'fld1jbMReaLxB73yL',
  failedTests: 'flddxhrjtkuW9LDMO', lastAction: 'fldfm2qyk8GoS6aJ8', error: 'fldUz0HiftgoiKp1j', lastTestId: 'fldh26scJnI2X5qEO', queue: 'fldjWXpKngzTrWEQV',
} as const;
export const DOMAINS = 'tblJHdcoT1x3vh3DN';
export const DM = { name: 'fld1CJjKp6bfC9nD8', blacklistStatus: 'fldpv3pjY2BycGXLm', blacklistCount: 'fldIDXl70fdK1wn9S', blacklistsFound: 'fldw6A1GnyKLq9GI6', lastBlacklistCheck: 'fldw3aT7ozv9pI2oQ' } as const;
export const QUEUE = 'tblaJZ3ru2TOiHOOM';
export const SQ = {
  name: 'fldu2RkpFCGwtdAUD', account: 'fldHln6UwRPQPCR2r', domain: 'fldA0Uas1X8cSJpIW', client: 'fldwr2yLg9xMCrvXH', action: 'fldWAjL5wchMXjLrb', reason: 'fldv5olz4qtXneILN',
  score: 'fldTfb27YyugnfObr', failed: 'fldho7a9IRUbXTVOP', status: 'fldqi6Adyoxi13ptt', approve: 'fldpQKr6EfqIuITBg', key: 'fldQOcWPnvuzSKQaB', createdAt: 'fldyKxTfrhUD1PJfk',
} as const;

/** Alex: under 60% = rest. */
export const PASS_SCORE = 60;
const DAY = 86_400_000;
const v = (x: unknown): string => (Array.isArray(x) ? v(x[0]) : x === undefined || x === null ? '' : typeof x === 'object' ? String((x as any).name ?? (x as any).id ?? '') : String(x)).trim();
const links = (x: unknown): string[] => (Array.isArray(x) ? x.map((y) => (typeof y === 'string' ? y : (y as any)?.id)).filter(Boolean) : []);
const n = (x: unknown, d = 0) => (Number.isFinite(Number(v(x))) && v(x) !== '' ? Number(v(x)) : d);

export type HealthAction = 'rest' | 'recover' | 'replace' | 'hold' | 'none';
/** Pure decision: what to do with this account after this test. */
export function decide(a: { stage: string; retestDue: string }, test: { score: number; at: string }): HealthAction {
  const poor = test.score < PASS_SCORE;
  const stage = a.stage || 'Monitoring';
  if (stage.startsWith('Replace')) return 'none'; // waiting for Alex's purchase approval
  if (stage !== 'Resting 7 Days') return poor ? 'rest' : 'none';
  const due = Date.parse(a.retestDue);
  const isRetest = !Number.isFinite(due) || Date.parse(test.at) >= due;
  if (!isRetest) return poor ? 'hold' : 'none';
  return poor ? 'replace' : 'recover';
}

function bisonFor(ctx: JobContext, teamId: number) {
  const apiKey = ctx.cfg.emailBisonKeys[ctx.cfg.bounceCheckKey];
  if (!apiKey) throw new PermanentError(`no EmailBison key on the server named EMAILBISON_KEY_${ctx.cfg.bounceCheckKey.toUpperCase()} (BOUNCE_CHECK_KEY)`);
  return createBisonClient({ apiKey, baseUrl: ctx.cfg.emailBisonBaseUrl, teamId });
}

/** Set the daily limit to 0 (or 1 when EmailBison will not take 0). Returns the limit that was set. */
async function restLimit(ctx: JobContext, b: ReturnType<typeof createBisonClient>, senderId: number, key: string): Promise<number> {
  return ctx.paid({
    callKey: `rest:${senderId}:${key}`, provider: 'emailbison', units: 0, scope: 'record',
    run: async () => {
      try { await b.setDailyLimit([senderId], 0); return 0; } catch { await b.setDailyLimit([senderId], 1); return 1; }
    },
    dryRunResult: () => 0,
  });
}

export interface RestInput { accountRecordId: string; senderId: number; teamId: number; email: string; reason: string; score?: number; testId?: string; restAt?: string; clientIds?: string[]; campaignIds?: string[] }

/** Rest one account for a week (shared by the weekly tests and the bounce agent). */
export async function restAccount(ctx: JobContext, at: Pick<AirtableClient, 'update' | 'get' | 'create' | 'list'>, i: RestInput): Promise<{ limit: number; previous: number }> {
  const b = bisonFor(ctx, i.teamId);
  const acct = await at.get(ACCOUNTS, i.accountRecordId, Object.values(EA));
  const f = acct?.fields ?? {};
  if (v(f[EA.stage]) === 'Resting 7 Days') return { limit: n(f[EA.dailyLimit]), previous: n(f[EA.previousLimit]) };
  let current = n(f[EA.dailyLimit], -1);
  if (current < 0) current = (await b.senderEmailDetails(i.senderId).catch(() => ({ dailyLimit: 15 }))).dailyLimit;
  const previous = current > 1 ? current : n(f[EA.previousLimit], 15) || 15;
  const limit = await restLimit(ctx, b, i.senderId, i.testId || i.restAt || 'bounce');
  const start = i.restAt ?? new Date().toISOString();
  const reasons = [...new Set([...(Array.isArray(f[EA.healthReason]) ? (f[EA.healthReason] as any[]).map(v) : []), i.reason.startsWith('Bounce') ? 'High Bounce Rate' : 'Poor Inbox Placement'])];
  await at.update(ACCOUNTS, i.accountRecordId, {
    [EA.stage]: 'Resting 7 Days', [EA.status]: 'Resting', [EA.healthReason]: reasons, [EA.dailyLimit]: limit, [EA.previousLimit]: previous,
    // Retest = the first weekly test 6.5+ days after the rest started (so next Friday's test counts).
    [EA.restStarted]: start, [EA.retestDue]: new Date(Date.parse(start) + 6.5 * DAY).toISOString(),
    // Last Spam Protocol Action is a dateTime field: the time only (the what is in the activity log).
    [EA.failedTests]: n(f[EA.failedTests]) + 1, [EA.lastAction]: new Date().toISOString(), [EA.error]: '',
    ...(i.score !== undefined ? { [EA.lastScore]: i.score } : {}), ...(i.testId ? { [EA.lastTestId]: i.testId } : {}),
  });
  await logActivity(ctx.cfg, { event: `Account rested 7 days: ${i.email}`, type: 'Fixed', agent: 'Atlas', details: `${i.reason}\nDaily limit ${previous} → ${limit} until the next weekly placement test.`, emailAccountRecordIds: [i.accountRecordId], clientRecordIds: i.clientIds ?? links(f[EA.client]), campaignRecordIds: i.campaignIds ?? links(f[EA.campaigns]), jobId: ctx.job.id });
  // HQ: Riley's task until the retest (a planned wait: not "stalled" before the retest is due).
  const retest = new Date(Date.parse(start) + 6.5 * DAY);
  await trackTask(ctx.db, {
    agent: 'Atlas', key: restTaskKey(i.accountRecordId), title: `Rest ${i.email} until its retest`, status: 'in_progress', priority: 'normal',
    note: `Resting: daily limit ${previous} → ${limit}. ${i.reason}`, due: retest, waitingUntil: retest, link: null, decision: null,
    job: { kind: 'account.health', recordId: 'account-health', input: {} },
  });
  return { limit, previous };
}

/** Why a placement test could not be processed, in plain words, and who fixes it. Pure. */
export function failureReason(msg: string): { key: string; text: string } {
  const m = String(msg ?? '');
  if (/no Email Accounts record/i.test(m)) return { key: 'no-account', text: 'No Email Accounts row in Airtable for this inbox (the Email Accounts sync has not added it, or the test has no Email ID)' };
  if (/INVALID_VALUE_FOR_COLUMN|INVALID_MULTIPLE_CHOICE|cannot (parse|accept)|422/i.test(m)) return { key: 'airtable-refused', text: 'Airtable refused the update (a field got the wrong kind of value: a code bug)' };
  if (/EMAILBISON_KEY|BOUNCE_CHECK_KEY|emailbison|sender|daily.?limit|\b40[134]\b|\b429\b|\b5\d\d\b/i.test(m)) return { key: 'emailbison', text: 'EmailBison refused the daily-limit change (key, workspace or rate limit)' };
  return { key: 'other', text: 'Another error' };
}
/** The "could not process" part of the report, grouped by reason, with who fixes it. Pure. */
export function failureLines(failed: string[]): string[] {
  if (!failed.length) return [];
  const groups = new Map<string, { text: string; items: string[]; sample: string }>();
  for (const f of failed) {
    const i = f.indexOf(': ');
    const email = i > 0 ? f.slice(0, i) : f, msg = i > 0 ? f.slice(i + 2) : '';
    const r = failureReason(msg);
    const g = groups.get(r.key) ?? { text: r.text, items: [], sample: msg };
    g.items.push(email); groups.set(r.key, g);
  }
  const out = [`:grey_question: Could not process ${failed.length} test${failed.length === 1 ? '' : 's'}. Riley fixes this; these inboxes were not moved on in the spam protocol.`];
  for (const g of groups.values()) {
    const note = g.text.startsWith('Airtable refused') ? '. The daily limit may already be 0 in EmailBison for these: Riley checks them' : '';
    out.push(`• ${g.text}: ${g.items.length} (${g.items.slice(0, 5).join(', ')}${g.items.length > 5 ? `, +${g.items.length - 5} more` : ''})${note}${g.sample ? `. Error: ${g.sample.slice(0, 160)}` : ''}`);
  }
  out.push('The tests are marked Failed in Inbox Placement Testing; the next weekly test is read again.');
  return out;
}

export const accountHealthStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  if (!cfg.airtableApiKey) throw new PermanentError('no AIRTABLE_API_KEY on the server');
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  const from = String(ctx.job.input.from ?? cfg.accountHealthFrom);
  // LEN(…&'') keeps a real 0% score: Airtable treats 0 as equal to '' (11/28: 30 inboxes at 0% were skipped).
  const tests = await at.list(PLACEMENT, `AND(NOT({Spam Protocol Processed}),IS_AFTER(CREATED_TIME(),'${from}'),LEN({Overall Score}&'')>0)`, Object.values(PT), Number(ctx.job.input.max ?? 300), { sortField: 'Test Date' });
  const out = { tests: tests.length, rested: [] as string[], recovered: [] as string[], replace: [] as string[], held: 0, ok: 0, failed: [] as string[] };

  for (const t of tests) {
    const tf = t.fields;
    const email = v(tf[PT.email]), emailId = n(tf[PT.emailId]), ws = n(tf[PT.workspaceId]), score = n(tf[PT.overall], -1);
    const testAt = t.createdTime ?? (v(tf[PT.testDate]) ? `${v(tf[PT.testDate])}T12:00:00.000Z` : new Date().toISOString());
    const mark = (outcome: string, error = '') => ctx.dryRun ? Promise.resolve() : at.update(PLACEMENT, t.id, { [PT.processed]: true, [PT.outcome]: outcome, [PT.error]: error, [PT.processedAt]: new Date().toISOString() });
    try {
      const acct = (await at.list(ACCOUNTS, `{Email ID}=${emailId}`, Object.values(EA), 3)).find((a) => !ws || n(a.fields[EA.workspaceId]) === ws) ?? null;
      if (!acct) { const why = `no Email Accounts record with Email ID ${emailId}`; await mark('Failed', why); out.failed.push(`${email}: ${why}`); continue; }
      const af = acct.fields;
      const action = decide({ stage: v(af[EA.stage]), retestDue: v(af[EA.retestDue]) }, { score, at: testAt });
      const clients = links(af[EA.client]), camps = links(af[EA.campaigns]);
      if (ctx.dryRun) { (action === 'rest' ? out.rested : action === 'recover' ? out.recovered : action === 'replace' ? out.replace : []).push(email); continue; }

      if (action === 'rest') {
        await restAccount(ctx, at, { accountRecordId: acct.id, senderId: emailId, teamId: ws, email, reason: `Inbox placement ${score}% (under ${PASS_SCORE}%)`, score, testId: v(tf[PT.testId]) || t.id, restAt: testAt, clientIds: clients, campaignIds: camps });
        await mark('Rest Started'); out.rested.push(`${email} (${score}%)`);
      } else if (action === 'recover') {
        const back = n(af[EA.previousLimit], 15) || 15;
        await ctx.paid({ callKey: `recover:${emailId}:${t.id}`, provider: 'emailbison', units: 0, scope: 'record', run: async () => { await bisonFor(ctx, ws).setDailyLimit([emailId], back); return back; }, dryRunResult: () => 0 });
        await at.update(ACCOUNTS, acct.id, { [EA.stage]: 'Recovered', [EA.status]: 'Healthy', [EA.dailyLimit]: back, [EA.lastScore]: score, [EA.lastTestId]: v(tf[PT.testId]),
          [EA.healthReason]: (Array.isArray(af[EA.healthReason]) ? (af[EA.healthReason] as any[]).map(v) : []).filter((r) => r !== 'Poor Inbox Placement' && r !== 'High Bounce Rate'), [EA.lastAction]: new Date().toISOString() });
        await logActivity(cfg, { event: `Account recovered: ${email}`, type: 'Fixed', agent: 'Atlas', details: `Retest ${score}% (${PASS_SCORE}%+). Daily limit back to ${back}.`, emailAccountRecordIds: [acct.id], clientRecordIds: clients, campaignRecordIds: camps, jobId: ctx.job.id });
        await trackClose(ctx.db, restTaskKey(acct.id), `Recovered: retest ${score}%, daily limit back to ${back}`);
        await mark('Recovered'); out.recovered.push(`${email} (${score}%)`);
      } else if (action === 'replace') {
        // Step: check the domain blacklist again before replacing.
        const domainId = links(af[EA.domains])[0];
        const d = domainId ? await at.get(DOMAINS, domainId, Object.values(DM)).catch(() => null) : null;
        const dom = d ? v(d.fields[DM.name]) : email.split('@')[1] ?? '';
        const bl = d ? { status: v(d.fields[DM.blacklistStatus]), count: n(d.fields[DM.blacklistCount]), found: v(d.fields[DM.blacklistsFound]), checked: v(d.fields[DM.lastBlacklistCheck]) } : null;
        const blText = bl ? `Domain ${dom}: blacklist ${bl.status || 'unknown'}${bl.count ? ` (${bl.count}: ${bl.found.slice(0, 200)})` : ''}${bl.checked ? `, checked ${bl.checked.slice(0, 10)}` : ''}.` : `Domain ${dom}: no blacklist result on file.`;
        const reason = `Failed the 7-day retest at ${score}% (rested since ${v(af[EA.restStarted]).slice(0, 10)}). ${blText}`;
        const spec = `Replace with 1 new .com domain ($9.99) + 2 Google accounts (Cheap Inboxes). Every domain keeps 2 accounts.`;
        const key = `${acct.id}:${v(tf[PT.testId]) || t.id}:replace`;
        const exists = (await at.list(QUEUE, `{Automation Key}='${key}'`, [SQ.key], 1)).length > 0;
        let decisionId = '';
        if (!exists) {
          const qId = await at.create(QUEUE, {
            [SQ.name]: `Replace Domain — ${email}`, [SQ.account]: [acct.id], ...(domainId ? { [SQ.domain]: [domainId] } : {}), ...(clients.length ? { [SQ.client]: clients } : {}),
            [SQ.action]: 'Replace Domain', [SQ.reason]: `${reason}\n${spec}`, [SQ.score]: score, [SQ.failed]: n(af[EA.failedTests]) + 1, [SQ.status]: 'Pending Review',
            [SQ.approve]: false, [SQ.key]: key, [SQ.createdAt]: new Date().toISOString(),
          });
          decisionId = await at.create(DECISIONS, {
            [DF.title]: `Replace ${dom}? (${email} failed its retest at ${score}%)`, [DF.agent]: 'Atlas', [DF.status]: 'New',
            [DF.issue]: reason, [DF.checked]: `${blText} The account stays at 0/day meanwhile.`, [DF.fix]: spec,
            [DF.details]: `Spam Remediation Queue record ${qId}. ✅ ticks Approve Purchase there; the card is charged only in Buy Domains & Inboxes.`,
            [DF.action]: 'Approve Purchase', [DF.actionInput]: JSON.stringify({ queueRecordId: qId }),
          });
        }
        await at.update(ACCOUNTS, acct.id, { [EA.stage]: 'Replace Domain', [EA.status]: 'Spam', [EA.lastScore]: score, [EA.failedTests]: n(af[EA.failedTests]) + 1, [EA.lastAction]: new Date().toISOString() });
        await logActivity(cfg, { event: `Replacement waiting for approval: ${dom}`, type: 'Waiting for approval', agent: 'Atlas', details: `${reason}\n${spec}`, emailAccountRecordIds: [acct.id], clientRecordIds: clients, campaignRecordIds: camps, jobId: ctx.job.id });
        await trackTask(ctx.db, {
          agent: 'Atlas', key: restTaskKey(acct.id), title: `Rest ${email} until its retest`, status: 'waiting_alex',
          note: `Failed the retest at ${score}%: replace ${dom} (1 .com + 2 Google accounts)? Waiting for your OK`, link: 'decisions/Campaigns',
          job: null, waitingUntil: null, ...(decisionId ? { decision: decisionId } : {}),
        });
        await mark('Replace Domain'); out.replace.push(`${email} (${score}%)`);
      } else {
        if (action === 'hold') out.held++; else out.ok++;
        await at.update(ACCOUNTS, acct.id, { [EA.lastScore]: score }).catch(() => undefined);
        await mark('No Action');
      }
    } catch (e) {
      const msg = String((e as Error).message ?? e).slice(0, 300);
      await mark('Failed', msg).catch(() => undefined); out.failed.push(`${email}: ${msg}`);
    }
  }

  if (!ctx.dryRun && (out.rested.length || out.recovered.length || out.replace.length || out.failed.length)) {
    const list = (xs: string[]) => xs.slice(0, 15).map((x) => `• ${x}`).join('\n') + (xs.length > 15 ? `\n…and ${xs.length - 15} more` : '');
    const lines = [
      `Account health (Atlas), ${tests.length} placement test${tests.length === 1 ? '' : 's'} read:`,
      out.rested.length ? `:zzz: Rested 7 days (under ${PASS_SCORE}%), daily limit 0:\n${list(out.rested)}` : '',
      out.recovered.length ? `:white_check_mark: Recovered, limit restored:\n${list(out.recovered)}` : '',
      out.replace.length ? `:shopping_trolley: Failed the retest, replacement waiting for your ✅ (Decisions):\n${list(out.replace)}` : '',
      ...failureLines(out.failed),
    ].filter(Boolean);
    const nFailed = out.failed.length;
    await saveReport(ctx.db, {
      agent: 'Atlas', kind: 'account_health',
      title: `Account health: ${out.rested.length} rested, ${out.recovered.length} recovered, ${out.replace.length} to replace${nFailed ? `, ${nFailed} could not be processed (Riley)` : ''}`,
      body: lines.slice(1).join('\n'), urgent: nFailed > 0, jobId: ctx.job.id, dedupeKey: `account-health:${ctx.job.id}`,
    });
    if (slackReports(cfg)) await alert(cfg.slackWebhookUrl, lines.join('\n'));
  }
  return {
    ...out, dryRun: ctx.dryRun,
    message: `${tests.length} placement tests: ${out.rested.length} rested, ${out.recovered.length} recovered, ${out.replace.length} replacement${out.replace.length === 1 ? '' : 's'} waiting for approval, ${out.held} still resting, ${out.ok} fine${out.failed.length ? `, ${out.failed.length} could not be processed` : ''}${ctx.dryRun ? ' (dry run: nothing changed)' : ''}`,
  };
};

/** On ✅ of a replacement decision: tick Approve Purchase on the queue record (n8n prepares the purchase request; the card charge still needs approval there). */
export const approvePurchaseStage: Stage = async (ctx) => {
  const cfg = ctx.cfg;
  const id = String(ctx.job.input.queueRecordId ?? '');
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) throw new PermanentError('input.queueRecordId is required');
  if (ctx.dryRun) return { message: `Dry run: would tick Approve Purchase on ${id}` };
  const at = createAirtableClient({ apiKey: cfg.airtableApiKey, baseId: cfg.airtableBaseId, baseUrl: cfg.airtableBaseUrl });
  await at.update(QUEUE, id, { [SQ.approve]: true, [SQ.status]: 'Approved' });
  const q = await at.get(QUEUE, id, [SQ.account, SQ.client, SQ.name]);
  await logActivity(cfg, { event: `Replacement approved: ${v(q?.fields[SQ.name]).replace(/^Replace Domain — /, '')}`, type: 'Approved', agent: 'Alex', emailAccountRecordIds: links(q?.fields[SQ.account]), clientRecordIds: links(q?.fields[SQ.client]), jobId: ctx.job.id });
  for (const acc of links(q?.fields[SQ.account])) await trackClose(ctx.db, restTaskKey(acc), 'Replacement approved: the purchase request is prepared next');
  return { message: 'Approve Purchase ticked: the purchase request is prepared next (the card is charged only after the final approval in Buy Domains & Inboxes).' };
};
