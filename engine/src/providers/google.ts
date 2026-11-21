// Google Sheets client using a service account (no extra packages). The engine READS lead
// list tabs (verify, campaign build) and WRITES its own view tabs (one write per batch).
// With GOOGLE_IMPERSONATE_USER set, it acts as that Workspace user through
// domain-wide delegation, so it can read every sheet that user can open.
// Scope: spreadsheets (read + write, no Drive). The key file lives only on the server.
import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PermanentError, RetryableError } from '../errors.js';

const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

interface ServiceAccountKey { client_email: string; private_key: string; token_uri?: string }

export interface SheetsClient {
  /** First row of a tab. */
  header(sheetId: string, tab: string): Promise<string[]>;
  /** A whole tab (header row first), columns A:ZZ. */
  tab(sheetId: string, tab: string): Promise<string[][]>;
  /** Whole columns (by 0-based index) of a tab, header cell included. */
  columns(sheetId: string, tab: string, indexes: number[]): Promise<string[][]>;
  /** Create a new spreadsheet with one tab; returns its ID. */
  create(title: string, tab: string): Promise<string>;
  /** Make sure a tab exists (added if missing). */
  ensureTab(sheetId: string, tab: string): Promise<void>;
  /** Empty a tab's values (the tab itself stays). */
  clearTab(sheetId: string, tab: string): Promise<void>;
  /** Write rows starting at a fixed row (1-based). Same call twice = same result (no duplicates). */
  writeRows(sheetId: string, tab: string, startRow: number, rows: (string | number)[][]): Promise<void>;
  /** Tab properties (sheetId, title, grid size) of a spreadsheet. */
  meta(sheetId: string): Promise<{ sheets: Array<{ properties: { sheetId: number; title: string; gridProperties?: { rowCount?: number; columnCount?: number } } }> }>;
  /** Sheet structure requests (e.g. grid resize) in one batchUpdate. */
  batchUpdate(sheetId: string, requests: unknown[]): Promise<void>;
  /** Write several A1 ranges at once (values:batchUpdate, RAW). */
  writeRanges(sheetId: string, data: Array<{ range: string; values: unknown[][] }>): Promise<void>;
}

export interface GoogleOptions {
  keyFile: string;
  impersonate?: string;
  scope?: string;
  sheetsBaseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export function createSheetsClient(o: GoogleOptions): SheetsClient {
  const f = o.fetchImpl ?? fetch;
  const timeoutMs = o.timeoutMs ?? 60_000;
  const base = (o.sheetsBaseUrl ?? 'https://sheets.googleapis.com').replace(/\/+$/, '');
  let token: { value: string; until: number } | null = null;

  async function key(): Promise<ServiceAccountKey> {
    let raw: string;
    try { raw = await readFile(o.keyFile, 'utf8'); } catch { throw new PermanentError(`Google key file not found on the server (${o.keyFile})`); }
    let k: ServiceAccountKey;
    try { k = JSON.parse(raw); } catch { throw new PermanentError('Google key file is not valid JSON'); }
    if (!k.client_email || !k.private_key) throw new PermanentError('Google key file is missing client_email or private_key');
    return k;
  }

  async function accessToken(): Promise<string> {
    if (token && token.until > Date.now() + 60_000) return token.value;
    const k = await key();
    const now = Math.floor(Date.now() / 1000);
    const tokenUri = k.token_uri ?? 'https://oauth2.googleapis.com/token';
    const claims: Record<string, unknown> = { iss: k.client_email, scope: o.scope ?? DEFAULT_SCOPE, aud: tokenUri, iat: now, exp: now + 3600 };
    if (o.impersonate) claims.sub = o.impersonate;
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(k.private_key);
    const assertion = `${unsigned}.${b64url(signature)}`;
    let res: Response;
    try {
      res = await f(tokenUri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch { throw new RetryableError('Google sign-in: network error or timeout'); }
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Google sign-in: HTTP ${res.status}`);
    if (!res.ok) {
      // Usually: domain-wide delegation not set up for this client ID / scope.
      let reason = '';
      try { const j = JSON.parse(body); reason = `${j.error ?? ''} ${j.error_description ?? ''}`.trim(); } catch { /* ignore */ }
      throw new PermanentError(`Google sign-in refused (HTTP ${res.status}${reason ? `: ${reason}` : ''}); check the service account and domain-wide delegation`);
    }
    const j = JSON.parse(body) as { access_token: string; expires_in?: number };
    token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function get(path: string, method = 'GET', payload?: unknown): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${await accessToken()}` };
      if (payload !== undefined) headers['content-type'] = 'application/json';
      res = await f(`${base}${path}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (e instanceof PermanentError || e instanceof RetryableError) throw e;
      throw new RetryableError('Google Sheets: network error or timeout');
    }
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Google Sheets: HTTP ${res.status}`);
    if (res.status === 401) { token = null; throw new RetryableError('Google Sheets: token expired'); }
    if (res.status === 403) throw new PermanentError(method === 'GET'
      ? 'Google Sheets: no access to this sheet (is it in the impersonated user\'s Drive?)'
      : 'Google Sheets: no write access (check the sheet is shared with the impersonated user and the spreadsheets scope is in domain-wide delegation)');
    if (res.status === 404) throw new PermanentError('Google Sheets: sheet not found');
    if (!res.ok) throw new PermanentError(`Google Sheets: HTTP ${res.status} ${body.replace(/\s+/g, ' ').slice(0, 200)}`);
    return JSON.parse(body) as Record<string, unknown>;
  }

  return {
    async header(sheetId, tab) {
      const r = await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(`${quoteTab(tab)}!1:1`)}`);
      const values = (r.values as string[][] | undefined) ?? [];
      return (values[0] ?? []).map((v) => String(v ?? ''));
    },
    async tab(sheetId, tab) {
      const r = await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(`${quoteTab(tab)}!A:ZZ`)}`);
      return ((r.values as string[][] | undefined) ?? []).map((row) => row.map((v) => String(v ?? '')));
    },
    async create(title, tab) {
      const r = await get('/v4/spreadsheets', 'POST', { properties: { title }, sheets: [{ properties: { title: tab } }] });
      const id = String(r.spreadsheetId ?? '');
      if (!id) throw new PermanentError('Google Sheets: create returned no spreadsheet ID');
      return id;
    },
    async ensureTab(sheetId, tab) {
      const meta = await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties.title`);
      const titles = ((meta.sheets as Array<{ properties?: { title?: string } }> | undefined) ?? []).map((x) => x.properties?.title);
      if (titles.includes(tab)) return;
      await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}:batchUpdate`, 'POST', { requests: [{ addSheet: { properties: { title: tab } } }] });
    },
    async clearTab(sheetId, tab) {
      await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(`${quoteTab(tab)}!A:ZZ`)}:clear`, 'POST', {});
    },
    async writeRows(sheetId, tab, startRow, rows) {
      if (!rows.length) return;
      // A tab has a fixed grid (new sheets: 1,000 rows x 26 columns). Grow it first, or Google
      // refuses the write ("exceeds grid limits"; seen live 2026-11-18 at row 1,069).
      const meta = await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties(sheetId,title,gridProperties)`);
      const props = ((meta.sheets as Array<{ properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }> | undefined) ?? [])
        .map((x) => x.properties).find((x) => x?.title === tab);
      if (props) {
        const needRows = startRow - 1 + rows.length;
        const needCols = Math.max(...rows.map((r) => r.length));
        const requests: unknown[] = [];
        const haveRows = Number(props.gridProperties?.rowCount ?? 0), haveCols = Number(props.gridProperties?.columnCount ?? 0);
        if (needRows > haveRows) requests.push({ appendDimension: { sheetId: props.sheetId, dimension: 'ROWS', length: needRows - haveRows + 1000 } });
        if (needCols > haveCols) requests.push({ appendDimension: { sheetId: props.sheetId, dimension: 'COLUMNS', length: needCols - haveCols } });
        if (requests.length) await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}:batchUpdate`, 'POST', { requests });
      }
      const range = `${quoteTab(tab)}!A${startRow}`;
      await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, 'PUT', { range, majorDimension: 'ROWS', values: rows });
    },
    async meta(sheetId) {
      const r = await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties`);
      return { sheets: ((r.sheets as any[] | undefined) ?? []).map((x) => ({ properties: x.properties })) };
    },
    async batchUpdate(sheetId, requests) {
      if (!requests.length) return;
      await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}:batchUpdate`, 'POST', { requests });
    },
    async writeRanges(sheetId, data) {
      if (!data.length) return;
      await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchUpdate`, 'POST', { valueInputOption: 'RAW', data });
    },
    async columns(sheetId, tab, indexes) {
      if (indexes.length === 0) return [];
      const ranges = indexes.map((i) => `ranges=${encodeURIComponent(`${quoteTab(tab)}!${columnLetter(i)}:${columnLetter(i)}`)}`).join('&');
      const r = await get(`/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchGet?majorDimension=COLUMNS&${ranges}`);
      const vr = (r.valueRanges as Array<{ values?: string[][] }> | undefined) ?? [];
      return indexes.map((_, i) => (vr[i]?.values?.[0] ?? []).map((v) => String(v ?? '')));
    },
  };
}
