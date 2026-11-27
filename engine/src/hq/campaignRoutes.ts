// Round 2 campaigns (2026-11-27): the HQ routes for the Campaign Center and Lead List Center buttons.
// server.ts has already checked the session, CSRF (same-origin + JSON) and "view as member" (read
// only). Reads: everyone signed in. Presses: owner only (members get 403), confirm: true, and only
// what the Airtable button writes (centerActions.ts).
//   GET  /hq/api/campaigns/accounts?client=      the Sending accounts box
//   GET  /hq/api/campaigns/plans?client=         new campaigns (Atlas plans)
//   POST /hq/api/campaigns/plans                 { client, confirm } start a new campaign plan
//   POST /hq/api/campaigns/plans/:id/action      { action, confirm, notes? } approve / stop / rewrite
//   GET  /hq/api/campaigns/lists/:rec            one lead list (the Lead List Center panel)
//   POST /hq/api/campaigns/lists/:rec/action     { action, confirm }
//   GET  /hq/api/campaigns/:rec/center           the campaign's buttons + automation status + plan
//   GET  /hq/api/campaigns/:rec/copy             the campaign's copy
//   POST /hq/api/campaigns/:rec/action           { action, confirm }
import type http from 'node:http';
import type { Db } from '../db/pool.js';
import type { Config } from '../config.js';
import type { HqAirtable } from './decisions.js';
import type { HqUser } from './auth.js';
import { campaignCenterView, campaignCopy, createPlan, leadListDetail, listPlans, pressCampaignAction, pressListAction, pressPlanAction } from './centerActions.js';
import { sendingAccountsView } from './sendingAccounts.js';
import { agencyRate, campaignHow } from './today.js';
import type { CampaignRow } from './campaigns.js';

/** How each live campaign is doing, the same groups as Today (well / pace / time / look), so #/campaigns/live?how= filters to Today's group. */
export function howOfRows(all: CampaignRow[]): Map<string, string> {
  const rate = agencyRate(all);
  return new Map(all.filter((r) => r.group === 'live' && r.clientActive !== false).map((r) => [r.id, campaignHow(r, rate).how]));
}

export interface RouteAnswer { status: number; body: unknown }

async function readBody(req: http.IncomingMessage, limit = 20_000): Promise<any> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const c of req) { size += (c as Buffer).length; if (size > limit) throw Object.assign(new Error('request too large'), { status: 413 }); chunks.push(c as Buffer); }
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('send JSON'), { status: 400 }); }
}
const REC = '(rec[A-Za-z0-9]{14})';
const OWNER_ONLY = { status: 403, body: { error: 'only the owner presses campaign and lead list buttons' } };

/** null = not one of these routes (server.ts carries on). */
export async function round2Campaigns(p: string, req: http.IncomingMessage, url: URL, needAt: () => HqAirtable, db: Db, cfg: Config, user: HqUser, owner: boolean): Promise<RouteAnswer | null> {
  const get = req.method === 'GET'; const post = req.method === 'POST';
  const client = url.searchParams.get('client') ?? undefined;
  if (p === '/hq/api/campaigns/accounts' && get) return { status: 200, body: await sendingAccountsView(needAt(), db, cfg, { client, refresh: url.searchParams.get('refresh') === '1' }) };
  if (p === '/hq/api/campaigns/plans') {
    if (get) return { status: 200, body: await listPlans(needAt(), db, cfg, { client, canAct: owner }) };
    if (post) { if (!owner) return OWNER_ONLY; const r = await createPlan(needAt(), db, cfg, await readBody(req), user.name); return r; }
  }
  let m = p.match(/^\/hq\/api\/campaigns\/plans\/(\d{1,9})\/action$/);
  if (m && post) { if (!owner) return OWNER_ONLY; return pressPlanAction(needAt(), db, cfg, Number(m[1]), await readBody(req), user.name, owner); }
  m = p.match(new RegExp(`^/hq/api/campaigns/lists/${REC}$`));
  if (m && get) { const d = await leadListDetail(needAt(), db, cfg, m[1], owner, owner); return d ? { status: 200, body: d } : { status: 404, body: { error: 'no such lead list' } }; }
  m = p.match(new RegExp(`^/hq/api/campaigns/lists/${REC}/action$`));
  if (m && post) { if (!owner) return OWNER_ONLY; return pressListAction(needAt(), db, cfg, m[1], await readBody(req), user.name); }
  m = p.match(new RegExp(`^/hq/api/campaigns/${REC}/(center|copy)$`));
  if (m && get) {
    const d = m[2] === 'center' ? await campaignCenterView(needAt(), db, cfg, m[1], owner) : await campaignCopy(needAt(), db, cfg, m[1], owner);
    return d ? { status: 200, body: d } : { status: 404, body: { error: 'no such campaign' } };
  }
  m = p.match(new RegExp(`^/hq/api/campaigns/${REC}/action$`));
  if (m && post) { if (!owner) return OWNER_ONLY; return pressCampaignAction(needAt(), db, cfg, m[1], await readBody(req), user.name); }
  return null;
}
