// src/signing/createEscrow.ts
// EIP-712 signing helper for the buyer-funded `createEscrowWithSignature` path
// of LinknRedProtocolCore V4.3. Produces the exact body accepted by
// `client.gasless.relay({ action: 'create', ...signed })`.
//
// Keeps the SDK ethers-agnostic: callers pass any object implementing SignerLike.

import type { SignerLike, EIP712Domain, EIP712Types } from './escrowActions';

export const CREATE_ESCROW_EIP712_TYPES: EIP712Types = {
  CreateEscrow: [
    { name: 'buyer', type: 'address' },
    { name: 'seller', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'itemsHash', type: 'bytes32' },
    { name: 'totalAmount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export interface BuildCreateEscrowParams {
  chainId: number;
  /** LinknRedProtocolCore proxy address (verifyingContract). */
  verifyingContract: string;
  seller: string;
  /** ERC-20 token address (use `address(0)` for native BTT). */
  token: string;
  /** Per-item unit prices in token base units, as decimal strings. */
  unitPrices: string[];
  /** Per-item quantities as decimal strings. Must match `unitPrices.length`. */
  quantities: string[];
  /** keccak256 hash of the canonical items array (see `computeItemsHash`). */
  itemsHash: string;
  /** Value of `gaslessNonces(buyer)` read from the contract. */
  nonce: string | number | bigint;
  /** Unix seconds. */
  deadline: number;
  /** Optional metadata blob forwarded to the relay. Defaults to `'{}'`. */
  metadata?: string;
  /** Optional ERC-2612 permit calldata. Defaults to `'0x'` (no permit). */
  permitData?: string;
  /** Override for EIP-712 domain name. Defaults to `LinknRed Gasless Checkout`. */
  domainName?: string;
  /** Override for EIP-712 domain version. Defaults to `1`. */
  domainVersion?: string;
}

export interface SignedCreateEscrow {
  buyer: string;
  seller: string;
  token: string;
  unitPrices: string[];
  quantities: string[];
  itemsHash: string;
  metadata: string;
  totalAmount: string;
  nonce: string;
  deadline: string;
  signature: string;
  permitData: string;
}

function computeTotalAmount(unitPrices: string[], quantities: string[]): bigint {
  if (unitPrices.length !== quantities.length) {
    throw new Error(
      `unitPrices.length (${unitPrices.length}) must match quantities.length (${quantities.length})`,
    );
  }
  return unitPrices.reduce<bigint>(
    (acc, p, i) => acc + BigInt(p) * BigInt(quantities[i]!),
    0n,
  );
}

/**
 * Sign the buyer's `createEscrowWithSignature` payload with EIP-712 and return
 * the exact body accepted by `client.gasless.relay({ action: 'create', ...signed })`.
 *
 * The buyer's address is derived from `signer.getAddress()`. Total amount is
 * computed from `unitPrices` × `quantities` in `bigint` arithmetic to avoid
 * floating-point drift.
 */
export async function signCreateEscrow(
  signer: SignerLike,
  params: BuildCreateEscrowParams,
): Promise<SignedCreateEscrow> {
  const buyer = (await signer.getAddress()).toLowerCase();
  const totalAmount = computeTotalAmount(params.unitPrices, params.quantities);

  const domain: EIP712Domain = {
    name: params.domainName ?? 'LinknRed Gasless Checkout',
    version: params.domainVersion ?? '1',
    chainId: params.chainId,
    verifyingContract: params.verifyingContract,
  };

  const message = {
    buyer,
    seller: params.seller,
    token: params.token,
    itemsHash: params.itemsHash,
    totalAmount: totalAmount.toString(),
    nonce: params.nonce.toString(),
    deadline: params.deadline.toString(),
  };

  const signature = await signer.signTypedData(
    domain,
    CREATE_ESCROW_EIP712_TYPES,
    message,
  );

  return {
    buyer,
    seller: params.seller,
    token: params.token,
    unitPrices: params.unitPrices,
    quantities: params.quantities,
    itemsHash: params.itemsHash,
    metadata: params.metadata ?? '{}',
    totalAmount: totalAmount.toString(),
    nonce: params.nonce.toString(),
    deadline: params.deadline.toString(),
    signature,
    permitData: params.permitData ?? '0x',
  };
}
