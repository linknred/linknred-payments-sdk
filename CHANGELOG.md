# Changelog — @linknred/payments

All notable changes to the official LinknRed Payments SDK. This project follows
[Semantic Versioning](https://semver.org) against its own public TypeScript surface,
independently of the Core contract version it talks to
(see `docs/protocol/versioning.md` §2).

Compatibility is published per release and checked by the Mainnet preflight. An SDK
never silently operates against a Core below its minimum: it reads `protocolVersion()`
and fails loudly on mismatch.

## [1.0.0-rc.1] — 2026-08-12

The public surface is **frozen** as of 0.4.0 and inventoried in
`docs/protocol/sdk-public-surface.md`. `1.0.0-rc.1` promotes that surface to a stability
commitment without adding to it: no new exports, no signature changes, no behavioural
change against Core 4.4.0 / REST 0.2 / CAD 1.

Both release preconditions are now satisfied:

1. `github.com/linknred/linknred-payments-sdk` exists and is public, with the approved
   baseline `public-baseline-v1` (`3578dc40…`) — see
   `docs/governance/public-baseline-v1.md`.
2. Repository governance and MIT license approved per
   `docs/governance/repository-governance.md` §5.

## [0.4.0] — 2026-08-07

Aligned with **Core V4.4.0** (LNR-RFC-0003, buyer inspection period).

### Added
- `EscrowInspection` with semantic state `not_started | running | elapsed`, so an
  integrator never has to interpret a raw timestamp.
- `ProtocolResource` (`client.protocol`) with on-chain `protocolVersion()` reading and
  `decodeAbiString`.
- `HealthResource` (`client.health.ping()`) for reachability checks without consuming a
  business endpoint.

### Changed
- The inspection window is reported as starting at `SHIPPED`, not at funding. An
  `autoReleaseTime` of `0` is the sentinel for "not started" and is never surfaced as a
  date.

### Compatibility
Core ≥ 4.4.0 · CAD 1 · REST 0.2.

## [0.3.0] — 2026-08-06

Authoritative FX (Decision D3).

### Added
- `QuotesResource` (`client.quotes`) — the single source of truth for fiat → settlement
  token conversion. Commerce Nodes MUST NOT implement their own conversion.
- `verifyCadRate` / `rateIsExpired` with typed `RateError` codes, for verifying the rate
  path recorded inside a CAD.

### Changed
- Fail-closed behaviour: a missing or stale rate aborts the operation. There is no
  hardcoded parity and no fallback.

### Compatibility
Core ≥ 4.3.0 · CAD 1 · REST 0.1–0.2.

## [0.2.1] — 2026-08-06

### Changed
- **Decision D2:** a Commerce Node anchors the CID returned by the CAS. A locally computed
  CID is not authoritative.
- `cidCad` accepts an explicit `CidRegime`; `dag-pb` is canonical.

### Fixed
- Anchor encode/decode round-trip for legacy metadata (`isLegacyMetadata`).

## [0.2.0] — 2026-08-06

CAD helpers (LNR-RFC-0002). First release with the CAD as a protocol primitive.

### Added
- `canonicalizeCad`, `canonicalizeJson` (RFC 8785 JCS), `hashCad`, `cidCad`.
- `encodeAnchor` / `decodeAnchor` for the on-chain metadata anchor.
- `verifyCad` with typed `VerifyError` / `VerifyWarning` codes.
- `CAS_CHUNK_SIZE_BYTES` exported so a verifier can reproduce chunking.

### Identity policy (Gate G8-#4, CF-cad-01a)
`cadHash` is the sole cryptographic identity anchor. `cadCid` is retrieval-only. The SDK
does **not** reject a CAD for a CID mismatch when the hash verifies; it emits a warning.

## [0.1.0-alpha.4] — 2026-08-05

### Added
- `client.health.ping()`.
- Token listing used for FX and allowance pre-checks, removing per-integrator guesswork.

## [0.1.0-alpha.3] — 2026-08-05

### Changed
- CAS endpoint migrated to the LinknRed-managed platform after the public
  `gateway.btfs.io` gateway became unresolvable.

## [0.1.0-alpha.2] — 2026-08-04

### Fixed
- `signCreateEscrow` was implemented but not exported from the package entrypoint.
- `examples/` was missing from the published tarball (`files` in `package.json`).

## [0.1.0-alpha.1] — 2026-08-04

First published alpha.

### Added
- `LinknRedClient` with environment derived from the key prefix and zero I/O in the
  constructor.
- `WebhooksResource`, `GaslessResource`, `EscrowsResource`.
- `constructEvent` for webhook signature verification over the raw body.
- EIP-712 signing helpers: `signCreateEscrow`, `signMarkShipped`, `signConfirmDelivery`,
  `signOpenDispute`, `signWithdrawResolved`.
- `computeItemsHash`, `canonicalizeItems`, `toPriceArrays`, `MAX_ITEMS`.
- Typed error hierarchy, every error carrying `requestId`, `code`, `type` and `status`.
- Automatic retry with exponential backoff on 429/5xx/network for GET/DELETE; POST/PATCH
  only when an `idempotencyKey` is supplied.
