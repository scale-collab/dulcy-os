// Thin MillionVerifier bulk API v2 client (the same three endpoints the old workflow used).
// Error rules:
//  - upload is PAID. Only a clear "not accepted" answer is safe to retry or fail cleanly.
//    Anything unclear (network drop, timeout, 5xx) is a plain Error, so the receipt stays
//    'pending' and a person checks MillionVerifier before anything is uploaded again.
//  - fileinfo and download are FREE, so timeouts, 429 and 5xx are retryable.
// The API key goes in the query string (MillionVerifier's scheme); it is never put in errors.
import { PermanentError, RetryableError } from '../errors.js';

export interface MvUploadResponse { file_id: string; status: string; [k: string]: unknown }
export interface MvFileInfo { file_id: string; status: string; percent: number; [k: string]: unknown }

export interface MvClient {
  upload(csv: string, fileName: string): Promise<MvUploadResponse>;
  fileInfo(fileId: string): Promise<MvFileInfo>;
  download(fileId: string): Promise<string>;
}

export interface MvOptions { apiKey?: string; baseUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch }

export function createMvClient(o: MvOptions): MvClient {
  const f = o.fetchImpl ?? fetch;
  const timeoutMs = o.timeoutMs ?? 60_000;
  const base = o.baseUrl.replace(/\/+$/, '');
  const key = () => {
    if (!o.apiKey) throw new PermanentError('MILLIONVERIFIER_API_KEY is not set on the server');
    return o.apiKey;
  };
  const url = (path: string, params: Record<string, string>) =>
    `${base}/bulkapi/v2/${path}?${new URLSearchParams({ key: key(), ...params }).toString()}`;
  const short = (s: string) => s.replace(/\s+/g, ' ').slice(0, 200);

  async function free(path: string, params: Record<string, string>): Promise<string> {
    let res: Response;
    try {
      res = await f(url(path, params), { signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (e instanceof PermanentError) throw e;
      throw new RetryableError(`MillionVerifier ${path}: network error or timeout`);
    }
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`MillionVerifier ${path}: HTTP ${res.status}`);
    if (!res.ok) throw new PermanentError(`MillionVerifier ${path}: HTTP ${res.status} ${short(body)}`);
    return body;
  }

  function json(path: string, body: string): Record<string, unknown> {
    try { return JSON.parse(body) as Record<string, unknown>; } catch { throw new RetryableError(`MillionVerifier ${path}: answer was not JSON`); }
  }

  return {
    async upload(csv, fileName) {
      const form = new FormData();
      form.append('file_contents', new Blob([csv], { type: 'text/csv' }), fileName);
      let res: Response;
      try {
        res = await f(url('upload', {}), { method: 'POST', body: form, signal: AbortSignal.timeout(timeoutMs) });
      } catch (e) {
        if (e instanceof PermanentError) throw e;
        throw new Error('MillionVerifier upload: network error or timeout; outcome unknown');
      }
      const body = await res.text();
      if (res.status === 429) throw new RetryableError('MillionVerifier upload: rate limited (HTTP 429), not accepted');
      if (res.status >= 500) throw new Error(`MillionVerifier upload: HTTP ${res.status}; outcome unknown`);
      if (!res.ok) throw new PermanentError(`MillionVerifier upload rejected: HTTP ${res.status} ${short(body)}`);
      let r: Record<string, unknown>;
      try { r = JSON.parse(body); } catch { throw new Error('MillionVerifier upload: answer was not JSON; outcome unknown'); }
      const fileId = String(r.file_id ?? r.fileId ?? '').trim();
      if (!fileId) {
        if (r.error) throw new PermanentError(`MillionVerifier upload rejected: ${short(String(r.error))}`);
        throw new Error('MillionVerifier upload: no file_id in the answer; outcome unknown');
      }
      return { ...r, file_id: fileId, status: String(r.status ?? '').toLowerCase() };
    },

    async fileInfo(fileId) {
      const r = json('fileinfo', await free('fileinfo', { file_id: fileId }));
      if (r.error && !r.status) throw new PermanentError(`MillionVerifier fileinfo: ${short(String(r.error))}`);
      return { ...r, file_id: String(r.file_id ?? fileId), status: String(r.status ?? '').toLowerCase(), percent: Number(r.percent ?? r.progress ?? 0) };
    },

    async download(fileId) {
      return free('download', { file_id: fileId, filter: 'all' });
    },
  };
}
