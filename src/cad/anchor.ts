/**
 * On-chain anchor for a CAD blob, written to `escrow.metadata`.
 * See `edge-platform-v1-draft.md` §5b (Gate G8-#3, frozen encoding).
 */

export interface CadAnchor {
  cadVersion: string;
  cadHash: `0x${string}`;
  cadCid: string;
}

/** Encode `{ cadVersion, cadHash, cadCid }` for `escrow.metadata`. Pure. */
export function encodeAnchor(a: CadAnchor): string {
  return JSON.stringify({
    cadVersion: a.cadVersion,
    cadHash: a.cadHash,
    cadCid: a.cadCid,
  });
}

/**
 * Decode `escrow.metadata`. Returns `null` when the payload is not a
 * v1.0 anchor (legacy escrows fall in this bucket — see H1 / §5c).
 */
export function decodeAnchor(metadata: string): CadAnchor | null {
  if (!metadata) return null;
  try {
    const p = JSON.parse(metadata);
    if (
      p &&
      typeof p === 'object' &&
      typeof p.cadVersion === 'string' &&
      typeof p.cadHash === 'string' &&
      p.cadHash.startsWith('0x') &&
      typeof p.cadCid === 'string' &&
      p.cadCid.length > 0
    ) {
      return { cadVersion: p.cadVersion, cadHash: p.cadHash, cadCid: p.cadCid };
    }
    return null;
  } catch {
    return null;
  }
}

export function isLegacyMetadata(metadata: string): boolean {
  return decodeAnchor(metadata) === null;
}
