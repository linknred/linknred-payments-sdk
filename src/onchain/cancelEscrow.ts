// src/onchain/cancelEscrow.ts
// Direct on-chain helper for `LinknRedProtocolCore.cancelEscrow(uint256)`.
//
// Rationale: V4.3 does NOT expose a `cancelWithSignature` variant — the buyer
// must send `cancelEscrow(escrowId)` themselves. This helper builds the raw
// calldata and (optionally) sends the tx through any signer that satisfies the
// minimal `TxSenderLike` contract (ethers v5/v6, viem wallet clients wrapped,
// EIP-1193 provider wrappers, etc.). The SDK stays free of ethers/viem deps.

import { LinknRedInvalidRequestError } from '../errors';

/** 4-byte function selector for `cancelEscrow(uint256)`. */
export const CANCEL_ESCROW_SELECTOR = '0xe0182436';

export interface CancelEscrowTx {
  to: string;
  data: string;
  value: '0x0';
}

export interface BuildCancelEscrowTxParams {
  escrowId: string | number | bigint;
  /** Address of the LinknRedProtocolCore proxy. */
  verifyingContract: string;
}

/** Minimal tx-sender contract. Ethers v5/v6 Signer, viem wallet clients, and
 *  EIP-1193 wrappers all satisfy or can be trivially adapted to this shape. */
export interface TxSenderLike {
  sendTransaction(tx: CancelEscrowTx): Promise<{ hash: string; wait?: () => Promise<unknown> }>;
}

const HEX40 = /^0x[a-fA-F0-9]{40}$/;

/** Build the raw transaction object (to/data/value) for cancelEscrow(escrowId). */
export function buildCancelEscrowTx(params: BuildCancelEscrowTxParams): CancelEscrowTx {
  if (!params || typeof params !== 'object') {
    throw new LinknRedInvalidRequestError({
      type: 'invalid_request_error',
      code: 'validation_error',
      message: '`buildCancelEscrowTx` requires an options object.',
      request_id: '',
      status: 400,
    });
  }
  if (typeof params.verifyingContract !== 'string' || !HEX40.test(params.verifyingContract)) {
    throw new LinknRedInvalidRequestError({
      type: 'invalid_request_error',
      code: 'validation_error',
      message: '`verifyingContract` must be a 0x-hex EVM address.',
      param: 'verifyingContract',
      request_id: '',
      status: 400,
    });
  }
  const id = toBigInt(params.escrowId);
  if (id < 0n) {
    throw new LinknRedInvalidRequestError({
      type: 'invalid_request_error',
      code: 'validation_error',
      message: '`escrowId` must be a non-negative integer.',
      param: 'escrowId',
      request_id: '',
      status: 400,
    });
  }
  const encodedId = id.toString(16).padStart(64, '0');
  return {
    to: params.verifyingContract,
    data: `${CANCEL_ESCROW_SELECTOR}${encodedId}`,
    value: '0x0',
  };
}

export interface CancelEscrowWithSignerParams extends BuildCancelEscrowTxParams {
  signer: TxSenderLike;
  /** When true (default), waits for the tx receipt if the signer supports it. */
  waitForReceipt?: boolean;
}

export interface CancelEscrowResult {
  txHash: string;
}

/** Send the cancelEscrow tx through the provided signer. Ethers v5/v6 Signers
 *  satisfy `TxSenderLike` directly. For MetaMask via EIP-1193, wrap the provider
 *  with ethers' `BrowserProvider.getSigner()` and pass that signer. */
export async function cancelEscrowWithSigner(
  params: CancelEscrowWithSignerParams,
): Promise<CancelEscrowResult> {
  if (!params.signer || typeof params.signer.sendTransaction !== 'function') {
    throw new LinknRedInvalidRequestError({
      type: 'invalid_request_error',
      code: 'validation_error',
      message: '`signer` must implement `sendTransaction`.',
      param: 'signer',
      request_id: '',
      status: 400,
    });
  }
  const tx = buildCancelEscrowTx(params);
  const sent = await params.signer.sendTransaction(tx);
  if (params.waitForReceipt !== false && typeof sent.wait === 'function') {
    try { await sent.wait(); } catch { /* propagate hash regardless */ }
  }
  return { txHash: sent.hash };
}

function toBigInt(v: string | number | bigint): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || !Number.isInteger(v)) {
      throw new LinknRedInvalidRequestError({
        type: 'invalid_request_error',
        code: 'validation_error',
        message: '`escrowId` must be an integer.',
        param: 'escrowId',
        request_id: '',
        status: 400,
      });
    }
    return BigInt(v);
  }
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  throw new LinknRedInvalidRequestError({
    type: 'invalid_request_error',
    code: 'validation_error',
    message: '`escrowId` must be a decimal string, number, or bigint.',
    param: 'escrowId',
    request_id: '',
    status: 400,
  });
}
