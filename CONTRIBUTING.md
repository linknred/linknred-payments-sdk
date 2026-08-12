# Contributing to LinknRed

- **Status:** Normative
- **Last revision:** 2026-08-08

LinknRed is a protocol before it is an application. Third parties — Commerce Nodes,
resolvers, auditors, SDK consumers — depend on invariants they did not write. That
constraint shapes how contributions are accepted.

## 1. The gate: does your change touch an invariant?

**If it does, it needs an LNR-RFC before any code.** See
[`docs/protocol/rfcs/0000-process.md`](https://github.com/linknred/linknred-protocol/blob/main/docs/protocol/rfcs/0000-process.md).

An RFC is **required** for changes to:

- `LinknRedProtocolCore` state machine, actors, preconditions, fee mechanics or storage
  layout;
- `LinknRedMembershipV2` economics;
- the public webhook catalog or envelope;
- the public REST surface: endpoints, error codes, response shapes;
- CAD (`cadVersion`, canonical form, hashing, anchoring);
- the CAS regime or the verification protocol;
- the FX authority path (Quotes API, rate bands, fail-closed behaviour);
- the public SDK surface (`docs/protocol/sdk-public-surface.md`);
- any normative document listed in [`docs/INDEX.md`](https://github.com/linknred/linknred-protocol/blob/main/docs/INDEX.md).

An RFC is **not** required for: internal refactors, UI work, informative documentation,
bug fixes that restore already-documented behaviour, tests, or operational runbooks.

Pull requests that change an invariant without an accepted RFC are closed with a pointer
to the process, not merged and documented later.

## 2. Pull requests

1. One concern per pull request. A refactor and a behaviour change do not travel together.
2. State which surfaces you touched (Core, REST, CAD, CAS, SDK, app) and the version
   impact per `docs/protocol/versioning.md`.
3. Include evidence: unit tests, an on-chain reproduction on BTTC Donau, or a conformance
   run — whichever the change warrants. "It works locally" is not evidence.
4. Never introduce a new version constant. Versions shown in the UI come from
   `src/lib/protocol-version.ts`; the deployed Core version is read from
   `protocolVersion()` on-chain.
5. No hardcoded colours in components. Design tokens only.
6. Never commit secrets, droplet IPs, relayer or admin addresses, or personal data. See
   `docs/security/pre-exposure-sweep-v1.md` §5.1 for the scan rule applied to public
   repositories.

## 3. Toolchain

- Contracts: Hardhat with CommonJS config (`hardhat.config.cjs`), Node 20 LTS,
  OpenZeppelin pinned at **4.9.6**, UUPS proxies only.
- Application and SDK: ethers **v6**; Hardhat tooling uses ethers v5. Do not merge the two.
- Any upgrade to the Core must pass the storage-layout validation gate
  (`scripts/upgrade/validate-core-v44-layout.cjs`) before deployment.

## 4. Reporting a vulnerability

Do **not** open a pull request or a public issue. Follow [`SECURITY.md`](./SECURITY.md).

## 5. Licensing and trademark

Contributions are accepted under the MIT license (see `LICENSE`). The MIT grant does not
extend to the LinknRed name, the LINK'N RED wordmark or the logo, which are registered
trademarks (EUIPO No 019331492) governed by `docs/legal/trademark-policy.md`. A fork may
use the code; it may not present itself as LinknRed.

By submitting a contribution you confirm you have the right to license it under these
terms.
