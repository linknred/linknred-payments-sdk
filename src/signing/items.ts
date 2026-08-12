// src/signing/items.ts
// Canonical items hasher — mirrors the on-chain ABI encoding used by
// LinknRedProtocolCore's `createEscrowWithSignature` (tuple(string id,string
// name,string unitPrice,string quantity)[]).
//
// Requires `ethers` (v6) as a peer dependency because the buyer flow already
// pulls it in (BrowserProvider + signTypedData). Keeping the hasher here so
// integrators don't have to reinvent the encoding.

import { AbiCoder, keccak256 } from 'ethers';

export type EscrowItem = {
  id: string;
  name: string;
  unitPrice: string;
  quantity: string;
};

/** Maximum items allowed per escrow (matches on-chain MAX_ITEMS). */
export const MAX_ITEMS = 50;

/** Force string fields on every item — keeps the encoding stable. */
export function canonicalizeItems(items: EscrowItem[]): EscrowItem[] {
  return items.map((i) => ({
    id: String(i.id),
    name: String(i.name),
    unitPrice: String(i.unitPrice),
    quantity: String(i.quantity),
  }));
}

/**
 * Compute the `bytes32` hash the contract expects for `itemsHash`.
 * Order is significant — pass items in the same order the seller quoted them.
 */
export function computeItemsHash(items: EscrowItem[]): string {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('items must be a non-empty array');
  }
  if (items.length > MAX_ITEMS) {
    throw new Error(`too many items (max ${MAX_ITEMS}, got ${items.length})`);
  }
  const canonical = canonicalizeItems(items);
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ['tuple(string id,string name,string unitPrice,string quantity)[]'],
    [canonical],
  );
  return keccak256(encoded);
}

/** Convenience: derive unitPrices / quantities arrays in the same order. */
export function toPriceArrays(items: EscrowItem[]): {
  unitPrices: string[];
  quantities: string[];
} {
  const canonical = canonicalizeItems(items);
  return {
    unitPrices: canonical.map((i) => i.unitPrice),
    quantities: canonical.map((i) => i.quantity),
  };
}
