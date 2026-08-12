// src/webhookSignature.ts
// Verifies the `X-LinknRed-Signature` header emitted by LinknRed Payments
// webhooks. Format:
//
//   t=<unix-seconds>, v1=<hexA>[, v1=<hexB>]
//
// Each v1 is HMAC-SHA256(secret, `${t}.${rawBody}`) as lowercase hex.
// Two v1 values may appear during a rotation window; a match against ANY
// one of them is sufficient.
//
// Uses Web Crypto (`globalThis.crypto.subtle`) which is available on Node 18+,
// Deno, Bun, Cloudflare Workers, Vercel Edge and the browser.

import { LinknRedError } from './errors';

export class LinknRedSignatureError extends LinknRedError {
  constructor(message: string) {
    super({
      type: 'invalid_request_error',
      code: 'invalid_signature',
      message,
      request_id: '',
      status: 400,
    });
    this.name = 'LinknRedSignatureError';
  }
}

export interface ConstructEventOptions {
  /** Tolerance in seconds between the header timestamp and current time. Default: 300s. */
  toleranceSeconds?: number;
  /** Override for `Date.now()` — useful in tests. Unix seconds. */
  nowSeconds?: number;
}

export interface WebhookEvent {
  id?: string;
  type: string;
  created?: number;
  data?: unknown;
  [key: string]: unknown;
}

/**
 * Parse the raw JSON body and validate the signature header. Throws
 * `LinknRedSignatureError` on any failure; returns the parsed event on success.
 *
 * @param rawBody   The raw HTTP body string. Must be the exact bytes received —
 *                  re-serialising a parsed object will break the signature.
 * @param header    Value of the `X-LinknRed-Signature` header.
 * @param secret    The signing secret (`whsec_...`).
 */
export async function constructEvent(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  opts: ConstructEventOptions = {},
): Promise<WebhookEvent> {
  if (!header) throw new LinknRedSignatureError('Missing X-LinknRed-Signature header');
  if (!secret) throw new LinknRedSignatureError('Missing signing secret');

  const { t, v1s } = parseHeader(header);
  const tolerance = opts.toleranceSeconds ?? 300;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > tolerance) {
    throw new LinknRedSignatureError(`Timestamp outside tolerance window (t=${t}, now=${now})`);
  }

  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  const matched = v1s.some((candidate) => timingSafeEqualHex(candidate, expected));
  if (!matched) throw new LinknRedSignatureError('No matching v1 signature');

  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); }
  catch { throw new LinknRedSignatureError('Body is not valid JSON'); }
  if (!parsed || typeof parsed !== 'object') {
    throw new LinknRedSignatureError('Body is not a JSON object');
  }
  return parsed as WebhookEvent;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function parseHeader(header: string): { t: number; v1s: string[] } {
  const parts = header.split(',').map((p) => p.trim()).filter(Boolean);
  let t: number | null = null;
  const v1s: string[] = [];
  for (const part of parts) {
    if (part.startsWith('t=')) {
      const n = Number(part.slice(2));
      if (Number.isFinite(n)) t = n;
    } else if (part.startsWith('v1=')) {
      v1s.push(part.slice(3));
    }
  }
  if (t === null) throw new LinknRedSignatureError('Missing t= in signature header');
  if (v1s.length === 0) throw new LinknRedSignatureError('Missing v1= in signature header');
  return { t, v1s };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) {
    throw new Error('[linknred] Web Crypto (crypto.subtle) is not available in this runtime.');
  }
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
