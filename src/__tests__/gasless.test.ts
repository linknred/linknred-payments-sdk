// src/__tests__/gasless.test.ts
import { describe, it, expect, vi } from 'vitest';
import { LinknRedClient } from '../client';
import { LinknRedInvalidRequestError } from '../errors';

describe('GaslessResource', () => {
  it('forwards the body verbatim to api-gasless-relay and returns action+result', async () => {
    const payload = {
      action: 'create' as const,
      request: { some: 'eip712' },
      signature: '0xdead',
    };
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toMatch(/\/functions\/v1\/api-gasless-relay$/);
      const parsed = JSON.parse(String(init.body));
      expect(parsed).toEqual(payload);
      return new Response(JSON.stringify({ action: 'create', result: { escrowId: '1', txHash: '0xabc' } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-linknred-request-id': 'req_g1',
          'x-linknred-environment': 'test',
        },
      });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.gasless.relay(payload, { idempotencyKey: 'idem-g' });
    expect(res.action).toBe('create');
    expect(res.result).toEqual({ escrowId: '1', txHash: '0xabc' });
    expect(res.requestMeta.environment).toBe('test');
  });

  it('rejects invalid actions client-side without hitting the network', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    await expect(c.gasless.relay({ action: 'wat' as never })).rejects.toMatchObject({
      constructor: LinknRedInvalidRequestError,
      code: 'invalid_action',
      param: 'action',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces server-side invalid_request errors with request_id', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { type: 'invalid_request_error', code: 'invalid_signature', message: 'nope', request_id: 'req_err' },
    }), { status: 400, headers: { 'content-type': 'application/json' } }));
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock, maxRetries: 0 });
    await expect(c.gasless.relay({ action: 'create', signature: '0x' })).rejects.toMatchObject({
      constructor: LinknRedInvalidRequestError,
      code: 'invalid_signature',
      requestId: 'req_err',
    });
  });
});
