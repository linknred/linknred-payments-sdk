// examples/06-external-system-event-consumer.ts
//
// Generic pattern for triggering an on-chain LinknRed action in response to a
// status change in ANY external system: ERP, WMS, OMS, marketplace, CRM.
//
// The example uses "shipment reported by an external system" → `shipOnChain`,
// but the shape works for any mapping (e.g. "invoice paid" → `confirmOnChain`,
// "return authorized" → `disputeOnChain` on the seller side, etc.).
//
// Two properties you must preserve:
//   1. Idempotency: the same external event must never trigger two txs.
//   2. Eligibility check: only call the on-chain action if
//      `allowed_transitions_from_current` says the transition is legal now.
//
// Gas: the actor (seller for `shipped`, buyer for `delivered`) only *signs*
// EIP-712 typed data — they never broadcast a tx and never need on-chain BTT.
// LinknRed's relayer pays gas. In this backend example, `getSignerForActor`
// should return a signer backed by your KMS / signing service (AWS KMS, GCP
// KMS, Vault, Turnkey, Fireblocks, or an isolated env-scoped key). Do not
// store raw seller private keys in a general-purpose secret store.
// See docs/payments/02-escrow-lifecycle.md#who-pays-gas-for-each-transition.

import { LinknRedClient, signMarkShipped } from '@linknred/payments';
import type { SignerLike } from '@linknred/payments';

const client = new LinknRedClient({ apiKey: process.env.LINKNRED_API_KEY! });

// Injected: your app's mapping from an external system's status to
// LinknRed's on-chain vocabulary. Return null if the external status has no
// LinknRed meaning yet (most updates are noise).
type ExternalStatus = string;
type LinknRedTransition = 'shipped' | 'delivered' | 'disputed' | null;

function mapExternalStatus(external: ExternalStatus): LinknRedTransition {
  // Example: only two external statuses map to on-chain transitions.
  if (external === 'HANDED_TO_CARRIER') return 'shipped';
  if (external === 'DELIVERY_CONFIRMED_BY_CUSTOMER') return 'delivered';
  return null;
}

// Injected: your own persistence to remember "we already fired for this event".
declare const idempotencyStore: {
  claim(key: string): Promise<boolean>; // true if first time, false if already used
};

// Injected: your resolver that returns a signer for the correct actor (seller
// for `shipped`, buyer for `delivered`, etc.).
declare function getSignerForActor(actor: 'buyer' | 'seller'): Promise<SignerLike>;
declare function getGaslessNonce(signerAddress: string): Promise<bigint>;

const CHAIN_ID = 1029; // BTTC Donau
const VERIFYING_CONTRACT = '0x1de88fB78A91eBF25c95982d4Ade7390E702Ab34';

export async function onExternalStatusChange(evt: {
  externalEventId: string;      // stable id from the external system
  orderVendorId: string;        // your identifier for the LinknRed escrow
  status: ExternalStatus;
}) {
  const target = mapExternalStatus(evt.status);
  if (!target) return; // nothing to do

  // 1) Idempotency guard — never fire twice for the same external event.
  const isFirstTime = await idempotencyStore.claim(`ext:${evt.externalEventId}`);
  if (!isFirstTime) return;

  // 2) Eligibility check against on-chain reality.
  const snapshot = await client.escrows.status({ orderVendorId: evt.orderVendorId });
  if (!snapshot.allowed_transitions_from_current.includes(target)) {
    // The chain already progressed (or regressed to a state that forbids this).
    // This is normal — external systems often report late. Log and move on.
    console.info(`skip: transition ${target} not allowed from ${snapshot.status}`);
    return;
  }

  // 3) Perform the mapped action. Example: mark shipped.
  if (target === 'shipped') {
    const signer = await getSignerForActor('seller');
    const nonce = await getGaslessNonce(await signer.getAddress());
    const deadline = Math.floor(Date.now() / 1000) + 15 * 60;

    const signed = await signMarkShipped(signer, {
      chainId: CHAIN_ID,
      verifyingContract: VERIFYING_CONTRACT,
      escrowId: snapshot.escrow_id!,
      nonce,
      deadline,
    });

    await client.escrows.shipOnChain(signed, {
      idempotencyKey: `ext-ship-${evt.externalEventId}`,
    });
  }

  // Add branches for `delivered`, `disputed`, etc. as your mapping grows.
}
