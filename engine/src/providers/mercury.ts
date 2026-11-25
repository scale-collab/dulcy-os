// Mercury bank API, read only (MERCURY_TOKEN, a Read Only token). Ledger reads balances and
// transactions to prepare Xero reconciliation (Alex 2026-11-25). Never moves money.
import { PermanentError, RetryableError } from '../errors.js';

export interface MercuryAccount { id: string; name: string; balance: number; kind: string }
export interface MercuryTxn { id: string; accountId: string; accountName: string; amount: number; counterparty: string; kind: string; status: string; postedAt: string; createdAt: string; description: string }

/** "Entry Checking ••6964" → "Entry Checking". */
export const plainName = (s: string) => s.replace(/\s*[•·.]{2,}\s*\d{2,}\s*$/u, '').trim();

export function createMercuryClient(o: { token?: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
  const f = o.fetchImpl ?? fetch;
  const base = (o.baseUrl ?? 'https://api.mercury.com/api/v1').replace(/\/+$/, '');
  if (!o.token) throw new PermanentError('no MERCURY_TOKEN on the server');
  const token = o.token.startsWith('secret-token:') ? o.token : `secret-token:${o.token}`;
  async function get(path: string, params: Record<string, string | number> = {}): Promise<any> {
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    let res: Response;
    try { res = await f(`${base}${path}${q.size ? `?${q}` : ''}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(60_000) }); }
    catch { throw new RetryableError(`Mercury ${path}: network error or timeout`); }
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`Mercury ${path}: HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403) throw new PermanentError(`Mercury ${path}: token refused (HTTP ${res.status}; check MERCURY_TOKEN, and the IP whitelist if the token has one)`);
    if (!res.ok) throw new PermanentError(`Mercury ${path}: HTTP ${res.status}`);
    return res.json();
  }
  return {
    async accounts(): Promise<MercuryAccount[]> {
      const j = await get('/accounts');
      return (j.accounts ?? []).filter((a: any) => a.status !== 'archived' && a.status !== 'deleted')
        .map((a: any) => ({ id: String(a.id), name: plainName(String(a.nickname || a.name || '')), balance: Number(a.currentBalance ?? a.availableBalance ?? 0), kind: String(a.kind ?? '') }));
    },
    /** Settled ("sent") transactions of one account between two dates (YYYY-MM-DD), all pages. */
    async transactions(acc: MercuryAccount, start: string, end: string): Promise<MercuryTxn[]> {
      const out: MercuryTxn[] = [];
      for (let offset = 0; offset < 5000; offset += 500) {
        const j = await get(`/account/${acc.id}/transactions`, { start, end, limit: 500, offset });
        const rows: any[] = j.transactions ?? [];
        for (const t of rows) {
          if (String(t.status) !== 'sent') continue;
          out.push({ id: String(t.id), accountId: acc.id, accountName: acc.name, amount: Number(t.amount ?? 0), counterparty: plainName(String(t.counterpartyNickname || t.counterpartyName || t.bankDescription || '')),
            kind: String(t.kind ?? ''), status: String(t.status), postedAt: String(t.postedAt ?? t.createdAt ?? ''), createdAt: String(t.createdAt ?? ''), description: String(t.bankDescription ?? t.note ?? '') });
        }
        if (rows.length < 500) break;
      }
      return out;
    },
  };
}
export type MercuryClient = ReturnType<typeof createMercuryClient>;
