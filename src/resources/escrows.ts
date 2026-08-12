// src/resources/escrows.ts
// Escrows resource — mirrors the api-escrow-* public endpoints.
// Off-chain projection of the escrow state machine (spec §4.2). On-chain
// funding and withdrawal transactions are the caller's responsibility; these
// endpoints validate, record and emit the corresponding webhooks.

import type { HttpClient } from '../http';
import type { Environment } from '../env';
import { LinknRedInvalidRequestError } from '../errors';
import type { GaslessResource } from './gasless';
import type { SignedLifecycleAction, LifecycleAction } from '../signing/escrowActions';
import {
  cancelEscrowWithSigner,
  type TxSenderLike,
} from '../onchain/cancelEscrow';

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

export type EscrowStatus =
  | 'pending'
  | 'created'
  | 'funded'
  | 'shipped'
  | 'delivered'
  | 'released'
  | 'auto_released'
  | 'cancelled'
  | 'disputed'
  | 'resolved_buyer'
  | 'resolved_seller'
  | 'resolved_split'
  | 'refunded'
  | 'withdrawn';

/**
 * Buyer inspection period (LNR-RFC-0003).
 *
 * The period starts when the escrow enters `SHIPPED` and lasts
 * `defaultAutoReleaseTime` (7 days by default). Before `SHIPPED` there is no
 * period: `status` is `not_started` and every date field is `null`. The
 * on-chain sentinel (`autoReleaseTime == 0`) is never exposed.
 */
export interface EscrowInspection {
  status: 'not_started' | 'running' | 'elapsed';
  /** ISO timestamp when the window closes, or `null` while not started. */
  ends_on: string | null;
  /** Seconds left in the window (`0` once elapsed), or `null` while not started. */
  remaining_seconds: number | null;
}

export interface EscrowSummary {
  escrow_id: string | null;
  order_id: string;
  order_vendor_id: string;
  buyer_wallet: string | null;
  vendor_wallet: string;
  status: EscrowStatus;
  is_terminal: boolean;
  allowed_transitions_from_current: EscrowStatus[];
  /**
   * End of the buyer inspection period. `null` until the seller marks the
   * escrow as shipped — consumers MUST tolerate `null` (LNR-RFC-0003 §6).
   */
  auto_release_at: string | null;
  /** Derived inspection-period semantics. Added in protocol_version `0.2`. */
  inspection: EscrowInspection;
  updated_at: string;
  protocol_version: string;
}


export interface ShipParams {
  orderVendorId: string;
  sellerWallet: string;
}
export interface ConfirmParams {
  orderVendorId: string;
  buyerWallet: string;
}
export interface CancelParams {
  orderVendorId: string;
  buyerWallet: string;
  reason?: string;
}
export interface DisputeParams {
  orderVendorId: string;
  /** Wallet of the party opening the dispute (buyer or seller). */
  wallet: string;
  reason: string;
  description: string;
  contactInfo?: string;
  escrowId?: string;
}
export interface WithdrawParams {
  orderVendorId: string;
  /** Wallet of the party claiming their share from a resolved_split. */
  wallet: string;
}

export interface EscrowMutationResult {
  success: true;
  orderId: string;
  orderVendorId: string;
  status: EscrowStatus;
  state_from?: EscrowStatus;
  state_to?: EscrowStatus;
  auto_release_at?: string | null;
  requestMeta: RequestMeta;
  /** Present in richer responses (dispute, withdraw). */
  [extra: string]: unknown;
}

export interface RequestMeta {
  requestId: string;
  status: number;
  environment?: Environment;
}

export interface CallOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface StatusQuery {
  escrowId?: string;
  orderVendorId?: string;
}

export class EscrowsResource {
  constructor(
    private readonly http: HttpClient,
    private readonly gasless?: GaslessResource,
  ) {}

  // ---------------------------------------------------------------------------
  // On-chain (gasless) lifecycle — RECOMMENDED for production integrations.
  //
  // These methods take a pre-signed EIP-712 payload (produced with the helpers
  // in `src/signing/escrowActions.ts`) and forward it to
  // `client.gasless.relay(...)`. The relayer submits the tx on-chain against
  // LinknRedProtocolCore, the contract emits the canonical event, and the
  // reconciler / gasless-relay updates the DB projection so `status()` reflects
  // the new state.
  //
  // Use these from any integrator that owns a MetaMask (or equivalent) signer
  // for the actor of each transition.
  // ---------------------------------------------------------------------------

  async shipOnChain(signed: SignedLifecycleAction, opts: CallOptions = {}): Promise<EscrowMutationResult> {
    return this.relayLifecycle('markShipped', signed, opts);
  }

  async confirmOnChain(signed: SignedLifecycleAction, opts: CallOptions = {}): Promise<EscrowMutationResult> {
    return this.relayLifecycle('confirmDelivery', signed, opts);
  }

  async disputeOnChain(signed: SignedLifecycleAction, opts: CallOptions = {}): Promise<EscrowMutationResult> {
    return this.relayLifecycle('openDispute', signed, opts);
  }

  async withdrawOnChain(signed: SignedLifecycleAction, opts: CallOptions = {}): Promise<EscrowMutationResult> {
    return this.relayLifecycle('withdrawResolved', signed, opts);
  }

  /**
   * Buyer-signed on-chain cancel. `LinknRedProtocolCore` V4.3 does NOT expose
   * a `cancelWithSignature` variant, so cancel cannot go through the relayer:
   * the buyer must send the tx themselves. This helper builds and dispatches
   * `cancelEscrow(uint256)` through the provided signer (typically a MetaMask
   * `BrowserProvider.getSigner()`), then projects the DB state via the
   * existing `api-escrow-cancel` endpoint. Returns the on-chain tx hash plus
   * the DB projection metadata.
   */
  async cancelOnChain(
    params: {
      orderVendorId: string;
      buyerWallet: string;
      escrowId: string | number | bigint;
      verifyingContract: string;
      signer: TxSenderLike;
      waitForReceipt?: boolean;
      reason?: string;
    },
    opts: CallOptions = {},
  ): Promise<EscrowMutationResult & { txHash: string }> {
    requireOrderVendorId(params.orderVendorId);
    requireWallet(params.buyerWallet, 'buyerWallet');
    const { txHash } = await cancelEscrowWithSigner({
      escrowId: params.escrowId,
      verifyingContract: params.verifyingContract,
      signer: params.signer,
      waitForReceipt: params.waitForReceipt,
    });
    const projection = await this.mutate('/functions/v1/api-escrow-cancel', {
      orderVendorId: params.orderVendorId,
      buyerWallet: params.buyerWallet,
      reason: params.reason,
    }, opts);
    return { ...projection, txHash };
  }

  private async relayLifecycle(
    expected: LifecycleAction,
    signed: SignedLifecycleAction,
    opts: CallOptions,
  ): Promise<EscrowMutationResult> {
    if (!this.gasless) {
      throw new Error('[linknred] gasless resource unavailable — construct LinknRedClient normally.');
    }
    if (signed.action !== expected) {
      throw new LinknRedInvalidRequestError({
        type: 'invalid_request_error',
        code: 'invalid_action',
        message: `Signed action must be \`${expected}\` (got \`${signed.action}\`).`,
        param: 'action',
        request_id: '',
        status: 400,
      });
    }
    const res = await this.gasless.relay(signed as unknown as Record<string, unknown> & { action: LifecycleAction }, opts);
    const result = (res.result ?? {}) as Record<string, unknown>;
    return {
      success: true,
      orderId: String(result.orderId ?? ''),
      orderVendorId: String(result.orderVendorId ?? ''),
      status: (result.status as EscrowStatus) ?? terminalGuess(expected),
      escrowId: signed.escrowId,
      txHash: result.txHash,
      relayer: result.relayer,
      requestMeta: res.requestMeta,
    };
  }

  // ---------------------------------------------------------------------------
  // Projection (DB) lifecycle — legacy path kept for internal tooling and for
  // vendors without an on-chain signer. New integrations should use the
  // `*OnChain` methods above.
  //
  // @deprecated Prefer `shipOnChain`/`confirmOnChain`/... for production flows.
  // ---------------------------------------------------------------------------

  async ship(params: ShipParams, opts: CallOptions = {}): Promise<EscrowMutationResult> {
    requireOrderVendorId(params.orderVendorId);
    requireWallet(params.sellerWallet, 'sellerWallet');
    return this.mutate('/functions/v1/api-escrow-ship', params, opts);
  }

  async confirm(params: ConfirmParams, opts: CallOptions = {}): Promise<EscrowMutationResult> {
    requireOrderVendorId(params.orderVendorId);
    requireWallet(params.buyerWallet, 'buyerWallet');
    return this.mutate('/functions/v1/api-escrow-confirm', params, opts);
  }

  /**
   * @deprecated Use `cancelOnChain` for production integrations — it triggers
   * the on-chain `cancelEscrow` tx (buyer-signed) and then projects the DB.
   * This projection-only variant is kept for internal tooling.
   */
  async cancel(params: CancelParams, opts: CallOptions = {}): Promise<EscrowMutationResult> {
    requireOrderVendorId(params.orderVendorId);
    requireWallet(params.buyerWallet, 'buyerWallet');
    return this.mutate('/functions/v1/api-escrow-cancel', params, opts);
  }

  async dispute(params: DisputeParams, opts: CallOptions = {}): Promise<EscrowMutationResult> {
    requireOrderVendorId(params.orderVendorId);
    requireWallet(params.wallet, 'wallet');
    if (!params.reason || !params.description) {
      throw new LinknRedInvalidRequestError({
        type: 'invalid_request_error',
        code: 'validation_error',
        message: '`reason` and `description` are required to open a dispute.',
        param: params.reason ? 'description' : 'reason',
        request_id: '',
        status: 400,
      });
    }
    return this.mutate('/functions/v1/api-escrow-dispute', params, opts);
  }

  async withdraw(params: WithdrawParams, opts: CallOptions = {}): Promise<EscrowMutationResult> {
    requireOrderVendorId(params.orderVendorId);
    requireWallet(params.wallet, 'wallet');
    return this.mutate('/functions/v1/api-escrow-withdraw', params, opts);
  }

  async status(query: StatusQuery, opts: CallOptions = {}): Promise<EscrowSummary & { requestMeta: RequestMeta }> {
    if (!query.escrowId && !query.orderVendorId) {
      throw new LinknRedInvalidRequestError({
        type: 'invalid_request_error',
        code: 'validation_error',
        message: 'Provide `escrowId` or `orderVendorId`.',
        param: 'escrowId',
        request_id: '',
        status: 400,
      });
    }
    const qs = new URLSearchParams();
    if (query.escrowId) qs.set('escrow_id', query.escrowId);
    if (query.orderVendorId) qs.set('order_vendor_id', query.orderVendorId);
    const res = await this.http.request<EscrowSummary>({
      method: 'GET',
      path: `/functions/v1/api-escrow-status?${qs.toString()}`,
      signal: opts.signal,
    });
    return { ...res.data, requestMeta: metaOf(res) };
  }

  private async mutate(path: string, body: unknown, opts: CallOptions): Promise<EscrowMutationResult> {
    const res = await this.http.request<Record<string, unknown>>({
      method: 'POST',
      path,
      body,
      idempotencyKey: opts.idempotencyKey,
      signal: opts.signal,
    });
    return { ...(res.data as EscrowMutationResult), requestMeta: metaOf(res) };
  }
}

function requireOrderVendorId(v: unknown): asserts v is string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new LinknRedInvalidRequestError({
      type: 'invalid_request_error',
      code: 'validation_error',
      message: '`orderVendorId` is required.',
      param: 'orderVendorId',
      request_id: '',
      status: 400,
    });
  }
}

function requireWallet(v: unknown, param: string): asserts v is string {
  if (typeof v !== 'string' || !WALLET_RE.test(v)) {
    throw new LinknRedInvalidRequestError({
      type: 'invalid_request_error',
      code: 'validation_error',
      message: `\`${param}\` must be a 0x-hex EVM address.`,
      param,
      request_id: '',
      status: 400,
    });
  }
}

function metaOf(res: { status: number; requestId: string; headers: Headers }): RequestMeta {
  const env = res.headers.get('x-linknred-environment');
  return {
    requestId: res.requestId,
    status: res.status,
    ...(env === 'test' || env === 'live' ? { environment: env } : {}),
  };
}

function terminalGuess(action: LifecycleAction): EscrowStatus {
  switch (action) {
    case 'markShipped': return 'shipped';
    case 'confirmDelivery': return 'delivered';
    case 'openDispute': return 'disputed';
    case 'withdrawResolved': return 'withdrawn';
  }
}
