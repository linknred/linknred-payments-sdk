// src/cad/rate.ts
// Rate verification for CAD `rate` blocks — Decision D3.
//
// Complements `verifyCad` (which proves the *bytes* are authentic) by proving
// the *economics* are internally coherent: that the declared multi-hop path
// multiplies out to the declared rate, and that the settlement amount really
// is the commercial amount converted at that rate, truncated to the token
// precision.
//
// Fail-closed: any structural or arithmetic incoherence is an ERROR, not a
// warning. An escrow whose economics cannot be re-derived is not auditable.

export interface CadRateHop {
  from: string;
  to: string;
  value: string;
  source?: string;
  sourceRef?: string;
  observedAt?: number;
}

export interface CadRate {
  value: string;
  pair: string;
  frozenAt?: number;
  ttlSec?: number;
  roundingMode?: string;
  roundingDecimals?: number;
  path?: CadRateHop[];
}

export type RateErrorCode =
  | 'RATE_INVALID_FORMAT'
  | 'RATE_PATH_DISCONNECTED'
  | 'RATE_PATH_PRODUCT_MISMATCH'
  | 'RATE_ROUNDING_MODE_REQUIRED'
  | 'RATE_OBSERVED_AFTER_FREEZE'
  | 'RATE_TOTAL_MISMATCH';

export interface RateError {
  code: RateErrorCode;
  message: string;
  expected?: string;
  got?: string;
}

export interface VerifyRateResult {
  valid: boolean;
  errors: RateError[];
}

const SCALE = 18;
const SCALE_F = 10n ** BigInt(SCALE);
const DECIMAL_RE = /^\d+(\.\d+)?$/;
const VALID_ROUNDING = ['ROUND_HALF_UP', 'ROUND_HALF_EVEN', 'FLOOR', 'CEIL'];

function toScaled(value: string): bigint {
  const parts = value.split('.');
  const intPart = parts[0] ?? '0';
  const frac = ((parts[1] ?? '') + '0'.repeat(SCALE)).slice(0, SCALE);
  return BigInt(intPart) * SCALE_F + BigInt(frac || '0');
}

function mul(a: bigint, b: bigint): bigint {
  return (a * b) / SCALE_F;
}

function abs(a: bigint): bigint {
  return a < 0n ? -a : a;
}

/**
 * Verify the internal coherence of a CAD `rate` block, and — when the
 * commercial/settlement amounts are supplied — that the settlement amount is
 * exactly `floor(commercialAmount × rate × 10^decimals)`.
 *
 * @param rate  the CAD `rate` block
 * @param opts.commercialAmount plain decimal string (e.g. `"1499.00"`)
 * @param opts.totalToken       integer string in the token's minimal units
 * @param opts.decimals         settlement token decimals
 */
export function verifyCadRate(
  rate: CadRate,
  opts: { commercialAmount?: string; totalToken?: string; decimals?: number } = {},
): VerifyRateResult {
  const errors: RateError[] = [];

  if (!rate || typeof rate.value !== 'string' || !DECIMAL_RE.test(rate.value)) {
    return {
      valid: false,
      errors: [{
        code: 'RATE_INVALID_FORMAT',
        message: '`rate.value` must be a plain decimal string (no exponent, no JS number).',
        got: String(rate?.value),
      }],
    };
  }

  const roundingDecimals = rate.roundingDecimals ?? 12;
  const path = Array.isArray(rate.path) ? rate.path : [];

  if (path.length > 0) {
    // Structural: end-to-end connectivity against the declared pair.
    const pairParts = String(rate.pair ?? '').split('/');
    const base = pairParts[0];
    const quote = pairParts[1];
    const first = path[0]!;
    const last = path[path.length - 1]!;
    if (base && first.from !== base) {
      errors.push({
        code: 'RATE_PATH_DISCONNECTED',
        message: '`path[0].from` must equal the base of `rate.pair`.',
        expected: base,
        got: first.from,
      });
    }
    if (quote && last.to !== quote) {
      errors.push({
        code: 'RATE_PATH_DISCONNECTED',
        message: '`path[last].to` must equal the quote of `rate.pair`.',
        expected: quote,
        got: last.to,
      });
    }
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      if (a.to !== b.from) {
        errors.push({
          code: 'RATE_PATH_DISCONNECTED',
          message: `path[${i}].to must equal path[${i + 1}].from`,
          expected: a.to,
          got: b.from,
        });
      }
    }

    if (path.length > 1 && !VALID_ROUNDING.includes(String(rate.roundingMode))) {
      errors.push({
        code: 'RATE_ROUNDING_MODE_REQUIRED',
        message: '`roundingMode` is REQUIRED when the rate path has more than one hop.',
        got: String(rate.roundingMode),
      });
    }

    // Arithmetic: product(path) ≈ value within 10^-roundingDecimals.
    let malformed = false;
    let acc = SCALE_F;
    for (const hop of path) {
      if (typeof hop.value !== 'string' || !DECIMAL_RE.test(hop.value)) {
        malformed = true;
        errors.push({
          code: 'RATE_INVALID_FORMAT',
          message: `path hop ${hop.from}→${hop.to} has a non-decimal value.`,
          got: String(hop.value),
        });
        break;
      }
      acc = mul(acc, toScaled(hop.value));
    }
    if (!malformed) {
      const tolerance = SCALE_F / 10n ** BigInt(roundingDecimals);
      if (abs(acc - toScaled(rate.value)) > tolerance) {
        errors.push({
          code: 'RATE_PATH_PRODUCT_MISMATCH',
          message: 'The product of `path[]` does not reproduce `rate.value` within tolerance.',
          expected: rate.value,
          got: (Number(acc) / Number(SCALE_F)).toFixed(roundingDecimals),
        });
      }
    }

    if (typeof rate.frozenAt === 'number') {
      for (const hop of path) {
        if (typeof hop.observedAt === 'number' && hop.observedAt > rate.frozenAt) {
          errors.push({
            code: 'RATE_OBSERVED_AFTER_FREEZE',
            message: `path hop ${hop.from}→${hop.to} was observed after the rate was frozen.`,
            expected: `<= ${rate.frozenAt}`,
            got: String(hop.observedAt),
          });
        }
      }
    }
  }

  // Economic: re-derive the settlement amount (FLOOR to token precision).
  const { commercialAmount, totalToken, decimals } = opts;
  if (
    typeof commercialAmount === 'string' &&
    typeof totalToken === 'string' &&
    typeof decimals === 'number'
  ) {
    if (!DECIMAL_RE.test(commercialAmount) || !/^\d+$/.test(totalToken)) {
      errors.push({
        code: 'RATE_INVALID_FORMAT',
        message: '`commercialAmount` must be a decimal string and `totalToken` an integer string.',
      });
    } else {
      const product = mul(toScaled(commercialAmount), toScaled(rate.value));
      const expected = (product * 10n ** BigInt(decimals)) / SCALE_F; // floor
      if (expected.toString() !== totalToken) {
        errors.push({
          code: 'RATE_TOTAL_MISMATCH',
          message:
            'The settlement amount is not `floor(commercialAmount × rate × 10^decimals)`.',
          expected: expected.toString(),
          got: totalToken,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** True when the freeze window declared in the CAD has already elapsed. */
export function rateIsExpired(rate: CadRate, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (typeof rate.frozenAt !== 'number' || typeof rate.ttlSec !== 'number') return false;
  return nowSec > rate.frozenAt + rate.ttlSec;
}
