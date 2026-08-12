// src/__tests__/webhookSignature.test.ts
import { describe, it, expect } from 'vitest';
import { constructEvent, LinknRedSignatureError } from '../webhookSignature';

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function makeHeader(secret: string, body: string, t: number, extra?: string) {
  const sig = await hmacHex(secret, `${t}.${body}`);
  return extra ? `t=${t}, v1=${sig}, v1=${extra}` : `t=${t}, v1=${sig}`;
}

describe('constructEvent', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'webhook.test', data: { ok: true } });
  const secret = 'whsec_test_secret';
  const now = 1_800_000_000;

  it('parses and returns the event when signature matches', async () => {
    const header = await makeHeader(secret, body, now);
    const event = await constructEvent(body, header, secret, { nowSeconds: now });
    expect(event.type).toBe('webhook.test');
    expect(event.id).toBe('evt_1');
  });

  it('accepts a match against ANY v1 during rotation', async () => {
    const primaryHeader = await makeHeader(secret, body, now, 'deadbeef'.repeat(8));
    const event = await constructEvent(body, primaryHeader, secret, { nowSeconds: now });
    expect(event.type).toBe('webhook.test');
  });

  it('rejects a mismatched secret', async () => {
    const header = await makeHeader(secret, body, now);
    await expect(constructEvent(body, header, 'wrong', { nowSeconds: now }))
      .rejects.toBeInstanceOf(LinknRedSignatureError);
  });

  it('rejects a stale timestamp', async () => {
    const header = await makeHeader(secret, body, now - 10_000);
    await expect(constructEvent(body, header, secret, { nowSeconds: now, toleranceSeconds: 300 }))
      .rejects.toThrow(/tolerance/i);
  });

  it('rejects a missing or malformed header', async () => {
    await expect(constructEvent(body, null, secret)).rejects.toThrow(/Missing/);
    await expect(constructEvent(body, 'v1=abc', secret)).rejects.toThrow(/Missing t=/);
    await expect(constructEvent(body, 't=123', secret, { nowSeconds: 123 })).rejects.toThrow(/Missing v1=/);
  });

  it('rejects a body that is not valid JSON', async () => {
    const bad = 'not-json';
    const header = await makeHeader(secret, bad, now);
    await expect(constructEvent(bad, header, secret, { nowSeconds: now }))
      .rejects.toThrow(/not valid JSON/);
  });

  it('rejects a re-serialised body (signature is bound to the RAW bytes)', async () => {
    // The server signs the exact raw bytes it sends. If a middleware parses the
    // body and re-serialises it (whitespace, key order, unicode escapes) the
    // resulting bytes differ and the HMAC no longer matches.
    const raw = '{"id":"evt_1","type":"webhook.test","data":{"n":1}}';
    const header = await makeHeader(secret, raw, now);
    const reserialised = JSON.stringify(JSON.parse(raw)); // same object, different bytes possible
    // Force a byte-level difference to make the test deterministic across engines.
    const tampered = reserialised.replace('"n":1', '"n": 1');
    await expect(constructEvent(tampered, header, secret, { nowSeconds: now }))
      .rejects.toThrow(/No matching v1 signature/);
    // Sanity: the original raw body still verifies.
    const ok = await constructEvent(raw, header, secret, { nowSeconds: now });
    expect(ok.type).toBe('webhook.test');
  });
});
