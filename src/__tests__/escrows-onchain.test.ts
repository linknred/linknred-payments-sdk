// src/__tests__/escrows-onchain.test.ts
// Validates that escrows.*OnChain methods forward signed payloads to
// api-gasless-relay and normalise the response into EscrowMutationResult.
import { describe, it, expect, vi } from 'vitest';
import { LinknRedClient } from '../client';
import { LinknRedInvalidRequestError } from '../errors';
import type { SignedLifecycleAction } from '../signing/escrowActions';

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

const SIGNED_SHIP: SignedLifecycleAction = {
  action: 'markShipped',
  escrowId: '98',
  actor: '0x94d3d9bd3367551e9ed424a8b07abaef65d049ae',
  nonce: '3',
  deadline: '1800000000',
  signature: '0xabc',
};

describe('EscrowsResource on-chain methods', () => {
  it('shipOnChain forwards signed payload to api-gasless-relay', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toMatch(/\/functions\/v1\/api-gasless-relay$/);
      expect(init.method).toBe('POST');
      const parsed = JSON.parse(String(init.body));
      expect(parsed).toMatchObject({
        action: 'markShipped',
        escrowId: '98',
        actor: SIGNED_SHIP.actor,
        signature: '0xabc',
      });
      return jsonResponse({
        action: 'markShipped',
        result: {
          success: true, txHash: '0xtx', escrowId: 98,
          relayer: '0xrelayer',
          orderId: 'o_1', orderVendorId: 'ov_1', status: 'shipped',
        },
      }, { requestId: 'req_ship_onchain' });
    });
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const res = await c.escrows.shipOnChain(SIGNED_SHIP, { idempotencyKey: 'k-1' });
    expect(res.success).toBe(true);
    expect(res.status).toBe('shipped');
    expect(res.escrowId).toBe('98');
    expect(res.txHash).toBe('0xtx');
    expect(res.relayer).toBe('0xrelayer');
    expect(res.requestMeta.requestId).toBe('req_ship_onchain');
  });

  it('confirmOnChain rejects payload with mismatched action', async () => {
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: vi.fn() as never });
    await expect(c.escrows.confirmOnChain(SIGNED_SHIP)).rejects.toBeInstanceOf(LinknRedInvalidRequestError);
  });

  it('disputeOnChain forwards openDispute action', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        action: 'openDispute',
        result: { success: true, txHash: '0xd', escrowId: 98, orderVendorId: 'ov_1', status: 'disputed' },
      }),
    );
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const signed: SignedLifecycleAction = { ...SIGNED_SHIP, action: 'openDispute' };
    const res = await c.escrows.disputeOnChain(signed);
    expect(res.status).toBe('disputed');
  });

  it('withdrawOnChain forwards withdrawResolved action', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        action: 'withdrawResolved',
        result: { success: true, txHash: '0xw', escrowId: 98, orderVendorId: 'ov_1', status: 'withdrawn' },
      }),
    );
    const c = new LinknRedClient({ apiKey: 'lr_test_k', fetch: fetchMock });
    const signed: SignedLifecycleAction = { ...SIGNED_SHIP, action: 'withdrawResolved' };
    const res = await c.escrows.withdrawOnChain(signed);
    expect(res.status).toBe('withdrawn');
  });
});
