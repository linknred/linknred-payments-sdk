// src/env.ts
// Environment detection from an API key prefix.
//
// The SDK accepts every currently valid LinknRed API key format:
//   - `lk_sand_*`  → 'test'  (issued by the Developer Dashboard today)
//   - `lk_prod_*`  → 'live'  (issued by the Developer Dashboard today)
//   - `lr_test_*`  → 'test'
//   - `lr_live_*`  → 'live'
//   - `sk_test_*` / `pk_test_*` → 'test'
//   - `sk_live_*` / `pk_live_*` → 'live'
//
// The environment is always derived from the key so that a key rotation cannot
// land in the wrong environment by mistake.

export type Environment = 'test' | 'live';

const TEST_PREFIXES = ['lk_sand_', 'lr_test_', 'sk_test_', 'pk_test_'];
const LIVE_PREFIXES = ['lk_prod_', 'lr_live_', 'sk_live_', 'pk_live_'];

export function detectEnvironment(apiKey: string): Environment {
  const key = apiKey.trim();
  if (!key) {
    throw new Error(
      '[linknred] apiKey is empty. Pass a key issued from the LinknRed developer dashboard.',
    );
  }
  if (TEST_PREFIXES.some((p) => key.startsWith(p))) return 'test';
  if (LIVE_PREFIXES.some((p) => key.startsWith(p))) return 'live';
  throw new Error(
    `[linknred] Unrecognized API key prefix. Expected one of: ${[...TEST_PREFIXES, ...LIVE_PREFIXES].join(', ')}.`,
  );
}

/**
 * Returns the visible, safe-to-log prefix of the key.
 *
 * For dashboard-issued keys shaped `lk_<env>_<prefixId>_<secret>` this returns
 * exactly the value the backend persists in `api_keys.key_prefix`
 * (`lk_<env>_<prefixId>`), keeping SDK logs aligned with server-side audit,
 * authentication, and rotation records.
 *
 * For SDK-native formats (`lr_*`, `sk_*`, `pk_*`) it returns the leading 12
 * characters, which is enough entropy to identify the key without exposing it.
 */
export function keyPrefixFor(apiKey: string): string {
  const key = apiKey.trim();
  if (key.startsWith('lk_')) {
    // Backend format: lk_<env>_<prefixId>_<secret>. The persisted key_prefix
    // is the first three underscore-separated segments joined back together.
    const parts = key.split('_');
    if (parts.length >= 3) return parts.slice(0, 3).join('_');
  }
  return key.slice(0, 12);
}
