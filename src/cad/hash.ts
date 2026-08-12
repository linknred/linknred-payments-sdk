/**
 * `cadHash = keccak256(JCS(cad))`. The sole cryptographic anchor of CAD
 * identity — see §5b and §7.6.1 of `docs/architecture/edge-platform-v1-draft.md`,
 * and CF-cad-01a in Appendix A.
 *
 * Requires `ethers` (peer dep). Kept as a thin re-export so callers get a
 * stable SDK surface even if the underlying keccak provider changes.
 */
import { keccak256 } from 'ethers';

/** Compute `cadHash` (0x…) over already-canonicalized JCS bytes. */
export function hashCad(bytes: Uint8Array): `0x${string}` {
  return keccak256(bytes) as `0x${string}`;
}
