// HQ Batch 3 (Alex, 2026-11-27): Email bounce analytics and verification performance, back from the
// Airtable Spam Center dashboard and the switched-off n8n job (it ran every minute, forever).
//   - Bounces: the Emails rows with Lead Status = Bounced (the same rows the Spam Center charts read):
//     bounce code, hard vs soft, what kind (address not found / blocked / mailbox full), and where it
//     landed (Google / Microsoft / a security gateway / a custom mail server). The landing comes from
//     the row's "Email Sending Provider"; when that is empty, the bounce agent's MX lookup fills it
//     (at most MX_MAX domains per read, cached a day). Filters: client, campaign, sending inbox, period.
//     Every view ends with ONE short conclusion (Problem → Decision → what supports it).
//   - Verification: per campaign, which verifier produced the emails (the lead list's Direct/Generic
//     verifier, the row's Verification Provider when tagged) and what bounced; many "address not
//     found" (550 / 5.1.x) = a verification problem.
// Computed on demand from batched, capped Airtable reads, cached 10 minutes for everyone. No loop, no
// writes, no money.
import type { Db } from '../db/pool.js';
import type { AirtableRecord } from '../providers/airtable.js';
import type { HqAirtable } from './decisions.js';
import { EMAILS, val } from '../agents/emailsFields.js';
import { classifyBounce, providerOfMx } from '../campaign/bounceDiagnosis.js';
import { codeLabel, smtpOf, ENHANCED_MEANING } from './smtpCodes.js';
import { BK, EF } from '../agents/emailsFields.js';
import { providersFor } from '../stages/bounceAgent.js';
import { CAMPAIGNS_T, KF, LEAD_LISTS_T, WORKSPACES_T, clientIndex, factsOf } from './campaigns.js';

/** Emails fields read for a bounce (airtable/SCHEMA.md "Emails"). Never the conversation history. */
export const BF = {
  lead: 'fldVkWkLFCGP9O1Aw', status: 'fldr2uNiscZfeCNiT', provider: 'fldD5cEvVI13RUIou', inbox: 'fldxUxP1jBXt3u7dl', campaignName: 'fldEv7oM5BJPKJpiR',
  campaignId: 'fldv0o5rhmd7jXDrt', campaign: 'fldo7ZyNc9qEEyJwF', statusAt: 'fldwa9Wrdtu0iJum3', type: 'fldZBjkt6nS9Ezupd', code: 'fldXVoZUzByVTFmqo',
  latest: 'fldjG76LvUTv60Pzj', bisonWs: 'fldCjo0mB0snziNZQ', clients: 'fldtPAlC0MDPHTWcl',
  verifier: 'fldJgGQYVOey8uAoe', emailType: 'fld8rDRRhFLfgfs9r', path: 'fldLxXGcd0z3GwZNs',
} as const;
/** Lead Lists fields for "which verifier produced the emails". */
export const VL = {
  name: 'fldbg5PAnKyFHc3uy', fileName: 'fldlOo9lL9jvvhGo9', genericVerifier: 'fldX8cOpx3TcGX2jf', directVerifier: 'fldlJtYONrHGdyXoh',
  finalGeneric: 'fld0FHomkh3uyx0FD', finalDirect: 'fldQZJCpTofahmTkl', contactSource: 'fldwoK7IcKH6NYgVJ', sourceType: 'fldJSSY0QTMU5pzsQ',
} as const;
/** Verification Performance (the old n8n job's cohorts; read when present, may be stale). */
export const VERIF_PERF = 'tblem2vNdX0hzHdxg';
export const VP = {
  campaign: 'fldVreowXcJujZwAT', campaignName: 'fldApebMTDlduga98', provider: 'fldWxfmlKIIPquESE', emailType: 'fldyUWmReRFHVKlqM',
  leads: 'fldOvEh2bQSTj7Bt5', contacted: 'fldz3nmbJUZqsblLa', bounces: 'fldD0CusLUUVYk6rK', updated: 'fldBQSIgg4ibW9Vw8',
} as const;
export const BOUNCE_LIMITS = { maxRows: 5000, minToJudge: 10, majority: 0.5, mxMax: 150, periods: [7, 30, 90] as const, cacheMs: 10 * 60_000 } as const;

export type Kind = 'not_found' | 'blocked' | 'full' | 'other';
export type Landing = 'google' | 'microsoft' | 'gateway' | 'custom' | 'other' | 'unknown';
export const KIND_LABEL: Record<Kind, string> = { not_found: 'Address not found', blocked: 'Blocked (spam / policy)', full: 'Mailbox full', other: 'Other / temporary' };
export const LANDING_LABEL: Record<Landing, string> = { google: 'Google', microsoft: 'Microsoft', gateway: 'Security gateway', custom: 'Custom mail server', other: 'Other host', unknown: 'Unknown' };
export interface BounceRow {
  id: string; lead: string; domain: string; inbox: string; campaign: string; campaignRec: string; clientKey: string; client: string; at: string;
  /** The 3-digit SMTP code (Round 2: the main label), e.g. "550", or "Unknown". */ code: string;
  /** The enhanced code as detail ("5.1.1"), or "". */ enhanced: string; meaning: string;
  hard: boolean | null; kind: Kind; landing: Landing; gateway: string; verifier: string; emailType: string;
}

const GATEWAY_NAMES = /mimecast|proofpoint|barracuda|sophos|ironport|cisco|symantec|broadcom|trend|forcepoint|fortinet|hornet|spamtitan|mailprotector|zix|trustwave/i;
/** Where a bounce landed, from the Emails "Email Sending Provider" choice or an MX provider name. Pure. */
export function landingOf(provider: string): { landing: Landing; gateway: string } {
  const p = provider.trim();
  if (!p || /^unknown$/i.test(p)) return { landing: 'unknown', gateway: '' };
  if (/^google/i.test(p)) return { landing: 'google', gateway: '' };
  if (/outlook|microsoft|office ?365/i.test(p)) return { landing: 'microsoft', gateway: '' };
  if (GATEWAY_NAMES.test(p)) return { landing: 'gateway', gateway: p };
  if (/custom mail server/i.test(p)) return { landing: 'custom', gateway: '' };
  return { landing: 'other', gateway: '' };
}
/** The kind of a bounce: from the notice text when there is one, else from the code (3-digit codes are approximate). Pure. */
export function kindOf(text: string, code: string): Kind {
  if (text.trim()) {
    const k = classifyBounce(text);
    if (k !== 'other') return k === 'bad_address' ? 'not_found' : k === 'mailbox_full' ? 'full' : 'blocked';
  }
  if (/^5\.1\.\d+$|^5\.4\.[14]$/.test(code) || ['550', '551', '553'].includes(code)) return 'not_found';
  if (/^5\.7\.\d+$/.test(code) || ['554', '571', '521'].includes(code)) return 'blocked';
  if (/^5\.2\.2$|^4\.2\.2$/.test(code) || code === '552') return 'full';
  return 'other';
}
/** Hard (5xx) or soft (any 4xx, RULES.md round 2): the code first; the Bounce Type only when there is no code. Pure. */
export function hardOf(type: string, code: string): boolean | null {
  if (/^5/.test(code)) return true;
  if (/^4/.test(code)) return false;
  if (/hard/i.test(type)) return true;
  if (/soft/i.test(type)) return false;
  return null;
}
const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').slice(0, 4000);

/** One Emails record → one bounce (client from the workspace link). Pure. */
export function bounceOf(r: AirtableRecord, clients: Map<string, { key: string; name: string; active: boolean }>, bisonToClient: Map<string, { key: string; name: string; active: boolean }>, mx: Map<string, string>): BounceRow {
  const f = r.fields;
  const lead = val(f[BF.lead]).toLowerCase();
  const domain = lead.split('@')[1] ?? '';
  const text = strip(val(f[BF.latest]));
  const smtp = smtpOf(text, val(f[BF.code]) === 'Unk' ? '' : val(f[BF.code]));
  const fromField = val(f[BF.provider]);
  const { landing, gateway } = landingOf(fromField || (mx.get(domain) ?? ''));
  const linkWs = (Array.isArray(f[BF.clients]) ? (f[BF.clients] as any[]).map((x) => (typeof x === 'string' ? x : x?.id)) : [])[0] ?? '';
  const c = clients.get(linkWs) ?? bisonToClient.get(val(f[BF.bisonWs])) ?? null;
  return {
    id: r.id, lead, domain, inbox: val(f[BF.inbox]).toLowerCase(), campaign: val(f[BF.campaignName]) || 'No campaign', campaignRec: (Array.isArray(f[BF.campaign]) ? val(f[BF.campaign]) : '') || '',
    clientKey: c?.key ?? 'none', client: c?.name ?? 'No client', at: val(f[BF.statusAt]) || r.createdTime || '',
    code: smtp.code, enhanced: smtp.enhanced, meaning: smtp.meaning, hard: hardOf(val(f[BF.type]), smtp.code), kind: kindOf(text, smtp.enhanced || smtp.code), landing, gateway,
    verifier: normVerifier(val(f[BF.verifier])), emailType: /generic/i.test(val(f[BF.emailType])) ? 'Generic' : /direct/i.test(val(f[BF.emailType])) ? 'Direct' : '',
  };
}
/** Round 2: the verifiers in use are MillionVerifier and LeadMagic; any other named one is "Other" ('' = none recorded). */
export const VERIFIERS = ['MillionVerifier', 'LeadMagic', 'Other'] as const;
export const normVerifier = (v: string) => (/million/i.test(v) ? 'MillionVerifier' : /lead ?magic/i.test(v) ? 'LeadMagic' : v.trim() && !/^(none|unknown|n\/a)$/i.test(v.trim()) ? 'Other' : '');

/* ---------- Grouping and the one conclusion (pure) ---------- */
export interface Slice { key: string; label: string; n: number; share: number }
const slices = (rows: BounceRow[], keyOf: (r: BounceRow) => string, labelOf: (k: string) => string = (k) => k, top = 8): Slice[] => {
  const m = new Map<string, number>();
  for (const r of rows) { const k = keyOf(r); m.set(k, (m.get(k) ?? 0) + 1); }
  const all = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = all.slice(0, top), rest = all.slice(top).reduce((a, [, n]) => a + n, 0);
  const out = head.map(([k, n]) => ({ key: k, label: labelOf(k), n, share: rows.length ? n / rows.length : 0 }));
  if (rest) out.push({ key: 'rest', label: `${all.length - top} more`, n: rest, share: rest / rows.length });
  return out;
};
export interface Conclusion { problem: string; decision: string; support: string; text: string; tone: 'bad' | 'warn' | 'good' | 'info' }
const pc = (x: number) => `${Math.round(x * 100)}%`;
/** One short conclusion for what's on screen (Alex's bounce method, RULES.md 2026-11-25). Pure. */
export function concludeBounces(rows: BounceRow[]): Conclusion {
  const n = rows.length;
  const done = (problem: string, decision: string, support: string, tone: Conclusion['tone']): Conclusion => ({ problem, decision, support, tone, text: `${problem} → ${decision}` });
  if (n < BOUNCE_LIMITS.minToJudge) return done(n ? `Only ${n} bounce${n === 1 ? '' : 's'} here` : 'No bounces here', 'too few to judge; nothing to stop', `${n} bounce${n === 1 ? '' : 's'} in this view (needs ${BOUNCE_LIMITS.minToJudge}+).`, n ? 'info' : 'good');
  const share = (pred: (r: BounceRow) => boolean) => rows.filter(pred).length / n;
  const topCode = slices(rows, (r) => r.code, undefined, 1)[0];
  const gw = slices(rows.filter((r) => r.landing === 'gateway'), (r) => r.gateway, undefined, 1)[0];
  const notFound = share((r) => r.kind === 'not_found'), blocked = share((r) => r.kind === 'blocked');
  const custom = share((r) => r.landing === 'custom'), micro = share((r) => r.landing === 'microsoft');
  const acct = slices(rows.filter((r) => r.inbox), (r) => r.inbox, undefined, 1)[0];
  const M = BOUNCE_LIMITS.majority;
  if (gw && gw.n / n >= M) return done(`${pc(gw.n / n)} of bounces land on ${gw.key}`, `stop sending to ${gw.key}`, `${gw.n} of ${n} bounces. Top code ${topCode.key} (${pc(topCode.share)}).`, 'bad');
  if (notFound >= M && custom >= M) return done(`Most bounces are ${topCode.key} "address not found" on custom mail servers`, 'stop sending to custom mail servers and re-verify the list', `${pc(notFound)} address not found · ${pc(custom)} custom mail servers · ${n} bounces.`, 'bad');
  if (notFound >= M) return done(`Most bounces are ${topCode.key} "address not found"`, 'a verification problem: check the verifier on this list (Verification tab)', `${pc(notFound)} of ${n} bounces are addresses that do not exist.`, 'bad');
  if (blocked >= M && acct && acct.n / n >= M) return done(`Most bounces are blocks from one inbox (${acct.key})`, 'rest that inbox', `${acct.n} of ${n} bounces came from it · ${pc(blocked)} blocked.`, 'bad');
  if (blocked >= M && micro >= M) return done('Most bounces are Microsoft blocking us', 'pause sending to Outlook / Microsoft on this campaign', `${pc(blocked)} blocked · ${pc(micro)} on Microsoft · ${n} bounces.`, 'bad');
  if (blocked >= M) return done(`Most bounces are ${topCode.key} blocks (spam / policy)`, 'check the domain, the copy and the inboxes (Atlas)', `${pc(blocked)} of ${n} bounces were blocked.`, 'warn');
  return done('Bounces are mixed', 'nothing to stop yet; keep watching', `Top code ${topCode.key} (${pc(topCode.share)}) · ${pc(notFound)} not found · ${pc(blocked)} blocked · ${n} bounces.`, 'info');
}

/** Round 2: per 3-digit code, its meaning, soft/hard and the enhanced codes under it (detail). Pure. */
export function codeDetail(rows: BounceRow[], top = 8) {
  return slices(rows, (r) => r.code, codeLabel, top).map((s) => {
    const mine = s.key === 'rest' ? [] : rows.filter((r) => r.code === s.key);
    const enh = new Map<string, number>();
    for (const r of mine) if (r.enhanced) enh.set(r.enhanced, (enh.get(r.enhanced) ?? 0) + 1);
    const enhanced = [...enh.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([code, n]) => ({ code, n, meaning: ENHANCED_MEANING[code] ?? '' }));
    const meaning = enhanced[0]?.meaning && enhanced[0].n / Math.max(1, s.n) >= 0.5 ? enhanced[0].meaning : (mine[0]?.meaning ?? '');
    return { ...s, code: s.key, meaning: s.key === 'rest' ? '' : (codeLabel(s.key).split(' · ')[1] ?? ''), detail: meaning, soft: s.key[0] === '4' ? true : s.key[0] === '5' ? false : null, enhanced };
  });
}

export interface BounceFilter { client?: string; campaign?: string; account?: string }
export function filterBounces(rows: BounceRow[], f: BounceFilter): BounceRow[] {
  return rows.filter((r) => (!f.client || r.clientKey === f.client) && (!f.campaign || r.campaign === f.campaign || r.campaignRec === f.campaign) && (!f.account || r.inbox === f.account));
}
/** Everything the Bounces tab draws. Pure. */
export function bounceSummary(all: BounceRow[], f: BounceFilter) {
  const rows = filterBounces(all, f);
  const inClient = filterBounces(all, { client: f.client });
  const hard = rows.filter((r) => r.hard === true).length, soft = rows.filter((r) => r.hard === false).length;
  return {
    total: rows.length,
    byCode: slices(rows, (r) => r.code, codeLabel),
    codes: codeDetail(rows),
    byType: [{ key: 'hard', label: 'Hard (5xx)', n: hard }, { key: 'soft', label: 'Soft (4xx)', n: soft }, { key: 'unknown', label: 'Unknown', n: rows.length - hard - soft }].filter((x) => x.n).map((x) => ({ ...x, share: x.n / rows.length })),
    byKind: slices(rows, (r) => r.kind, (k) => KIND_LABEL[k as Kind] ?? k),
    byLanding: slices(rows, (r) => r.landing, (k) => LANDING_LABEL[k as Landing] ?? k),
    gateways: slices(rows.filter((r) => r.landing === 'gateway'), (r) => r.gateway, undefined, 6),
    byCampaign: slices(rows, (r) => r.campaign, undefined, 6),
    byAccount: slices(rows.filter((r) => r.inbox), (r) => r.inbox, undefined, 6),
    conclusion: concludeBounces(rows),
    options: {
      clients: [...new Map(all.filter((r) => r.clientKey !== 'none').map((r) => [r.clientKey, r.client])).entries()].map(([key, name]) => ({ key, name, count: all.filter((r) => r.clientKey === key).length })).sort((a, b) => a.name.localeCompare(b.name)),
      campaigns: slices(inClient, (r) => r.campaign, undefined, 60).filter((s) => s.key !== 'rest').map((s) => ({ key: s.key, name: s.key, count: s.n })),
      accounts: slices(f.campaign ? filterBounces(inClient, { campaign: f.campaign }) : inClient, (r) => r.inbox || '', undefined, 80).filter((s) => s.key && s.key !== 'rest').map((s) => ({ key: s.key, name: s.key, count: s.n })),
    },
  };
}

/* ---------- Verification performance (pure) ---------- */
export interface ListVerifiers { id: string; name: string; direct: string; generic: string; directCount: number; genericCount: number; source: string }
export interface CampaignRef { id: string; name: string; clientKey: string; client: string; contacted: number; bounce: number; status: string; lists: string[] }
export interface Cohort { verifier: string; emailType: string; source: string; leads: number | null; contacted: number | null; contactedEstimated: boolean; bounces: number; notFound: number; rate: number | null }
export interface VerifCampaign { id: string; name: string; client: string; clientKey: string; status: string; contacted: number; bounce: number; bounces: number; notFound: number; cohorts: Cohort[]; verdict: 'problem' | 'watch' | 'ok' | 'few'; line: string }
const verifierName = (v: string) => normVerifier(v);
/** Per campaign and verifier: emails, contacted (from the old cohorts, else estimated from the list mix), bounces, "address not found". Pure. */
export function verificationRows(campaigns: CampaignRef[], lists: Map<string, ListVerifiers>, bounces: BounceRow[], cohortRows: { campaignRec: string; campaignName: string; provider: string; emailType: string; leads: number; contacted: number; bounces: number }[]): VerifCampaign[] {
  const out: VerifCampaign[] = [];
  for (const c of campaigns) {
    const ls = c.lists.map((id) => lists.get(id)).filter((x): x is ListVerifiers => !!x);
    const mine = bounces.filter((b) => b.campaignRec === c.id || (!b.campaignRec && b.campaign === c.name));
    const listTotal = ls.reduce((a, l) => a + l.directCount + l.genericCount, 0);
    const cohorts = new Map<string, Cohort>();
    const get = (verifier: string, emailType: string, source = '') => {
      const k = `${verifier}|${emailType}`;
      const x = cohorts.get(k) ?? { verifier, emailType, source, leads: null, contacted: null, contactedEstimated: false, bounces: 0, notFound: 0, rate: null };
      if (source && !x.source) x.source = source;
      cohorts.set(k, x);
      return x;
    };
    for (const l of ls) {
      if (l.directCount) { const x = get(verifierName(l.direct) || 'Other', 'Direct', l.source); x.leads = (x.leads ?? 0) + l.directCount; }
      if (l.genericCount) { const x = get(verifierName(l.generic) || 'Other', 'Generic', 'Company emails'); x.leads = (x.leads ?? 0) + l.genericCount; }
    }
    for (const b of mine) {
      const fromList = b.emailType ? ls.map((l) => verifierName(b.emailType === 'Generic' ? l.generic : l.direct)).find(Boolean) : '';
      const x = get(b.verifier || fromList || 'Other', b.emailType || 'Unknown');
      x.bounces++; if (b.kind === 'not_found') x.notFound++;
    }
    const old = cohortRows.filter((r) => r.campaignRec === c.id || (!r.campaignRec && r.campaignName === c.name));
    for (const r of old) { const x = get(verifierName(r.provider) || 'Other', r.emailType || 'Unknown'); x.contacted = (x.contacted ?? 0) + r.contacted; if (x.leads === null) x.leads = r.leads; }
    for (const x of cohorts.values()) {
      if (x.contacted === null && x.leads && listTotal && c.contacted) { x.contacted = Math.round((c.contacted * x.leads) / listTotal); x.contactedEstimated = true; }
      x.rate = x.contacted ? Math.round((x.bounces / x.contacted) * 1000) / 10 : null;
    }
    const list = [...cohorts.values()].sort((a, b) => b.bounces - a.bounces || (b.leads ?? 0) - (a.leads ?? 0));
    const bouncesN = mine.length, nf = mine.filter((b) => b.kind === 'not_found').length;
    const worst = list.find((x) => x.bounces >= BOUNCE_LIMITS.minToJudge && x.notFound / x.bounces >= BOUNCE_LIMITS.majority);
    const verdict: VerifCampaign['verdict'] = bouncesN < BOUNCE_LIMITS.minToJudge ? 'few' : worst && (c.bounce > 2.5 || (worst.rate ?? 0) > 2.5) ? 'problem' : nf / bouncesN >= BOUNCE_LIMITS.majority ? 'watch' : 'ok';
    const line = verdict === 'few' ? `${bouncesN} bounce${bouncesN === 1 ? '' : 's'}: too few to judge.`
      : verdict === 'problem' ? `${worst!.verifier} (${worst!.emailType}) emails: ${worst!.notFound} of ${worst!.bounces} bounces are "address not found" → a verification problem: re-verify before the next send.`
        : verdict === 'watch' ? `${pc(nf / bouncesN)} of ${bouncesN} bounces are "address not found", bounce ${c.bounce}% → watch the verifier.`
          : `Bounces are not mostly "address not found" (${pc(nf / Math.max(1, bouncesN))}) → verification looks fine.`;
    out.push({ id: c.id, name: c.name, client: c.client, clientKey: c.clientKey, status: c.status, contacted: c.contacted, bounce: c.bounce, bounces: bouncesN, notFound: nf, cohorts: list, verdict, line });
  }
  const order = { problem: 0, watch: 1, ok: 2, few: 3 } as const;
  return out.sort((a, b) => order[a.verdict] - order[b.verdict] || b.bounces - a.bounces || a.name.localeCompare(b.name));
}
/** Per verifier, across the campaigns shown. Pure. */
export function verifierTotals(rows: VerifCampaign[]) {
  const m = new Map<string, { verifier: string; leads: number; contacted: number; bounces: number; notFound: number }>();
  for (const r of rows) for (const c of r.cohorts) {
    const x = m.get(c.verifier) ?? { verifier: c.verifier, leads: 0, contacted: 0, bounces: 0, notFound: 0 };
    x.leads += c.leads ?? 0; x.contacted += c.contacted ?? 0; x.bounces += c.bounces; x.notFound += c.notFound;
    m.set(c.verifier, x);
  }
  return [...m.values()].map((x) => ({ ...x, rate: x.contacted ? Math.round((x.bounces / x.contacted) * 1000) / 10 : null, notFoundShare: x.bounces ? x.notFound / x.bounces : null })).sort((a, b) => b.bounces - a.bounces);
}

/* ---------- Reads (batched, capped, cached 10 minutes) ---------- */
const mxCache = new Map<string, { at: number; provider: string }>();
async function mxFor(domains: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const out = new Map<string, string>();
  const todo: string[] = [];
  for (const d of [...new Set(domains.filter(Boolean))]) { const hit = mxCache.get(d); if (hit && now - hit.at < 86_400_000) out.set(d, hit.provider); else todo.push(d); }
  const ask = todo.slice(0, BOUNCE_LIMITS.mxMax);
  if (ask.length) {
    const found = await providersFor(ask).catch(() => new Map<string, string>());
    for (const d of ask) { const p = found.get(d) ?? 'Unknown'; mxCache.set(d, { at: now, provider: p }); out.set(d, p); }
  }
  return out;
}
export { providerOfMx };

interface BounceSource { rows: BounceRow[]; days: number; capped: boolean; mxLooked: number; readAt: string; activity: ActivityRow[]; campaigns: CampaignTotals[] }

/* ---------- Round 2: the other stats, lightly (sent, replies, interested, meetings) ---------- */
export const INTERESTED_STATUSES = ['Interested', 'Meeting Request', 'Info Request', 'Information Request'];
/** One Emails row with a reply or a meeting in the period (never the message text). */
export interface ActivityRow { clientKey: string; campaign: string; campaignRec: string; inbox: string; status: string; repliedAt: string; bookedAt: string }
/** A campaign's own counters (Campaigns table: lifetime of the campaign). */
export interface CampaignTotals { id: string; name: string; clientKey: string; sent: number; contacted: number; replies: number; interested: number; booked: number; bounce: number; activeInPeriod: boolean }
const ACT_FIELDS = [BF.lead, BF.status, EF.latestReplyAt, BK.meetingBookedAt, BK.callDate, BF.campaignName, BF.campaign, BF.inbox, BF.clients, BF.bisonWs];
export interface StatsRow { sent: number | null; contacted: number | null; campaigns: number; replies: number; interested: number; meetings: number; bounces: number; bounceRate: number | null; note: string }
/**
 * The small stats row next to the bounces. Replies, interested and meetings are counted in the
 * period (Emails: Latest Reply Time / Meeting Booked At); sent is the campaign counters of the
 * campaigns that were sending in the period (lifetime of those campaigns: the Emails table has no
 * per-day sends). With an inbox filter, sent is unknown here. Pure.
 */
export function statsRow(activity: ActivityRow[], campaigns: CampaignTotals[], bounces: BounceRow[], f: BounceFilter, days: number, now = Date.now()): StatsRow {
  const from = now - days * 86_400_000;
  const inP = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) && t >= from && t <= now + 60_000; };
  const rows = activity.filter((r) => (!f.client || r.clientKey === f.client) && (!f.campaign || r.campaign === f.campaign || r.campaignRec === f.campaign) && (!f.account || r.inbox === f.account));
  const replied = rows.filter((r) => inP(r.repliedAt) && !/bounced|untracked spam/i.test(r.status));
  const camps = f.account ? [] : campaigns.filter((c) => (!f.client || c.clientKey === f.client) && (f.campaign ? c.id === f.campaign || c.name === f.campaign : c.activeInPeriod));
  const sent = f.account ? null : camps.reduce((a, c) => a + c.sent, 0);
  const contacted = f.account ? null : camps.reduce((a, c) => a + c.contacted, 0);
  const b = filterBounces(bounces, f).length;
  const one = f.campaign && camps.length === 1 ? camps[0] : null;
  return {
    sent, contacted, campaigns: camps.length, replies: replied.length, interested: replied.filter((r) => INTERESTED_STATUSES.includes(r.status)).length,
    meetings: rows.filter((r) => inP(r.bookedAt)).length, bounces: b, bounceRate: one ? one.bounce : null,
    note: f.account ? 'Replies, interested and meetings in the period for this inbox; sends per inbox are on All inboxes.'
      : `Replies, interested and meetings in the last ${days} days. Sent = ${f.campaign ? 'this campaign\'s total' : `the total of the ${camps.length} campaign${camps.length === 1 ? '' : 's'} sending in the period`}.`,
  };
}
const cache = new Map<number, { at: number; data: Promise<BounceSource> }>();
export function _resetBounceCache() { cache.clear(); mxCache.clear(); verifCache = null; }

async function readBounces(at: Pick<HqAirtable, 'list'>, days: number): Promise<BounceSource> {
  const since = `DATEADD(NOW(),-${days},'days')`;
  const [recs, ws, act, camps] = await Promise.all([
    at.list(EMAILS, `AND({Lead Status}='Bounced',IS_AFTER({Status timestamp},DATEADD(NOW(),-${days},'days')))`, Object.values(BF), BOUNCE_LIMITS.maxRows, { sortField: 'Status timestamp', sortDesc: true }),
    at.list(WORKSPACES_T, `{Name}!=''`, ['Name', 'Status', 'Client Type', 'Client', 'ID'], 300, { byName: true }),
    // Round 2: replies and meetings in the period (one capped read; never the message text).
    at.list(EMAILS, `OR(IS_AFTER({Latest Reply Time},${since}),IS_AFTER({Meeting Booked At},${since}),IS_AFTER({Date of Call Booked},${since}))`, ACT_FIELDS, BOUNCE_LIMITS.maxRows).catch(() => [] as AirtableRecord[]),
    at.list(CAMPAIGNS_T, `{Emails Sent}>0`, [KF.name, KF.status, KF.client, KF.sent, KF.contacted, KF.replies, KF.interested, KF.booked, KF.bouncedPct, KF.statusModified, KF.completedAt], 3000).catch(() => [] as AirtableRecord[]),
  ]);
  const clients = clientIndex(ws);
  const bison = new Map<string, { key: string; name: string; active: boolean }>();
  for (const w of ws) { const c = clients.get(w.id); const id = val(w.fields.ID); if (c && id) bison.set(id, c); }
  // MX only for bounces whose provider is empty (bounded, cached a day).
  const need = recs.filter((r) => !val(r.fields[BF.provider])).map((r) => val(r.fields[BF.lead]).toLowerCase().split('@')[1] ?? '');
  const mx = await mxFor(need);
  const rows = recs.filter((r) => /bounced/i.test(val(r.fields[BF.status])) || !val(r.fields[BF.status])).map((r) => bounceOf(r, clients, bison, mx));
  const wsOf = (f: Record<string, unknown>) => clients.get((Array.isArray(f[BF.clients]) ? (f[BF.clients] as any[]).map((x) => (typeof x === 'string' ? x : x?.id)) : [])[0] ?? '') ?? bison.get(val(f[BF.bisonWs])) ?? null;
  const activity: ActivityRow[] = act.map((r) => {
    const f = r.fields;
    return {
      clientKey: wsOf(f)?.key ?? 'none', campaign: val(f[BF.campaignName]) || 'No campaign', campaignRec: (Array.isArray(f[BF.campaign]) ? val(f[BF.campaign]) : '') || '', inbox: val(f[BF.inbox]).toLowerCase(),
      status: val(f[BF.status]), repliedAt: val(f[EF.latestReplyAt]), bookedAt: val(f[BK.meetingBookedAt]) || val(f[BK.callDate]),
    };
  });
  const from = Date.now() - days * 86_400_000;
  const campaigns: CampaignTotals[] = camps.map((r) => {
    const x = factsOf(r);
    const c = clients.get(x.clientRec);
    const changed = Math.max(Date.parse(x.statusModified) || 0, Date.parse(x.completedAt) || 0);
    return { id: x.id, name: x.name, clientKey: c?.key ?? 'none', sent: x.sent, contacted: x.contacted, replies: x.replies, interested: x.interested, booked: x.booked, bounce: x.bounce, activeInPeriod: x.status === 'Active' || changed >= from, active: c?.active ?? false };
  }).filter((c) => c.active).map(({ active: _a, ...c }) => c);
  return { rows: rows.filter((r) => r.clientKey === 'none' || [...clients.values()].some((c) => c.key === r.clientKey && c.active)), days, capped: recs.length >= BOUNCE_LIMITS.maxRows, mxLooked: mx.size, readAt: new Date().toISOString(), activity, campaigns };
}
function cachedBounces(at: Pick<HqAirtable, 'list'>, days: number, refresh = false, now = Date.now()): Promise<BounceSource> {
  const hit = cache.get(days);
  if (hit && now - hit.at < (refresh ? 10_000 : BOUNCE_LIMITS.cacheMs)) return hit.data;
  const data = readBounces(at, days);
  cache.set(days, { at: now, data });
  data.catch(() => { if (cache.get(days)?.data === data) cache.delete(days); });
  return data;
}
const periodOf = (p: string | null) => (BOUNCE_LIMITS.periods as readonly number[]).includes(Number(p)) ? Number(p) : 30;
const keyParam = (p: string | null) => (p ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);

/** GET /deliverability/bounces?client=&campaign=&account=&days= */
export async function bouncesView(at: Pick<HqAirtable, 'list'>, params: URLSearchParams) {
  const days = periodOf(params.get('days'));
  const src = await cachedBounces(at, days, params.get('refresh') === '1');
  const f: BounceFilter = { client: keyParam(params.get('client')) || undefined, campaign: String(params.get('campaign') ?? '').slice(0, 200) || undefined, account: String(params.get('account') ?? '').toLowerCase().slice(0, 200) || undefined };
  return { ...bounceSummary(src.rows, f), stats: statsRow(src.activity, src.campaigns, src.rows, f, days), filter: { ...f, days }, periods: BOUNCE_LIMITS.periods, capped: src.capped, maxRows: BOUNCE_LIMITS.maxRows, readAt: src.readAt };
}

let verifCache: { at: number; data: Promise<{ campaigns: CampaignRef[]; lists: Map<string, ListVerifiers>; cohorts: Parameters<typeof verificationRows>[3]; readAt: string }> } | null = null;
async function readVerif(at: Pick<HqAirtable, 'list'>) {
  const [camps, ws, perf] = await Promise.all([
    at.list(CAMPAIGNS_T, `{Total Leads Contacted}>0`, [KF.name, KF.status, KF.client, KF.contacted, KF.bouncedPct, KF.lists, KF.sent], 1500),
    at.list(WORKSPACES_T, `{Name}!=''`, ['Name', 'Status', 'Client Type', 'Client', 'ID'], 300, { byName: true }),
    at.list(VERIF_PERF, 'TRUE()', Object.values(VP), 3000).catch(() => [] as AirtableRecord[]),
  ]);
  const clients = clientIndex(ws);
  const campaigns: CampaignRef[] = camps.map((r) => factsOf(r)).map((f) => ({ f, c: clients.get(f.clientRec) })).filter((x) => x.c?.active)
    .map(({ f, c }) => ({ id: f.id, name: f.name, clientKey: c!.key, client: c!.name, contacted: f.contacted, bounce: f.bounce, status: f.status, lists: f.listIds }));
  const listIds = [...new Set(campaigns.flatMap((c) => c.lists))].slice(0, 600);
  const parts = await Promise.all(Array.from({ length: Math.ceil(listIds.length / 60) }, (_, i) => listIds.slice(i * 60, i * 60 + 60))
    .map((ch) => at.list(LEAD_LISTS_T, `OR(${ch.map((id) => `RECORD_ID()='${id}'`).join(',')})`, Object.values(VL), ch.length)));
  const lists = new Map<string, ListVerifiers>();
  for (const l of parts.flat()) {
    const f = l.fields;
    lists.set(l.id, { id: l.id, name: val(f[VL.name]) || val(f[VL.fileName]) || 'Lead list', direct: val(f[VL.directVerifier]), generic: val(f[VL.genericVerifier]), directCount: Number(val(f[VL.finalDirect])) || 0, genericCount: Number(val(f[VL.finalGeneric])) || 0, source: val(f[VL.contactSource]) || val(f[VL.sourceType]) });
  }
  const cohorts = perf.map((r) => ({
    campaignRec: (Array.isArray(r.fields[VP.campaign]) ? val(r.fields[VP.campaign]) : '') || '', campaignName: val(r.fields[VP.campaignName]), provider: val(r.fields[VP.provider]), emailType: val(r.fields[VP.emailType]),
    leads: Number(val(r.fields[VP.leads])) || 0, contacted: Number(val(r.fields[VP.contacted])) || 0, bounces: Number(val(r.fields[VP.bounces])) || 0,
  }));
  return { campaigns, lists, cohorts, readAt: new Date().toISOString() };
}

/** GET /deliverability/verification?client=&days= (bounces from the same period; 90 days by default). */
export async function verificationView(at: Pick<HqAirtable, 'list'>, _db: Db, params: URLSearchParams) {
  const refresh = params.get('refresh') === '1';
  const days = (BOUNCE_LIMITS.periods as readonly number[]).includes(Number(params.get('days'))) ? Number(params.get('days')) : 90;
  const client = keyParam(params.get('client')) || undefined;
  if (!verifCache || Date.now() - verifCache.at >= (refresh ? 10_000 : BOUNCE_LIMITS.cacheMs)) {
    const data = readVerif(at);
    verifCache = { at: Date.now(), data };
    data.catch(() => { if (verifCache?.data === data) verifCache = null; });
  }
  const [v, b] = await Promise.all([verifCache.data, cachedBounces(at, days, refresh)]);
  const camps = v.campaigns.filter((c) => !client || c.clientKey === client);
  const rows = verificationRows(camps, v.lists, filterBounces(b.rows, { client }), v.cohorts).filter((r) => r.bounces > 0 || r.cohorts.some((c) => c.leads));
  const totals = verifierTotals(rows);
  const problems = rows.filter((r) => r.verdict === 'problem');
  const top = totals.find((t) => t.bounces >= BOUNCE_LIMITS.minToJudge && (t.notFoundShare ?? 0) >= BOUNCE_LIMITS.majority);
  const conclusion: Conclusion = problems.length
    ? { problem: `${problems.length} campaign${problems.length === 1 ? ' has' : 's have'} mostly "address not found" bounces`, decision: 're-verify those lists before they send more (Scout)', support: problems.slice(0, 3).map((p) => p.name).join(', '), tone: 'bad', text: '' }
    : top ? { problem: `${top.verifier}: ${pc(top.notFoundShare!)} of its ${top.bounces} bounces are "address not found"`, decision: 'watch that verifier', support: `${top.notFound} of ${top.bounces} bounces.`, tone: 'warn', text: '' }
      : { problem: 'No verification problem in this view', decision: 'nothing to change', support: `${rows.length} campaigns, ${b.rows.length} bounces in ${days} days.`, tone: 'good', text: '' };
  conclusion.text = `${conclusion.problem} → ${conclusion.decision}`;
  return { campaigns: rows.slice(0, 200), totals, conclusion, days, periods: BOUNCE_LIMITS.periods, oldCohorts: v.cohorts.length, readAt: v.readAt };
}
