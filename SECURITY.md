# Security policy

- **Status:** Normative
- **Last revision:** 2026-08-08

LinknRed is payment infrastructure. Escrowed funds live in an on-chain contract and
commercial agreements are anchored cryptographically. We treat vulnerability reports as
first-class engineering work, not as public relations.

## Reporting a vulnerability

**Email `security@linknred.com`.** Do not open a public issue, do not disclose on social
media, and do not test against escrows that are not yours.

Include, as far as you can:

- The affected surface (contract, REST endpoint, SDK, CAS, web application).
- Steps to reproduce, or a proof of concept.
- The impact you believe it has, and on whom (buyer, seller, resolver, protocol).
- Transaction hashes, escrow IDs or `request_id` values if the issue is observable.

If `security@linknred.com` does not acknowledge your report within the window below,
escalate to `factory@linknred.com`. A reporter must never be left without a channel.

## Our commitments

| Stage | Commitment |
| --- | --- |
| Acknowledgement | Within 72 business hours |
| Severity assessment and initial response | Within 7 calendar days |
| Coordinated disclosure | Up to 90 days from acknowledgement; earlier by mutual agreement |
| Credit | Public credit if you want it, anonymity if you prefer it |

There is no monetary bounty at this time. If a paid programme is established it will be
announced here, and reports received before it starts will not be retroactively rewarded.

## Who handles your report

Responsibility is explicit, not implied:

- **LinknRed core stewardship (protocol owner)** — sole authority to accept a disclosure,
  authorise a fix that touches a protocol invariant, approve a coordinated disclosure date
  and decide on emergency measures such as pausing the protocol.
- **The software factory (engineering)** — first responder: triage, reproduction, severity
  assessment, mitigation proposal, and, when an invariant is affected, drafting the
  corresponding LNR-RFC (see `CONTRIBUTING.md` and
  `docs/protocol/rfcs/0000-process.md`).

A fix that changes a documented invariant is never shipped silently. It goes through the
RFC process, with the deprecation window defined in `docs/protocol/versioning.md`.

## In scope

- `LinknRedProtocolCore` (UUPS proxy, current `protocolVersion()` 4.4.0) and
  `LinknRedMembershipV2` on BTTC.
- The public REST surface (`api-*` edge functions) and the gasless relay.
- `@linknred/payments` and the helper utilities under `sdk/`.
- CAD canonicalisation, hashing and anchoring; CAS retrieval and the `dag-pb` regime.
- The LinknRed.com web application, including wallet and consent flows.

## Out of scope

- Findings that require a compromised user device, browser extension or wallet.
- Reports produced solely by an automated scanner with no demonstrated impact.
- Missing hardening headers with no exploitable consequence.
- Denial of service against public RPC endpoints or third-party infrastructure
  (BTTC nodes, Supabase, DigitalOcean) — report those to their operators.
- Social engineering of LinknRed staff, Commerce Node operators or end users.
- Anything requiring physical access.
- Testnet token exhaustion or spam on BTTC Donau.

## Safe harbour

We will not pursue legal action against research that, in good faith:

- stays within the scope above;
- uses **BTTC Donau (testnet)** wherever a reproduction is possible there;
- does not access, modify, exfiltrate or retain data belonging to other users;
- does not degrade service for others, and does not attempt to move funds that are not
  yours;
- gives us a reasonable window before public disclosure.

Extracting personal data of buyers or sellers is never in good faith, regardless of how
the access was obtained.

## What this policy is not

This document declares a **process and a set of commitments**. It is not a certification,
an audit result, or a claim of compliance with SOC 2, ISO 27001, PCI DSS or any other
framework. The Core contract has not been audited by an independent third party; that is a
separate pre-Mainnet deliverable.

## Related documents

- `CONTRIBUTING.md` — how a change to a public surface is proposed.
- `docs/governance/repository-governance.md` — what is public and why.
- `docs/security/pre-exposure-sweep-v1.md` — pre-exposure review of the corpus.
- `docs/protocol/versioning.md` — deprecation window and version semantics.
