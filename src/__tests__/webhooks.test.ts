// src/__tests__/webhooks.test.ts
import { describe, it, expect, vi } from 'vitest';
import { LinknRedClient } from '../client';
import { LinknRedInvalidRequestError } from '../errors';

function jsonResponse(body: unknown, init: { status?: number; requestId?: string } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      'x-linknred-request-id': init.requestId ?? 'req_test',
      'x-linknred-environment': 'test',
    },
  });
}

describe('WebhooksResource', () => {
  it('create posts to api-webhooks-create and returns signing_secret + requestMeta', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toMatch(/\/functions\/v1\/api-webhooks-create$/);
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['X-LinknRed-Key']).toBe('lr_test_k');
      expect(headers['X-Idempotency-Key']).toBe('idem-1');
      const parsed = JSON.parse(String(init.body));
      expect(parsed).toEqual({ url: 'https://x.example/hook', events: ['escrow.released'] });
      return jsonResponse({
        webhook: {
          id: 'wh_1', app_id: 'app_1', url: 'https://x.example/hook',
          description: null, events: ['escrow.released'],
          secret_prefix: 'whsec_abc', enabled: true,
        },
        signing_secret: 'whsec_abcdef',
      }, { status: 201, requestId: 'req_c1' });
    });

    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.webhooks.create(
      { url: 'https://x.example/hook', events: ['escrow.released'] },
      { idempotencyKey: 'idem-1' },
    );
    expect(res.signing_secret).toBe('whsec_abcdef');
    expect(res.webhook.id).toBe('wh_1');
    expect(res.requestMeta).toEqual({ requestId: 'req_c1', status: 201, environment: 'test' });
  });

  it('list returns webhooks array', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toMatch(/api-webhooks-list$/);
      return jsonResponse({ webhooks: [{ id: 'wh_1' }] });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.webhooks.list();
    expect(res.webhooks).toHaveLength(1);
  });

  it('rotate propagates grace_hours and returns rotation payload', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const parsed = JSON.parse(String(init.body));
      expect(parsed).toEqual({ webhook_id: 'wh_1', grace_hours: 48 });
      return jsonResponse({
        webhook: { id: 'wh_1', url: 'https://x', secret_prefix: 'whsec_new', rotation_secret_prefix: 'whsec_old', rotation_expires_at: '2099-01-01T00:00:00Z' },
        signing_secret: 'whsec_new_full',
        rotation_expires_at: '2099-01-01T00:00:00Z',
        rotation_notice: 'ok',
      });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.webhooks.rotate({ webhook_id: 'wh_1', grace_hours: 48 });
    expect(res.signing_secret).toBe('whsec_new_full');
  });

  it('test returns delivered flag', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ delivered: true, http_status: 200 }));
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.webhooks.test({ webhook_id: 'wh_1' });
    expect(res.delivered).toBe(true);
    expect(res.http_status).toBe(200);
  });

  it('del returns deleted=true', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ deleted: true, id: 'wh_1' }));
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.webhooks.del({ webhook_id: 'wh_1' });
    expect(res.deleted).toBe(true);
    expect(res.id).toBe('wh_1');
  });

  it('create rejects webhook.test client-side without hitting the network', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    await expect(
      c.webhooks.create({ url: 'https://x.example/hook', events: ['webhook.test'] }),
    ).rejects.toMatchObject({
      constructor: LinknRedInvalidRequestError,
      code: 'invalid_event',
      param: 'events',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('create rejects unknown events client-side', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    await expect(
      c.webhooks.create({ url: 'https://x.example/hook', events: ['order.paid'] }),
    ).rejects.toMatchObject({
      constructor: LinknRedInvalidRequestError,
      code: 'invalid_event',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('update validates events when present', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ webhook: { id: 'wh_1' } }));
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    await expect(
      c.webhooks.update({ webhook_id: 'wh_1', events: ['webhook.test'] }),
    ).rejects.toBeInstanceOf(LinknRedInvalidRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
