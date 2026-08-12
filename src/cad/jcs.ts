/**
 * RFC 8785 (JSON Canonicalization Scheme) — minimal in-tree implementation.
 *
 * See `docs/protocol/cad-specification-v1.md` and RFC 0002 §3.7.
 * Returns UTF-8 bytes suitable for hashing and CID computation.
 *
 * @remarks
 * V8's `JSON.stringify` produces ECMA-262 §7.1.12.1 numeric strings for
 * finite Number values, which is what RFC 8785 §3.2.2 requires.
 * `undefined` object entries are omitted.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JCS: non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalizeJson(obj[k])).join(',') + '}';
  }
  throw new Error('JCS: unsupported type ' + typeof value);
}

/**
 * Canonicalize a CAD (or any JSON value) to its JCS byte representation.
 * Pure function — no I/O, no mutation.
 */
export function canonicalizeCad(cad: unknown): Uint8Array {
  const s = canonicalizeJson(cad);
  return new TextEncoder().encode(s);
}
