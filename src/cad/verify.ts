/**
 * `verifyCad` — the reference implementation of the CAD verification
 * protocol (see `docs/protocol/cad-verification-protocol.md` and
 * `edge-platform-v1-draft.md` §5b, §7.6.1).
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  Gate G8-#4 (BLOCKING before Freeze v1.0)                            │
 * │                                                                      │
 * │  `cadHash` is the SOLE cryptographic identity of a CAD (CF-cad-01a). │
 * │  `cadCid` is a *retrieval identifier*: a mismatch between the CID    │
 * │  recomputed from the retrieved bytes and the CID anchored on-chain   │
 * │  MUST NOT invalidate the CAD, provided the retrieved bytes satisfy   │
 * │  the cryptographic + canonicalization checks below.                  │
 * │                                                                      │
 * │  A CID mismatch is surfaced as a structured `warning` with code      │
 * │  `CID_RETRIEVAL_MISMATCH`. It never becomes an alternative identity  │
 * │  criterion. Callers may log or alert on it, but MUST NOT use the CID │
 * │  as the primary trust anchor.                                        │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { canonicalizeCad, canonicalizeJson } from './jcs';
import { hashCad } from './hash';
import { cidCad, type CidRegime } from './cid';
import type { CadAnchor } from './anchor';

export interface VerifyCadOptions {
  /**
   * CAS encoding regime the anchored `cadCid` was produced under.
   * Default `'dag-pb'` — the canonical production regime of the managed
   * LinknRed CAS (Decision D1). Pass `'raw'` for CADs anchored before the
   * managed CAS existed.
   *
   * The regime only affects the informative CID coherence check; it can never
   * change the outcome of the `cadHash` identity check (CF-cad-01a).
   */
  casRegime?: CidRegime;
}


export type VerifyErrorCode =
  | 'HASH_MISMATCH'
  | 'CANONICALIZATION_MISMATCH'
  | 'VERSION_MISMATCH'
  | 'INVALID_JSON';

export type VerifyWarningCode = 'CID_RETRIEVAL_MISMATCH';

export interface VerifyError {
  code: VerifyErrorCode;
  message: string;
  expected?: string;
  got?: string;
}

export interface VerifyWarning {
  code: VerifyWarningCode;
  message: string;
  expected: string;
  got: string;
}

export type VerifyResult =
  | { ok: true; cad: unknown; warnings: VerifyWarning[] }
  | { ok: false; error: VerifyError; warnings: VerifyWarning[] };

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Verify that `bytes` (canonically retrieved from a CAS backend) match
 * the on-chain `anchor` written to `escrow.metadata`.
 *
 * Semantics — hash > CID (Gate G8-#4):
 *   • `cadHash` mismatch → fail-closed (`error.code = HASH_MISMATCH`).
 *   • JCS round-trip mismatch → fail-closed (`CANONICALIZATION_MISMATCH`).
 *   • `cadVersion` mismatch → fail-closed (`VERSION_MISMATCH`).
 *   • `cadCid` mismatch → PASS with warning `CID_RETRIEVAL_MISMATCH`.
 *     The CID is never allowed to override `cadHash` in either direction.
 *
 * @see CF-cad-01a (Appendix A) — CID must not be used as identity.
 * @see edge-platform-v1-draft.md §5b — invariance demonstration.
 */
export async function verifyCad(
  bytes: Uint8Array,
  anchor: CadAnchor,
  opts: VerifyCadOptions = {},
): Promise<VerifyResult> {
  const warnings: VerifyWarning[] = [];


  // Step 3 — cadHash check (fail-closed, primary identity anchor).
  const recomputedHash = hashCad(bytes);
  if (recomputedHash.toLowerCase() !== anchor.cadHash.toLowerCase()) {
    return {
      ok: false,
      error: {
        code: 'HASH_MISMATCH',
        message: 'keccak256(bytes) does not match anchor.cadHash',
        expected: anchor.cadHash,
        got: recomputedHash,
      },
      warnings,
    };
  }

  // Step 4 — JCS canonicalization round-trip.
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'INVALID_JSON',
        message: 'retrieved bytes are not valid JSON: ' + (e as Error).message,
      },
      warnings,
    };
  }
  const reserialized = new TextEncoder().encode(canonicalizeJson(parsed));
  if (!bytesEqual(reserialized, bytes)) {
    return {
      ok: false,
      error: {
        code: 'CANONICALIZATION_MISMATCH',
        message: 'JCS(reparse(bytes)) does not match the retrieved bytes',
      },
      warnings,
    };
  }

  // Step 5 — cadVersion equality.
  const parsedVersion = (parsed as { cadVersion?: unknown } | null)?.cadVersion;
  if (String(parsedVersion) !== anchor.cadVersion) {
    return {
      ok: false,
      error: {
        code: 'VERSION_MISMATCH',
        message: 'cad.cadVersion !== anchor.cadVersion',
        expected: anchor.cadVersion,
        got: String(parsedVersion),
      },
      warnings,
    };
  }

  // Step (informative) — CID coherence. Warning-only per G8-#4 / CF-cad-01a.
  const casRegime: CidRegime = opts.casRegime ?? 'dag-pb';
  const recomputedCid = await cidCad(bytes, { regime: casRegime });
  if (recomputedCid !== anchor.cadCid) {
    const otherRegime: CidRegime = casRegime === 'dag-pb' ? 'raw' : 'dag-pb';
    const alt = await cidCad(bytes, { regime: otherRegime });
    warnings.push({
      code: 'CID_RETRIEVAL_MISMATCH',
      message:
        'Recomputed CID differs from anchored cadCid. This does NOT invalidate ' +
        'the CAD (cadHash is the sole identity anchor per CF-cad-01a). ' +
        (alt === anchor.cadCid
          ? `The anchored CID matches the '${otherRegime}' CAS regime — pass ` +
            `{ casRegime: '${otherRegime}' } to verifyCad, or re-anchor under the ` +
            `canonical 'dag-pb' regime so the reference resolves on the managed CAS.`
          : 'It usually indicates a CAS backend re-encoded the blob or used a ' +
            'different codec.'),
      expected: anchor.cadCid,
      got: recomputedCid,
    });
  }


  return { ok: true, cad: parsed, warnings };
}

// Re-export helper for callers who want to canonicalize without hashing.
export { canonicalizeCad };
