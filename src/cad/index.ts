/**
 * `@linknred/payments` — CAD (Commercial Agreement Document) surface.
 * Reference implementation of RFC 0002 / CAD v1.0.
 *
 * Identity policy (Frozen v1.0, Gate G8-#4):
 *   - `cadHash` is the sole cryptographic identity anchor (CF-cad-01a).
 *   - `cadCid` is a retrieval identifier; mismatch is a warning, not an error.
 */
export { canonicalizeCad, canonicalizeJson } from './jcs';
export { hashCad } from './hash';
export { cidCad, CAS_CHUNK_SIZE_BYTES, type CidRegime, type CidCadOptions } from './cid';
export {
  encodeAnchor,
  decodeAnchor,
  isLegacyMetadata,
  type CadAnchor,
} from './anchor';
export {
  verifyCad,
  type VerifyCadOptions,
  type VerifyResult,
  type VerifyError,
  type VerifyErrorCode,
  type VerifyWarning,
  type VerifyWarningCode,
} from './verify';

