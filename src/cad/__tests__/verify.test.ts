/**
 * Gate G8-#4 — `verifyCad` semantics:
 *   HASH > CID. A CID mismatch is a warning, not an error.
 *   A hash mismatch is fatal even if the CID matches.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { canonicalizeCad } from '../jcs';
import { hashCad } from '../hash';
import { cidCad } from '../cid';
import { verifyCad } from '../verify';
import type { CadAnchor } from '../anchor';

/**
 * Fixture resolution is location-independent on purpose: these tests must pass
 * in a clean clone of the public SDK repository, where the vectors ship beside
 * the test, and inside the monorepo, where they live in the conformance package.
 * Both trees resolve to the same public `sample-escrow-*` vectors, so the frozen
 * hashes asserted below are identical everywhere.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = [
  join(HERE, 'fixtures'),
  join(HERE, '../../../../../packages/cas-conformance/fixtures'),
].find((d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith('.cad.json')));

if (!FIXTURES) {
  throw new Error('CAD fixtures not found: expected ./fixtures or packages/cas-conformance/fixtures');
}

/** Vector labels, discovered rather than hardcoded. */
const [LABEL_A, LABEL_B] = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.cad.json'))
  .map((f) => f.replace(/\.cad\.json$/, ''))
  .sort();

function readFixture(label: string) {
  const bytes = readFileSync(join(FIXTURES!, `${label}.jcs.bin`));
  const hash = readFileSync(join(FIXTURES!, `${label}.hash.txt`), 'utf8').trim();
  // `.cid.txt` is the canonical production regime (dag-pb, Decision D1).
  const cid = readFileSync(join(FIXTURES!, `${label}.cid.txt`), 'utf8').trim();
  const cidRaw = readFileSync(join(FIXTURES!, `${label}.cid.raw.txt`), 'utf8').trim();
  return { bytes: new Uint8Array(bytes), hash: hash as `0x${string}`, cid, cidRaw };
}



describe('verifyCad — Gate G8-#4 (hash > CID identity policy)', () => {
  it('passes cleanly on the frozen fixture A', async () => {
    const f = readFixture(LABEL_A);
    const anchor: CadAnchor = { cadVersion: '1.0.0', cadHash: f.hash, cadCid: f.cid };
    const r = await verifyCad(f.bytes, anchor);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(0);
  });

  it('passes cleanly on the frozen fixture B', async () => {
    const f = readFixture(LABEL_B);
    const anchor: CadAnchor = { cadVersion: '1.0.0', cadHash: f.hash, cadCid: f.cid };
    const r = await verifyCad(f.bytes, anchor);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(0);
  });

  it('PASSES with CID_RETRIEVAL_MISMATCH warning when anchor.cadCid is wrong but hash matches', async () => {
    const f = readFixture(LABEL_A);
    const anchor: CadAnchor = {
      cadVersion: '1.0.0',
      cadHash: f.hash,
      cadCid: 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    };
    const r = await verifyCad(f.bytes, anchor);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]?.code).toBe('CID_RETRIEVAL_MISMATCH');
      expect(r.warnings[0]?.expected).toBe(anchor.cadCid);
      expect(r.warnings[0]?.got).toBe(f.cid);
    }
  });

  it('FAILS with HASH_MISMATCH even when anchor.cadCid matches (hash > CID)', async () => {
    const f = readFixture(LABEL_A);
    const anchor: CadAnchor = {
      cadVersion: '1.0.0',
      cadHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      cadCid: f.cid,
    };
    const r = await verifyCad(f.bytes, anchor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('HASH_MISMATCH');
  });

  it('FAILS with HASH_MISMATCH on a single byte flip in the retrieved bytes', async () => {
    const f = readFixture(LABEL_A);
    const anchor: CadAnchor = { cadVersion: '1.0.0', cadHash: f.hash, cadCid: f.cid };
    const tampered = new Uint8Array(f.bytes);
    tampered[10] = tampered[10]! ^ 0x01;
    const r = await verifyCad(tampered, anchor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('HASH_MISMATCH');
  });

  it('FAILS with VERSION_MISMATCH when anchor.cadVersion disagrees with cad.cadVersion', async () => {
    const f = readFixture(LABEL_A);
    const anchor: CadAnchor = { cadVersion: '9.9', cadHash: f.hash, cadCid: f.cid };
    const r = await verifyCad(f.bytes, anchor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VERSION_MISMATCH');
  });
});

describe('verifyCad — CAS regime awareness (Decision D1)', () => {
  it('passes with zero warnings on a raw-regime anchor when casRegime is declared', async () => {
    const f = readFixture(LABEL_A);
    const anchor: CadAnchor = { cadVersion: '1.0.0', cadHash: f.hash, cadCid: f.cidRaw };
    const r = await verifyCad(f.bytes, anchor, { casRegime: 'raw' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(0);
  });

  it('warns — and names the other regime — when a raw CID is verified under dag-pb', async () => {
    const f = readFixture(LABEL_A);
    const anchor: CadAnchor = { cadVersion: '1.0.0', cadHash: f.hash, cadCid: f.cidRaw };
    const r = await verifyCad(f.bytes, anchor);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]?.message).toContain("casRegime: 'raw'");
      expect(r.warnings[0]?.got).toBe(f.cid);
    }
  });
});

describe('CAD primitives — reproduce frozen fixtures', () => {
  it('hashCad(canonicalizeCad(cad)) reproduces the frozen hash of fixture A', async () => {
    const cad = JSON.parse(
      readFileSync(join(FIXTURES!, `${LABEL_A}.cad.json`), 'utf8'),
    );
    const bytes = canonicalizeCad(cad);
    expect(hashCad(bytes).toLowerCase()).toBe(
      readFileSync(join(FIXTURES!, `${LABEL_A}.hash.txt`), 'utf8').trim().toLowerCase(),
    );
  });

  it.each([LABEL_A, LABEL_B])(
    'cidCad(bytes) reproduces the canonical dag-pb CID of %s',
    async (label) => {
      const cad = JSON.parse(readFileSync(join(FIXTURES!, `${label}.cad.json`), 'utf8'));
      const bytes = canonicalizeCad(cad);
      expect(await cidCad(bytes)).toBe(
        readFileSync(join(FIXTURES!, `${label}.cid.dagpb.txt`), 'utf8').trim(),
      );
    },
  );

  it.each([LABEL_A, LABEL_B])(
    "cidCad(bytes, { regime: 'raw' }) reproduces the raw-regime CID of %s",
    async (label) => {
      const cad = JSON.parse(readFileSync(join(FIXTURES!, `${label}.cad.json`), 'utf8'));
      const bytes = canonicalizeCad(cad);
      expect(await cidCad(bytes, { regime: 'raw' })).toBe(
        readFileSync(join(FIXTURES!, `${label}.cid.raw.txt`), 'utf8').trim(),
      );
    },
  );
});

