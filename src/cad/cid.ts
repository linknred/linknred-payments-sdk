/**
 * `cadCid` — the *retrieval identifier* of a CAD. Not its identity.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  Decision D2 — `cidCad()` is NOT authoritative in production.        │
 * │                                                                      │
 * │  A production Commerce Node MUST anchor the CID returned by the CAS  │
 * │  upload operation (`POST /api/v0/add` → `Hash`). Locally computed    │
 * │  CIDs MUST NOT be used as the authoritative `cadCid` anchor when a   │
 * │  managed CAS is used. This function exists for verification, audit,  │
 * │  fixture reproduction, conformance runs, and historical regimes.     │
 * │  See `docs/protocol/cas-storage.md`.                                 │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * IMPORTANT — see §5b, §7.6.1 of `edge-platform-v1-draft.md` and CF-cad-01a:
 * `cadHash` is the sole cryptographic identity anchor. `cidCad` is exposed so
 * verifiers can independently reconstruct the reference CID for a retrieved
 * blob (§7.6.1 Axis A — portability guarantee).
 *
 * ## CID regimes
 *
 * The sha2-256 digest of the *content* is Protocol Contract. The CID *encoding*
 * around that digest is Integration Contract, and depends on how the CAS backend
 * stores the blob:
 *
 * - `'dag-pb'` — **canonical production regime (Decision D1)**. CIDv1, codec
 *   `dag-pb` (0x70), UnixFS file node, `raw-leaves=false`. This is what the
 *   managed LinknRed CAS (`cas.linknred.com`) returns from `POST /api/v0/add`.
 *   Producers anchor that returned value (D2); this function reproduces it
 *   locally for verification. See `docs/protocol/cas-storage.md`.
 * - `'raw'` — CIDv1, codec `raw` (0x55) directly over the JCS bytes. Historical
 *   regime used by the frozen golden fixtures (`bafkrei…`) before the managed
 *   CAS existed. Kept for backward verification only.
 *
 * The default is `'dag-pb'`. Callers that need the historical value must ask
 * for it explicitly. `dag-pb` is Integration Contract of `btfs-managed@1` — it
 * is revisable, not a permanent obligation of the Protocol Contract.
 *
 * Uses Web Crypto (`globalThis.crypto.subtle`), available in Node ≥ 18 and every
 * modern browser. Returns a Promise so no polyfill is required.
 */

export type CidRegime = 'dag-pb' | 'raw';

export interface CidCadOptions {
  /** CAS encoding regime. Default: `'dag-pb'` (canonical production regime). */
  regime?: CidRegime;
}

/** Chunk size used by the reference CAS backend. Blobs above it become multi-block DAGs. */
export const CAS_CHUNK_SIZE_BYTES = 262_144;

const B32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32Lower(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const subtle = (globalThis as any)?.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'cidCad: Web Crypto (crypto.subtle) is required. Use Node >= 18 or a modern browser.',
    );
  }
  const buf = await subtle.digest('SHA-256', bytes as unknown as ArrayBufferView);
  return new Uint8Array(buf);
}

/** Minimal protobuf base-128 varint encoder. */
function varint(n: number): Uint8Array {
  const out: number[] = [];
  let v = n;
  do {
    let byte = v & 0x7f;
    v = Math.floor(v / 128);
    if (v > 0) byte |= 0x80;
    out.push(byte);
  } while (v > 0);
  return Uint8Array.from(out);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Build the dag-pb block for a single-chunk UnixFS file, byte-for-byte identical
 * to what `go-btfs`/kubo produce with `--raw-leaves=false` for a blob that fits
 * in one chunk.
 *
 *   UnixFS = { Type: File(2) [field 1], Data: bytes [field 2], filesize [field 3] }
 *   PBNode = { Data: UnixFS [field 1] }   // no Links
 */
function dagPbFileNode(bytes: Uint8Array): Uint8Array {
  const size = varint(bytes.length);
  const unixfs = concat([
    Uint8Array.from([0x08, 0x02]), // field 1 (Type) = 2 (File)
    Uint8Array.from([0x12]), // field 2 (Data), wire type 2
    size,
    bytes,
    Uint8Array.from([0x18]), // field 3 (filesize), varint
    size,
  ]);
  return concat([Uint8Array.from([0x0a]), varint(unixfs.length), unixfs]);
}

function encodeCidV1(codec: number, digest: Uint8Array): string {
  // CIDv1: 0x01 (version) + codec + multihash(0x12 sha2-256, 0x20 length) + digest
  const cid = new Uint8Array(4 + digest.length);
  cid[0] = 0x01;
  cid[1] = codec;
  cid[2] = 0x12;
  cid[3] = 0x20;
  cid.set(digest, 4);
  return 'b' + base32Lower(cid);
}

/**
 * Compute `cadCid` (CIDv1, sha2-256, base32-lower multibase `b`) over already
 * canonicalized JCS bytes.
 *
 * @param bytes canonical JCS bytes of the CAD.
 * @param opts  `{ regime }` — `'dag-pb'` (default, canonical production regime)
 *              or `'raw'` (historical fixtures).
 */
export async function cidCad(
  bytes: Uint8Array,
  opts: CidCadOptions = {},
): Promise<string> {
  const regime: CidRegime = opts.regime ?? 'dag-pb';

  if (regime === 'raw') {
    return encodeCidV1(0x55, await sha256(bytes));
  }

  if (bytes.length > CAS_CHUNK_SIZE_BYTES) {
    throw new Error(
      `cidCad: dag-pb regime is only implemented for single-chunk blobs ` +
        `(<= ${CAS_CHUNK_SIZE_BYTES} bytes); got ${bytes.length}. ` +
        `CAD documents are far below this bound by design.`,
    );
  }

  return encodeCidV1(0x70, await sha256(dagPbFileNode(bytes)));
}
