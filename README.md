# @linknred/payments

Official SDK for **LinknRed Payments** — escrow-protected on-chain checkout, webhooks, and gasless relay.

> **Status:** `0.2.1` — CAD helpers are now **CAS-regime aware**: `cidCad(bytes, { regime })` and `verifyCad(bytes, anchor, { casRegime })` default to `dag-pb`, the canonical regime of the managed CAS (`cas.linknred.com`). Also in the 0.2.x line: `client.health.ping()` for public liveness checks, and buyer-side `signCreateEscrow` + `computeItemsHash` helpers. Examples ship under `examples/`. Requires `ethers >= 6` as an (optional) peer dependency.

## Install

```bash
npm install @linknred/payments
# or: pnpm add · bun add · yarn add
```

Requires Node ≥ 18 or any runtime with global `fetch` (Deno, Bun, Cloudflare Workers, Vercel Edge, modern browsers).

## Quickstart

```ts
import { LinknRedClient } from '@linknred/payments';

const client = new LinknRedClient({ apiKey: process.env.LINKNRED_API_KEY! });

// Environment is derived from the key prefix — no manual toggle.
console.log(client.environment); // 'test' | 'live'

const me = await client.whoami();
console.log(me.application_id, me.scopes);
```

## Escrow lifecycle

LinknRed escrows are on-chain state machines. The SDK exposes **on-chain methods** (the production path) and **projection methods** (legacy, kept for internal tooling).

| Actor  | Action           | SDK method (production)                          | On-chain function                          | Gas    |
| ------ | ---------------- | ------------------------------------------------ | ------------------------------------------ | ------ |
| Buyer  | Fund escrow      | `client.gasless.relay({ action: 'create', … })`  | `createEscrowWithSignature`                | Relay  |
| Seller | Mark shipped     | `client.escrows.shipOnChain(signed)`             | `markShippedWithSignature`                 | Relay  |
| Buyer  | Confirm delivery | `client.escrows.confirmOnChain(signed)`          | `confirmDeliveryWithSignature`             | Relay  |
| Either | Open dispute     | `client.escrows.disputeOnChain(signed)`          | `openDisputeWithSignature`                 | Relay  |
| Either | Withdraw split   | `client.escrows.withdrawOnChain(signed)`         | `withdrawResolvedWithSignature`            | Relay  |
| Buyer  | Cancel           | `client.escrows.cancelOnChain({ signer, … })`    | `cancelEscrow` (no `WithSignature` variant) | Buyer pays gas |

The projection methods (`ship`, `confirm`, `cancel`, `dispute`, `withdraw`) still exist but are `@deprecated` — they only update the DB state without touching the chain. Use them only for internal migrations.

### Signing on-chain actions with MetaMask

```ts
import { BrowserProvider } from 'ethers'; // ethers v6
import { LinknRedClient, signMarkShipped } from '@linknred/payments';

const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const signed = await signMarkShipped(signer, {
  chainId: 1029,                            // BTTC Donau
  verifyingContract: '0x1de8...Ab34',       // LinknRedProtocolCore proxy
  escrowId: 100,
  nonce: await getNonceForActor(signer),
  deadline: Math.floor(Date.now() / 1000) + 3600,
});

const client = new LinknRedClient({ apiKey: '...' });
const res = await client.escrows.shipOnChain(signed);
console.log(res.txHash);
```

### Buyer-signed cancel (direct tx)

`cancelEscrow` is buyer-only and V4.3 does not expose a gasless variant, so the buyer pays gas directly:

```ts
import { BrowserProvider } from 'ethers';
const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const result = await client.escrows.cancelOnChain({
  orderVendorId: '364a2936-...',
  buyerWallet: (await signer.getAddress()).toLowerCase(),
  escrowId: 100,
  verifyingContract: '0x1de8...Ab34',
  signer,
  reason: 'buyer requested cancel',
});
console.log(result.txHash, result.status); // 'cancelled'
```

## Configuration

```ts
new LinknRedClient({
  apiKey: 'lk_prod_...',            // required
  baseUrl: 'https://api.example',   // optional — overrides `endpoints`
  timeoutMs: 30_000,                // default: 30_000
  maxRetries: 2,                    // default: 2
  fetch: customFetch,               // default: globalThis.fetch
  apiVersion: '2026-07-04',
  appInfo: { name: 'my-app', version: '1.2.3' },
});
```

## Errors

```ts
import { LinknRedRateLimitError, LinknRedError } from '@linknred/payments';

try {
  await client.escrows.shipOnChain(signed);
} catch (err) {
  if (err instanceof LinknRedRateLimitError) {
    // back off, honor Retry-After
  } else if (err instanceof LinknRedError) {
    console.error(err.code, err.requestId, err.docUrl);
  }
}
```

## Webhooks

Subscribable events (protocol spec §6.1):

`escrow.created`, `escrow.shipped`, `escrow.cancelled`, `escrow.delivered`, `escrow.released`, `escrow.auto_released`, `escrow.disputed`, `escrow.dispute_resolved`, `escrow.dispute_resolved_split`, `escrow.refunded`, `escrow.withdrawal_claimed`.

```ts
import { constructEvent } from '@linknred/payments';

const event = constructEvent(rawBody, req.headers['linknred-signature'], webhookSecret);
switch (event.type) {
  case 'escrow.shipped':   /* … */ break;
  case 'escrow.cancelled': /* … */ break;
}
```

`webhook.test` is reserved for `client.webhooks.test()` and cannot be subscribed to.

## Buyer inspection period (`>= 0.4.0`)

`client.escrows.status()` exposes the inspection period as semantics, never as
the on-chain sentinel. The period starts at `SHIPPED` (LNR-RFC-0003):

```ts
const s = await client.escrows.status({ escrowId });
s.auto_release_at; // string | null — null while the escrow is still FUNDED
s.inspection;      // { status: 'not_started' | 'running' | 'elapsed', ends_on, remaining_seconds }
```

Read the deployed Core version straight from the chain:

```ts
await client.protocol.version({ coreAddress, provider }); // { version: '4.4.0', source: 'chain' }
await client.protocol.version();                          // { version: '4.4.0', source: 'edge' }
```

## Idempotency

Pass `idempotencyKey` on any mutation to make it safely retryable:

```ts
await client.escrows.shipOnChain(signed, { idempotencyKey: `ship-${escrowId}-${nonce}` });
```

## Documentation

Full docs live in [`docs/payments/`](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/README.md):

- [00 — Core concepts](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/00-core-concepts.md) — vocabulary of the protocol.
- [01 — Getting started](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/01-getting-started.md) and [01a — Environments & keys](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/01a-environments.md).
- [02 — Escrow lifecycle](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/02-escrow-lifecycle.md), [03 — Webhooks](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/03-webhooks.md).
- [04 — SDK reference](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/04-sdk-reference.md) and [04a — Errors](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/04a-errors-reference.md).
- [06 — Architecture & boundaries](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/06-architecture-boundaries.md), [07 — Idempotency](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/07-idempotency.md).
- [08 — Eligibility](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/08-eligibility.md), [09 — Disputes UX](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/09-disputes-ux-guide.md), [10 — Checklist](https://github.com/linknred/linknred-protocol/blob/main/docs/payments/10-integrator-checklist.md).

## Examples

See `examples/`:

- `01-quickstart.ts` — client + `whoami`
- `02-verify-webhook.ts` — webhook signature verification
- `03-gasless-relay.ts` — raw gasless relay usage
- `04-full-lifecycle-metamask.ts` — end-to-end browser flow (fund → ship → confirm → cancel)
- `05-vendor-integration-express.ts` — generic Express webhook receiver
- `06-external-system-event-consumer.ts` — trigger on-chain actions from external system events

## License

MIT
