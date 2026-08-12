# SDK public surface — @linknred/payments

- **Status:** Normative
- **Frozen as of:** 0.4.0 (2026-08-07)
- **Established by:** Phase 3, block S1
- **Related:** `docs/protocol/versioning.md`, `CHANGELOG.md`

Everything listed here is a public commitment. Removing or changing the meaning of any
entry is a MAJOR bump and requires an LNR-RFC. Anything not listed here is internal and may
change in a PATCH, even if it happens to be reachable at runtime.

## 1. Compatibility matrix

| SDK | Core | CAD | REST |
| --- | --- | --- | --- |
| 0.3.x | ≥ 4.3.0 | 1 | 0.1 – 0.2 |
| 0.4.x | ≥ 4.4.0 | 1 | 0.2 |
| 1.0.x (planned) | ≥ 4.4.0 | 1 | 0.2 |

The SDK reads `protocolVersion()` from the chain and fails loudly on mismatch. It never
assumes a deployed version and never trusts an off-chain registry for it.

## 2. Client

| Export | Kind | Notes |
| --- | --- | --- |
| `LinknRedClient` | class | Environment derived from the API key prefix. Constructor performs **zero I/O** |
| `LinknRedClientOptions` | type | |
| `WhoamiResponse` | type | `account_id`, `application_id`, `environment`, `scopes`, `rate_limit_per_minute` |
| `Environment` | type | `sandbox` \| `live` |
| `defaultEndpointResolver`, `staticEndpointResolver`, `EndpointResolver` | fn / type | Endpoint resolution is overridable; the default is discovery-based and cached per instance |

## 3. Resources

Attached to the client instance; also exported as classes for advanced composition.

| Accessor | Class | Surface |
| --- | --- | --- |
| `client.webhooks` | `WebhooksResource` | `create`, `update`, `rotate`, `test`, plus `SUBSCRIBABLE_WEBHOOK_EVENTS`. `webhook.test` is reserved |
| `client.escrows` | `EscrowsResource` | `ship`, `confirm`, `cancel`, `dispute`, `withdraw`, `status` |
| `client.gasless` | `GaslessResource` | `relay`, plus `GASLESS_ACTIONS` |
| `client.quotes` | `QuotesResource` | Authoritative fiat → token conversion (Decision D3) |
| `client.protocol` | `ProtocolResource` | On-chain `protocolVersion()`, `decodeAbiString` |
| `client.health` | `HealthResource` | `ping()` |

Associated public types: `Webhook`, `CreateWebhookParams`, `CreateWebhookResult`,
`UpdateWebhookParams`, `RotateWebhookParams`, `RotateWebhookResult`, `TestWebhookResult`,
`SubscribableWebhookEvent`, `EscrowStatus`, `EscrowSummary`, `EscrowInspection`,
`EscrowMutationResult`, `ShipParams`, `ConfirmParams`, `CancelParams`, `DisputeParams`,
`WithdrawParams`, `StatusQuery`, `GaslessAction`, `RelayRequest`, `RelayResponse`, `Quote`,
`QuoteRate`, `QuoteRateHop`, `CreateQuoteParams`, `IndicativeRate`, `EthCallLike`,
`OnChainVersionParams`, `ProtocolVersionResult`, `HealthPingResponse`.

### 3.1 Frozen semantics worth stating

- **`EscrowInspection.state`** is `not_started | running | elapsed`. `not_started`
  corresponds to the on-chain sentinel `autoReleaseTime == 0` (LNR-RFC-0003). The sentinel
  is never exposed as a date, and the window starts at `SHIPPED`, never at funding.
- **`client.quotes` is the only conversion path.** A Commerce Node implementing its own
  fiat → token parity is non-conformant.

## 4. Errors

`LinknRedError` (base) and the subclasses `LinknRedInvalidRequestError`,
`LinknRedAuthenticationError`, `LinknRedPermissionError`, `LinknRedRateLimitError`,
`LinknRedIdempotencyError`, `LinknRedAPIError`, `LinknRedConnectionError`,
`LinknRedEscrowNotFundedError`; types `LinknRedErrorType`, `LinknRedErrorPayload`.

Every error carries `.requestId`, `.code`, `.type` and `.status`. Error codes are
**additive-only**; a deprecated code keeps working as an alias for the 90-day window
defined in `docs/protocol/versioning.md` §4.

## 5. Webhook verification

`constructEvent`, `LinknRedSignatureError`, `ConstructEventOptions`, `WebhookEvent`.

`constructEvent` requires the **raw body**. Re-serialising a parsed object produces
different bytes and the signature fails. This is a permanent contract, not an
implementation detail.

## 6. Signing (EIP-712)

| Export | Purpose |
| --- | --- |
| `signCreateEscrow`, `CREATE_ESCROW_EIP712_TYPES` | Escrow creation |
| `signLifecycleAction`, `signMarkShipped`, `signConfirmDelivery`, `signOpenDispute`, `signWithdrawResolved`, `LIFECYCLE_EIP712_TYPES` | Full lifecycle (Core V4.3+) |
| `computeItemsHash`, `canonicalizeItems`, `toPriceArrays`, `MAX_ITEMS` | Items hashing, must match on-chain validation |
| `buildCancelEscrowTx`, `cancelEscrowWithSigner`, `CANCEL_ESCROW_SELECTOR` | Direct on-chain cancel |

Types: `BuildCreateEscrowParams`, `SignedCreateEscrow`, `LifecycleAction`,
`SignedLifecycleAction`, `SignerLike`, `EIP712Domain`, `EIP712Types`,
`BuildLifecycleParams`, `EscrowItem`, `CancelEscrowTx`, `BuildCancelEscrowTxParams`,
`CancelEscrowWithSignerParams`, `CancelEscrowResult`, `TxSenderLike`.

The EIP-712 domain MUST include `verifyingContract`. Omitting it produces
`InvalidSignature` at the relay.

## 7. CAD

`canonicalizeCad`, `canonicalizeJson`, `hashCad`, `cidCad`, `CAS_CHUNK_SIZE_BYTES`,
`encodeAnchor`, `decodeAnchor`, `isLegacyMetadata`, `verifyCad`, `verifyCadRate`,
`rateIsExpired`.

Types: `CidRegime`, `CidCadOptions`, `CadAnchor`, `VerifyCadOptions`, `VerifyResult`,
`VerifyError`, `VerifyErrorCode`, `VerifyWarning`, `VerifyWarningCode`, `CadRate`,
`CadRateHop`, `RateError`, `RateErrorCode`, `VerifyRateResult`.

### 7.1 Identity policy (CF-cad-01a, Gate G8-#4) — frozen

`cadHash` is the **sole** cryptographic identity anchor. `cadCid` is retrieval-only. The
SDK does not reject a CAD when the CID diverges but the hash verifies; it emits a warning.
`dag-pb` is the canonical CID regime. A verifier MUST reject an unknown `cadVersion` rather
than guess.

## 8. Runtime support

Node ≥ 18, Deno, Bun, Cloudflare Workers, Vercel Edge, and modern browsers. `ethers` is an
**optional peer dependency** (`^6.13.0`): only the signing and on-chain helpers need it.
Secrets must never live in browser code.

## 9. Retry policy

Exponential backoff on 429, 5xx and network failures for GET and DELETE. POST and PATCH
retry **only** when an `idempotencyKey` is supplied. This asymmetry is part of the
contract, not an optimisation.

## 10. What is explicitly not public

- Anything under `src/` not re-exported from `src/index.ts`.
- The internal HTTP transport (`src/http.ts`) and its shapes.
- Test fixtures and the contents of `examples/`, which illustrate rather than commit.
