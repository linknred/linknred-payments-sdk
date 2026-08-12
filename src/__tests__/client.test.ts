// src/__tests__/client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { LinknRedClient } from '../client';
import { staticEndpointResolver } from '../endpoints';
import { LinknRedAuthenticationError } from '../errors';

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (url: string, init: RequestInit) => handler(url, init));
}

describe('LinknRedClient — constructor', () => {
  it('detects test environment from key prefix', () => {
    const c = new LinknRedClient({ apiKey: 'lr_test_abc123', fetch: mockFetch(() => new Response()) });
    expect(c.environment).toBe('test');
    expect(c.baseUrl).toBe('https://api.sandbox.linknred.com');
    expect(c.keyPrefix).toBe('lr_test_abc1');
  });

  it('detects live environment from key prefix', () => {
    const c = new LinknRedClient({ apiKey: 'lr_live_xyz', fetch: mockFetch(() => new Response()) });
    expect(c.environment).toBe('live');
    expect(c.baseUrl).toBe('https://api.linknred.com');
  });

  it('accepts dashboard-issued lk_sand_ keys as test environment', () => {
    const c = new LinknRedClient({
      apiKey: 'lk_sand_ABCD1234_deadbeefcafebabe',
      fetch: mockFetch(() => new Response()),
    });
    expect(c.environment).toBe('test');
    expect(c.baseUrl).toBe('https://api.sandbox.linknred.com');
    // Must match the value the backend persists in api_keys.key_prefix.
    expect(c.keyPrefix).toBe('lk_sand_ABCD1234');
  });

  it('accepts dashboard-issued lk_prod_ keys as live environment', () => {
    const c = new LinknRedClient({
      apiKey: 'lk_prod_ABCD1234_deadbeefcafebabe',
      fetch: mockFetch(() => new Response()),
    });
    expect(c.environment).toBe('live');
    expect(c.baseUrl).toBe('https://api.linknred.com');
    expect(c.keyPrefix).toBe('lk_prod_ABCD1234');
  });

  it('throws for unknown key prefix', () => {
    expect(() => new LinknRedClient({ apiKey: 'nope', fetch: mockFetch(() => new Response()) }))
      .toThrow(/Unrecognized API key prefix/);
  });

  it('throws for empty key', () => {
    expect(() => new LinknRedClient({ apiKey: '', fetch: mockFetch(() => new Response()) }))
      .toThrow(/apiKey.*required/);
  });

  it('does NOT perform any HTTP call at construction time (lazy whoami)', () => {
    const fetchMock = mockFetch(() => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    new LinknRedClient({ apiKey: 'lr_test_abc', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('honors explicit baseUrl over endpoints resolver', () => {
    const c = new LinknRedClient({
      apiKey: 'lr_test_abc',
      baseUrl: 'https://custom.example/',
      endpoints: staticEndpointResolver({ test: 'https://should-be-ignored' }),
      fetch: mockFetch(() => new Response()),
    });
    expect(c.baseUrl).toBe('https://custom.example');
  });

  it('uses custom EndpointResolver when provided', () => {
    const c = new LinknRedClient({
      apiKey: 'lr_test_abc',
      endpoints: staticEndpointResolver({ test: 'https://api.staging.linknred.com/' }),
      fetch: mockFetch(() => new Response()),
    });
    expect(c.baseUrl).toBe('https://api.staging.linknred.com');
  });
});

describe('LinknRedClient — whoami (lazy)', () => {
  it('performs exactly one HTTP call across concurrent invocations (cached promise)', async () => {
    const body = {
      account_id: 'acc_1', application_id: 'app_1', environment: 'test',
      scopes: ['*'], api_version: '2026-07-04', rate_limit_per_minute: 60, key_prefix: 'lr_test_abc',
    };
    const fetchMock = mockFetch((url) => {
      expect(url).toMatch(/\/functions\/v1\/api-v1-whoami$/);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-linknred-request-id': 'req_123' },
      });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_abc', fetch: fetchMock });
    const [a, b, cc] = await Promise.all([c.whoami(), c.whoami(), c.whoami()]);
    expect(a.application_id).toBe('app_1');
    expect(b).toBe(a);
    expect(cc).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the API key on the X-LinknRed-Key header', async () => {
    const fetchMock = mockFetch((_url, init) => {
      const headers = init.headers as Record<string, string>;
      expect(headers['X-LinknRed-Key']).toBe('lr_test_abc');
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_abc', fetch: fetchMock });
    await c.whoami();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not cache failed whoami results', async () => {
    let calls = 0;
    const fetchMock = mockFetch(() => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({
          error: { type: 'authentication_error', code: 'invalid_key', message: 'bad key', request_id: 'req_x' },
        }), { status: 401, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        account_id: 'a', application_id: 'app', environment: 'test',
        scopes: [], api_version: 'v', rate_limit_per_minute: 60, key_prefix: 'lr_test_abc',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_abc', fetch: fetchMock, maxRetries: 0 });
    await expect(c.whoami()).rejects.toBeInstanceOf(LinknRedAuthenticationError);
    const ok = await c.whoami();
    expect(ok.application_id).toBe('app');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
