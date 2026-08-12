// src/__tests__/escrows.test.ts
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

const SELLER = '0x1111111111111111111111111111111111111111';
const BUYER = '0x2222222222222222222222222222222222222222';

describe('EscrowsResource', () => {
  it('ship posts to api-escrow-ship with idempotency key', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toMatch(/\/functions\/v1\/api-escrow-ship$/);
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['X-LinknRed-Key']).toBe('lr_test_k');
      expect(headers['X-Idempotency-Key']).toBe('ship-1');
      const parsed = JSON.parse(String(init.body));
      expect(parsed).toEqual({ orderVendorId: 'ov_1', sellerWallet: SELLER });
      return jsonResponse({
        success: true, orderId: 'o_1', orderVendorId: 'ov_1',
        status: 'shipped', state_from: 'funded', state_to: 'shipped',
        auto_release_at: '2026-08-01T00:00:00Z',
      }, { requestId: 'req_ship' });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.escrows.ship({ orderVendorId: 'ov_1', sellerWallet: SELLER }, { idempotencyKey: 'ship-1' });
    expect(res.status).toBe('shipped');
    expect(res.requestMeta.requestId).toBe('req_ship');
    expect(res.requestMeta.environment).toBe('test');
  });

  it('confirm posts to api-escrow-confirm', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toMatch(/\/api-escrow-confirm$/);
      return jsonResponse({ success: true, orderId: 'o_1', orderVendorId: 'ov_1', status: 'delivered' });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.escrows.confirm({ orderVendorId: 'ov_1', buyerWallet: BUYER });
    expect(res.status).toBe('delivered');
  });

  it('cancel posts to api-escrow-cancel with optional reason', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toMatch(/\/api-escrow-cancel$/);
      expect(JSON.parse(String(init.body))).toEqual({
        orderVendorId: 'ov_1', buyerWallet: BUYER, reason: 'changed_mind',
      });
      return jsonResponse({ success: true, orderId: 'o_1', orderVendorId: 'ov_1', status: 'cancelled' });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.escrows.cancel({ orderVendorId: 'ov_1', buyerWallet: BUYER, reason: 'changed_mind' });
    expect(res.status).toBe('cancelled');
  });

  it('dispute requires reason + description', async () => {
    const fetchMock = vi.fn();
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock as never });
    await expect(
      c.escrows.dispute({ orderVendorId: 'ov_1', wallet: BUYER, reason: '', description: 'x' }),
    ).rejects.toBeInstanceOf(LinknRedInvalidRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('withdraw posts to api-escrow-withdraw', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toMatch(/\/api-escrow-withdraw$/);
      return jsonResponse({
        success: true, orderId: 'o_1', orderVendorId: 'ov_1',
        escrowId: '42', role: 'buyer', status: 'resolved_split',
        note: 'off-chain projection',
      });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.escrows.withdraw({ orderVendorId: 'ov_1', wallet: BUYER });
    expect(res.status).toBe('resolved_split');
    expect(res.escrowId).toBe('42');
  });

  it('status GETs api-escrow-status with escrow_id', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.method).toBe('GET');
      expect(url).toMatch(/\/api-escrow-status\?escrow_id=42$/);
      return jsonResponse({
        escrow_id: '42', order_id: 'o_1', order_vendor_id: 'ov_1',
        buyer_wallet: BUYER, vendor_wallet: SELLER, status: 'shipped',
        is_terminal: false, allowed_transitions_from_current: ['delivered', 'disputed'],
        auto_release_at: null, updated_at: '2026-07-07T00:00:00Z', protocol_version: '0.1',
      });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.escrows.status({ escrowId: '42' });
    expect(res.status).toBe('shipped');
    expect(res.allowed_transitions_from_current).toContain('delivered');
  });

  it('status requires escrowId or orderVendorId', async () => {
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: vi.fn() as never });
    await expect(c.escrows.status({})).rejects.toBeInstanceOf(LinknRedInvalidRequestError);
  });

  it('ship rejects invalid wallet before hitting the wire', async () => {
    const fetchMock = vi.fn();
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock as never });
    await expect(
      c.escrows.ship({ orderVendorId: 'ov_1', sellerWallet: 'not-a-wallet' }),
    ).rejects.toBeInstanceOf(LinknRedInvalidRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
