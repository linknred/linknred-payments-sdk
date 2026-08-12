# LinknRed versioning policy

Status: **Normative**. Established by [`LNR-RFC-0000`](https://github.com/linknred/linknred-protocol/blob/main/docs/protocol/rfcs/0000-process.md).

LinknRed is not one artifact but five public surfaces that evolve at different speeds. A
single version number for all of them would be either meaningless or a permanent lie. Each
surface carries its own SemVer, and this document defines what MAJOR, MINOR and PATCH mean
for each one, plus the compatibility matrix that binds them.

## 1. Versioned surfaces

| Surface | Where the version lives | Current |
| --- | --- | --- |
| **Core contract** | `protocolVersion()` on-chain — the source of truth | `4.4.0` |
| **Protocol spec** | header of `docs/linknred-protocol-spec.md` | `0.2` |
| **CAD** | `cadVersion` field inside every document | `1` |
| **REST API** | URL path (`/functions/v1/...`) + `protocol_version` in responses | `0.2` |
| **SDK** | npm `@linknred/payments` | `0.3.x` |

## 2. What a bump means

### Core contract

- **MAJOR** — a state, actor, precondition or fee mechanic is removed or redefined; storage
  layout changes incompatibly. Requires an RFC and a migration plan for live escrows.
- **MINOR** — new function, new event, or a change in *when* an existing field is written
  without altering the layout (this is what V4.4.0 did).
- **PATCH** — bug fix that restores documented behaviour.

The deployed version is read from the chain, never assumed. Any tool that needs to know
which Core it is talking to calls `protocolVersion()`.

### Protocol spec

Follows the Core MAJOR.MINOR. The spec never leads the contract: a rule is written into the
spec when it is deployed, not when it is decided.

### CAD

`cadVersion` is a single integer, not SemVer. It increments **only** when the canonical form
or the hashing rule changes, because that changes `cadHash` for identical commercial content.
Adding an optional field does not bump it. Verifiers MUST reject a `cadVersion` they do not
know rather than guess.

### REST API

- **MAJOR** — an existing field is removed or changes meaning; an endpoint disappears.
- **MINOR** — new endpoint, new response field, new error code, or a field that may now be
  `null` where it previously always had a value. Consumers MUST tolerate additive changes.
- **PATCH** — fixes with no contract impact.

Error codes are additive-only. A deprecated code keeps working as an alias for the length of
the deprecation window (§4).

### SDK

Follows SemVer against its own public TypeScript surface, independently of the Core version
it talks to. An SDK MINOR may be required to expose a Core MINOR.

## 3. Compatibility matrix

Published with every SDK release and checked by the Mainnet preflight:

| SDK | Core | CAD | REST |
| --- | --- | --- | --- |
| 0.3.x | ≥ 4.3.0 | 1 | 0.1 – 0.2 |
| 0.4.x (planned) | ≥ 4.4.0 | 1 | 0.2 |

An SDK MUST NOT silently operate against a Core below its minimum. It reads
`protocolVersion()` and fails loudly on mismatch.

## 4. Deprecation window

A deprecated element (error code, field, method) is kept working for **90 days** from the
release that deprecates it, and is announced in the RFC that deprecates it. Integrators
materially affected are notified during the RFC's Review state.

Removal requires a MAJOR bump of the affected surface. Nothing is removed silently.

## 5. Anti-patterns

- Bumping the spec for a change that is not deployed.
- Reusing a version number after a rollback — roll forward with a new PATCH instead.
- Publishing an SDK that requires an unreleased Core.
- Treating an off-chain registry as the authority on the deployed Core version.
