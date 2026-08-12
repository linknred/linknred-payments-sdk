// src/signing/escrowActions.ts
// EIP-712 signing helpers for on-chain lifecycle actions of LinknRedProtocolCore V4.3.
// The SDK stays ethers-agnostic: callers pass any object that implements the
// tiny `SignerLike` contract below (ethers v5/v6 Wallets satisfy it out of the box).
//
// The produced `SignedLifecycleAction` is the exact body accepted by
// `client.gasless.relay()` for actions markShipped/confirmDelivery/openDispute/withdrawResolved.

export type EIP712Types = Record<string, Array<{ name: string; type: string }>>;

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

/**
 * Minimal signer contract expected by the SDK. Ethers v5 Wallet / v6 Wallet /
 * BrowserProvider signers all satisfy this shape (`_signTypedData` in v5,
 * `signTypedData` in v6 — pass a small adapter if needed).
 */
export interface SignerLike {
  getAddress(): Promise<string>;
  signTypedData(
    domain: EIP712Domain,
    types: EIP712Types,
    value: Record<string, unknown>,
  ): Promise<string>;
}

export type LifecycleAction =
  | 'markShipped'
  | 'confirmDelivery'
  | 'openDispute'
  | 'withdrawResolved';

export interface SignedLifecycleAction {
  action: LifecycleAction;
  escrowId: string;
  actor: string;
  nonce: string;
  deadline: string;
  signature: string;
}

export const LIFECYCLE_EIP712_TYPES: Record<LifecycleAction, EIP712Types> = {
  markShipped: {
    MarkShipped: [
      { name: 'seller', type: 'address' },
      { name: 'escrowId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  confirmDelivery: {
    ConfirmDelivery: [
      { name: 'buyer', type: 'address' },
      { name: 'escrowId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  openDispute: {
    OpenDispute: [
      { name: 'opener', type: 'address' },
      { name: 'escrowId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  withdrawResolved: {
    WithdrawResolved: [
      { name: 'claimant', type: 'address' },
      { name: 'escrowId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
};

const ACTOR_FIELD: Record<LifecycleAction, string> = {
  markShipped: 'seller',
  confirmDelivery: 'buyer',
  openDispute: 'opener',
  withdrawResolved: 'claimant',
};

export interface BuildLifecycleParams {
  chainId: number;
  /** LinknRedProtocolCore proxy address (verifyingContract). */
  verifyingContract: string;
  escrowId: string | number | bigint;
  nonce: string | number | bigint;
  /** Unix seconds. */
  deadline: number;
  /**
   * Optional override for the EIP-712 domain name — defaults to
   * `LinknRed Gasless Checkout` (must match the deployed contract's domain).
   */
  domainName?: string;
  /** Optional override for the EIP-712 domain version — defaults to `1`. */
  domainVersion?: string;
}

/**
 * Sign a lifecycle action (markShipped/confirmDelivery/openDispute/withdrawResolved)
 * and return the exact payload accepted by `client.gasless.relay()`.
 */
export async function signLifecycleAction(
  action: LifecycleAction,
  signer: SignerLike,
  params: BuildLifecycleParams,
): Promise<SignedLifecycleAction> {
  const actor = (await signer.getAddress()).toLowerCase();
  const domain: EIP712Domain = {
    name: params.domainName ?? 'LinknRed Gasless Checkout',
    version: params.domainVersion ?? '1',
    chainId: params.chainId,
    verifyingContract: params.verifyingContract,
  };
  const message: Record<string, unknown> = {
    [ACTOR_FIELD[action]]: actor,
    escrowId: params.escrowId.toString(),
    nonce: params.nonce.toString(),
    deadline: params.deadline.toString(),
  };
  const signature = await signer.signTypedData(
    domain,
    LIFECYCLE_EIP712_TYPES[action],
    message,
  );
  return {
    action,
    escrowId: params.escrowId.toString(),
    actor,
    nonce: params.nonce.toString(),
    deadline: params.deadline.toString(),
    signature,
  };
}

export const signMarkShipped = (s: SignerLike, p: BuildLifecycleParams) =>
  signLifecycleAction('markShipped', s, p);
export const signConfirmDelivery = (s: SignerLike, p: BuildLifecycleParams) =>
  signLifecycleAction('confirmDelivery', s, p);
export const signOpenDispute = (s: SignerLike, p: BuildLifecycleParams) =>
  signLifecycleAction('openDispute', s, p);
export const signWithdrawResolved = (s: SignerLike, p: BuildLifecycleParams) =>
  signLifecycleAction('withdrawResolved', s, p);
