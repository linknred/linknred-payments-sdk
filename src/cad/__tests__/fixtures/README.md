# Public CAD test vectors — `sample-escrow-A` / `sample-escrow-B`

Synthetic, frozen vectors used to validate any CAD implementation (SDK, Commerce Node or
third-party verifier) **without depending on any real escrow**.

They are derived from `docs/cad-specification-v1.md` alone. Every wallet, token address,
service identifier and amount is a documentation placeholder: no funded account, no
deployed contract, no personal data, no reference to a production order. That is the point
— a public conformance suite that requires private fixtures is not a public conformance
suite.

Regenerated only by changing the specification, never to make a test pass. A mismatch means
the implementation changed.

## Files per fixture

| File | Meaning | Authority |
|---|---|---|
| `<id>.cad.json` | The CAD document, as authored. | source |
| `<id>.jcs.bin` | Exact JCS (RFC 8785) bytes of that CAD. | canonical bytes |
| `<id>.hash.txt` | `cadHash = keccak256(jcs.bin)`. | **Protocol Contract** — sole identity anchor (CF-cad-01a) |
| `<id>.cid.txt` | Canonical CID. Identical to `.cid.dagpb.txt`. | Integration Contract |
| `<id>.cid.dagpb.txt` | CIDv1 `dag-pb` (`bafybei…`) — the canonical regime (Decision D1). | Integration Contract |
| `<id>.cid.raw.txt` | CIDv1 `raw` (`bafkrei…`) — alternative regime, same digest. | reference |

`cadHash` is identical under both regimes: the regime changes how the content digest is
wrapped into a CID, never the identity of the document.

## What each vector exercises

| Fixture | Shape |
|---|---|
| `sample-escrow-A` | Two items, quantity > 1, flat shipping charged, `mode: ship` |
| `sample-escrow-B` | Single item above the free-shipping threshold, shipping `0` |

Both carry a single-hop `rate.path` whose product reproduces `rate.value` exactly, so
step 7 of the verification protocol is exercised without floating-point tolerance debate,
and a coarse destination (country / state / city, no street, no recipient, no contact) per
the PII rules of the CAD specification.

## Reproduce

```bash
npx tsx scripts/external-verifier/verify.ts --fixture sample-escrow-A --offline
npx tsx scripts/external-verifier/verify.ts --fixture sample-escrow-B --offline
```
