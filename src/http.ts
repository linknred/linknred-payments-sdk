// src/http.ts
// Thin HTTP transport used by every resource. Handles:
//   • API-Key header injection (X-LinknRed-Key)
//   • Idempotency-Key propagation (X-Idempotency-Key)
//   • JSON encode/decode with a safe fallback for non-JSON bodies
//   • Retries with exponential backoff + jitter on 429 / 5xx / network
//   • Request-id correlation: propagates server's X-LinknRed-Request-Id and
//     synthesizes a client-side one if the transport failed before any response
//   • AbortSignal-based timeout without pulling any Node-only dependency

import { connectionError, fromServerBody, LinknRedError } from './errors';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  fetchImpl: FetchLike;
  userAgent: string;
  apiVersion?: string;
}

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  idempotencyKey?: string;
  /** Override default retry policy for this call (mainly for non-idempotent writes). */
  maxRetries?: number;
  /** Extra signal from caller — merged with the timeout signal. */
  signal?: AbortSignal;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  requestId: string;
  headers: Headers;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_METHODS_RETRY = new Set(['GET', 'DELETE']); // idempotent by contract

export class HttpClient {
  constructor(private readonly cfg: HttpConfig) {}

  async request<T>(opts: HttpRequestOptions): Promise<HttpResponse<T>> {
    const url = buildUrl(this.cfg.baseUrl, opts.path, opts.query);
    const headers = this.buildHeaders(opts);
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);

    const retries = opts.maxRetries ?? this.retriesFor(opts.method, opts.idempotencyKey);
    let attempt = 0;
    let lastErr: unknown;

    while (attempt <= retries) {
      const clientRequestId = cryptoRandomId();
      const attemptHeaders = { ...headers, 'X-Client-Request-Id': clientRequestId };
      const { signal, cancel } = mergeSignals(this.cfg.timeoutMs, opts.signal);
      try {
        const res = await this.cfg.fetchImpl(url, {
          method: opts.method,
          headers: attemptHeaders,
          body,
          signal,
        });
        cancel();
        const requestId = res.headers.get('x-linknred-request-id') ?? clientRequestId;
        const parsed = await parseJsonSafe(res);

        if (!res.ok) {
          const err = fromServerBody(res.status, parsed, requestId);
          if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
            await sleep(backoffMs(attempt, res.headers.get('retry-after')));
            attempt++;
            lastErr = err;
            continue;
          }
          throw err;
        }
        return { data: parsed as T, status: res.status, requestId, headers: res.headers };
      } catch (err) {
        cancel();
        if (err instanceof LinknRedError) throw err;
        // network / abort / timeout
        if (attempt < retries) {
          await sleep(backoffMs(attempt, null));
          attempt++;
          lastErr = err;
          continue;
        }
        throw connectionError(
          err instanceof Error ? err.message : 'Network request failed',
          clientRequestId,
          err,
        );
      }
    }
    // Should be unreachable — the loop always throws or returns.
    throw lastErr ?? connectionError('Request failed after retries', cryptoRandomId());
  }

  private buildHeaders(opts: HttpRequestOptions): Record<string, string> {
    const h: Record<string, string> = {
      'Accept': 'application/json',
      'X-LinknRed-Key': this.cfg.apiKey,
      'User-Agent': this.cfg.userAgent,
    };
    if (this.cfg.apiVersion) h['X-LinknRed-Version'] = this.cfg.apiVersion;
    if (opts.body !== undefined) h['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) h['X-Idempotency-Key'] = opts.idempotencyKey;
    return h;
  }

  private retriesFor(method: string, idempotencyKey?: string): number {
    if (DEFAULT_METHODS_RETRY.has(method)) return this.cfg.maxRetries;
    // POST/PATCH are only retried when the caller provides an idempotency key,
    // otherwise we might create duplicate resources.
    return idempotencyKey ? this.cfg.maxRetries : 0;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function buildUrl(base: string, path: string, query?: HttpRequestOptions['query']): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  const u = `${b}${p}`;
  if (!query) return u;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${u}?${qs}` : u;
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    const text = await res.text().catch(() => '');
    return text ? { message: text } : {};
  }
  try { return await res.json(); } catch { return {}; }
}

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 30_000);
  }
  const base = Math.min(1000 * 2 ** attempt, 8_000);
  return base + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mergeSignals(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  const onExternalAbort = () => controller.abort((external as AbortSignal).reason);
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    },
  };
}

function cryptoRandomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Fallback (very old runtimes): timestamp + random suffix. Not RFC 4122
  // compliant but only used for client-side correlation when the server
  // failed to respond, never sent as a canonical id to the API.
  return `cli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
