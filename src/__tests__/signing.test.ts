// src/__tests__/signing.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  signMarkShipped,
  signConfirmDelivery,
  signOpenDispute,
  signWithdrawResolved,
  LIFECYCLE_EIP712_TYPES,
  type SignerLike,
} from '../signing/escrowActions';

function makeSigner(address: string, sig = '0xdeadbeef'): SignerLike & {
  calls: Array<{ domain: unknown; types: unknown; value: unknown }>;
} {
  const calls: Array<{ domain: unknown; types: unknown; value: unknown }> = [];
  return {
    calls,
    getAddress: async () => address,
    signTypedData: async (domain, types, value) => {
      calls.push({ domain, types, value });
      return sig;
    },
  };
}

const ESCROW_ID = 98;
const CONTRACT = '0x1de88fB78A91eBF25c95982d4Ade7390E702Ab34';
const CHAIN_ID = 1029;
const NONCE = 3n;
const DEADLINE = 1_800_000_000;

describe('signing/escrowActions', () => {
  it('signMarkShipped builds the MarkShipped typed data with actorField=seller', async () => {
    const seller = '0x94d3D9bD3367551E9Ed424A8B07abaEF65D049AE';
    const s = makeSigner(seller);
    const res = await signMarkShipped(s, {
      chainId: CHAIN_ID, verifyingContract: CONTRACT,
      escrowId: ESCROW_ID, nonce: NONCE, deadline: DEADLINE,
    });
    expect(res).toEqual({
      action: 'markShipped',
      escrowId: '98',
      actor: seller.toLowerCase(),
      nonce: '3',
      deadline: '1800000000',
      signature: '0xdeadbeef',
    });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].types).toEqual(LIFECYCLE_EIP712_TYPES.markShipped);
    expect(s.calls[0].domain).toEqual({
      name: 'LinknRed Gasless Checkout', version: '1',
      chainId: CHAIN_ID, verifyingContract: CONTRACT,
    });
    expect(s.calls[0].value).toEqual({
      seller: seller.toLowerCase(),
      escrowId: '98', nonce: '3', deadline: '1800000000',
    });
  });

  it('signConfirmDelivery uses buyer field', async () => {
    const buyer = '0xEE0F9fCDBd213258d200f8e412958c3D34a220aB';
    const s = makeSigner(buyer);
    const res = await signConfirmDelivery(s, {
      chainId: CHAIN_ID, verifyingContract: CONTRACT,
      escrowId: ESCROW_ID, nonce: 0, deadline: DEADLINE,
    });
    expect(res.action).toBe('confirmDelivery');
    expect((s.calls[0].value as any).buyer).toBe(buyer.toLowerCase());
  });

  it('signOpenDispute uses opener field', async () => {
    const s = makeSigner('0x1111111111111111111111111111111111111111');
    await signOpenDispute(s, {
      chainId: CHAIN_ID, verifyingContract: CONTRACT,
      escrowId: 1, nonce: 0, deadline: DEADLINE,
    });
    expect((s.calls[0].value as any).opener).toBeDefined();
  });

  it('signWithdrawResolved uses claimant field', async () => {
    const s = makeSigner('0x2222222222222222222222222222222222222222');
    await signWithdrawResolved(s, {
      chainId: CHAIN_ID, verifyingContract: CONTRACT,
      escrowId: 1, nonce: 0, deadline: DEADLINE,
    });
    expect((s.calls[0].value as any).claimant).toBeDefined();
  });

  it('allows overriding domain name/version', async () => {
    const s = makeSigner('0x3333333333333333333333333333333333333333');
    await signMarkShipped(s, {
      chainId: CHAIN_ID, verifyingContract: CONTRACT,
      escrowId: 1, nonce: 0, deadline: DEADLINE,
      domainName: 'Custom', domainVersion: '2',
    });
    expect(s.calls[0].domain).toMatchObject({ name: 'Custom', version: '2' });
  });
});
