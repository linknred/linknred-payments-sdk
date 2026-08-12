// src/__tests__/signing-create.test.ts
import { describe, it, expect } from 'vitest';
import {
  signCreateEscrow,
  CREATE_ESCROW_EIP712_TYPES,
} from '../signing/createEscrow';
import type { SignerLike } from '../signing/escrowActions';

function makeSigner(address: string, sig = '0xfeedface'): SignerLike & {
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

const CONTRACT = '0x1de88fB78A91eBF25c95982d4Ade7390E702Ab34';
const CHAIN_ID = 1029;
const BUYER = '0xEE0F9fCDBd213258d200f8e412958c3D34a220aB';
const SELLER = '0x94d3D9bD3367551E9Ed424A8B07abaEF65D049AE';
const TOKEN = '0x0000000000000000000000000000000000000000';
const ITEMS_HASH =
  '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

describe('signing/createEscrow', () => {
  it('produces a payload ready for gasless.relay({ action: "create", ... })', async () => {
    const s = makeSigner(BUYER);
    const signed = await signCreateEscrow(s, {
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      seller: SELLER,
      token: TOKEN,
      unitPrices: ['1000000', '2500000'],
      quantities: ['2', '1'],
      itemsHash: ITEMS_HASH,
      nonce: 7,
      deadline: 1_800_000_000,
    });

    // Total = 1_000_000 * 2 + 2_500_000 * 1 = 4_500_000
    expect(signed.totalAmount).toBe('4500000');
    expect(signed.buyer).toBe(BUYER.toLowerCase());
    expect(signed.metadata).toBe('{}');
    expect(signed.permitData).toBe('0x');
    expect(signed.signature).toBe('0xfeedface');
    // Full relay-body shape check
    expect(Object.keys(signed).sort()).toEqual(
      [
        'buyer', 'seller', 'token', 'unitPrices', 'quantities', 'itemsHash',
        'metadata', 'totalAmount', 'nonce', 'deadline', 'signature', 'permitData',
      ].sort(),
    );
  });

  it('signs with the correct EIP-712 domain and CreateEscrow type', async () => {
    const s = makeSigner(BUYER);
    await signCreateEscrow(s, {
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      seller: SELLER,
      token: TOKEN,
      unitPrices: ['1'],
      quantities: ['1'],
      itemsHash: ITEMS_HASH,
      nonce: 0,
      deadline: 1_800_000_000,
    });
    expect(s.calls[0].domain).toEqual({
      name: 'LinknRed Gasless Checkout',
      version: '1',
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
    });
    expect(s.calls[0].types).toEqual(CREATE_ESCROW_EIP712_TYPES);
    expect(s.calls[0].value).toEqual({
      buyer: BUYER.toLowerCase(),
      seller: SELLER,
      token: TOKEN,
      itemsHash: ITEMS_HASH,
      totalAmount: '1',
      nonce: '0',
      deadline: '1800000000',
    });
  });

  it('rejects mismatched unitPrices/quantities lengths', async () => {
    const s = makeSigner(BUYER);
    await expect(
      signCreateEscrow(s, {
        chainId: CHAIN_ID,
        verifyingContract: CONTRACT,
        seller: SELLER,
        token: TOKEN,
        unitPrices: ['1', '2'],
        quantities: ['1'],
        itemsHash: ITEMS_HASH,
        nonce: 0,
        deadline: 1_800_000_000,
      }),
    ).rejects.toThrow(/must match/);
  });

  it('respects metadata / permitData / domain overrides', async () => {
    const s = makeSigner(BUYER);
    const signed = await signCreateEscrow(s, {
      chainId: CHAIN_ID,
      verifyingContract: CONTRACT,
      seller: SELLER,
      token: TOKEN,
      unitPrices: ['5'],
      quantities: ['3'],
      itemsHash: ITEMS_HASH,
      nonce: 1n,
      deadline: 1_800_000_000,
      metadata: '{"orderVendorId":"abc"}',
      permitData: '0xdeadbeef',
      domainName: 'Custom',
      domainVersion: '2',
    });
    expect(signed.metadata).toBe('{"orderVendorId":"abc"}');
    expect(signed.permitData).toBe('0xdeadbeef');
    expect(signed.totalAmount).toBe('15');
    expect(s.calls[0].domain).toMatchObject({ name: 'Custom', version: '2' });
  });
});
