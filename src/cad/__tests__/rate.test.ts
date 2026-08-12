import { describe, it, expect } from 'vitest';
import { verifyCadRate, rateIsExpired, type CadRate } from '../rate';

const EPF_RATE: CadRate = {
  value: '0.057000000000',
  pair: 'MXN/USDT',
  frozenAt: 1_736_899_220,
  ttlSec: 60,
  roundingMode: 'ROUND_HALF_UP',
  roundingDecimals: 12,
  path: [
    { from: 'MXN', to: 'USD', value: '0.058000000000', source: 'banxico_fix', sourceRef: 'SF43718', observedAt: 1_736_899_200 },
    { from: 'USD', to: 'USDT', value: '0.982758620690', source: 'coingecko', sourceRef: 'tether', observedAt: 1_736_899_215 },
  ],
};

describe('verifyCadRate — path coherence', () => {
  it('accepts a well-formed two-hop path', () => {
    expect(verifyCadRate(EPF_RATE).valid).toBe(true);
  });

  it('rejects a disconnected path', () => {
    const bad = { ...EPF_RATE, path: [{ ...EPF_RATE.path![0], to: 'EUR' }, EPF_RATE.path![1]] };
    const r = verifyCadRate(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'RATE_PATH_DISCONNECTED')).toBe(true);
  });

  it('rejects a path whose product does not reproduce the rate', () => {
    const r = verifyCadRate({ ...EPF_RATE, value: '0.100000000000' });
    expect(r.errors.some((e) => e.code === 'RATE_PATH_PRODUCT_MISMATCH')).toBe(true);
  });

  it('requires roundingMode on multi-hop paths', () => {
    const { roundingMode, ...rest } = EPF_RATE;
    const r = verifyCadRate(rest as CadRate);
    expect(r.errors.some((e) => e.code === 'RATE_ROUNDING_MODE_REQUIRED')).toBe(true);
  });

  it('rejects hops observed after the freeze', () => {
    const bad = { ...EPF_RATE, path: [{ ...EPF_RATE.path![0], observedAt: EPF_RATE.frozenAt! + 5 }, EPF_RATE.path![1]] };
    expect(verifyCadRate(bad).errors.some((e) => e.code === 'RATE_OBSERVED_AFTER_FREEZE')).toBe(true);
  });

  it('rejects a JS-number rate value', () => {
    const r = verifyCadRate({ ...EPF_RATE, value: 0.057 as unknown as string });
    expect(r.errors[0].code).toBe('RATE_INVALID_FORMAT');
  });
});

describe('verifyCadRate — settlement re-derivation', () => {
  it('re-derives the token total with FLOOR truncation (USDT, 6 decimals)', () => {
    // 1499.00 MXN × 0.0570 = 85.443 USDT → 85443000 minimal units
    const r = verifyCadRate(EPF_RATE, {
      commercialAmount: '1499.00',
      totalToken: '85443000',
      decimals: 6,
    });
    expect(r.valid).toBe(true);
  });

  it('truncates instead of rounding up', () => {
    const rate: CadRate = { value: '0.333333333333', pair: 'MXN/USDT' };
    // 1 × 0.333333333333 = 0.333333333333 → floor at 6 dec = 333333
    expect(verifyCadRate(rate, { commercialAmount: '1', totalToken: '333333', decimals: 6 }).valid).toBe(true);
    expect(verifyCadRate(rate, { commercialAmount: '1', totalToken: '333334', decimals: 6 }).valid).toBe(false);
  });

  it('flags a settlement amount that does not match the rate (D3 regression guard)', () => {
    // The EPF pilot bug: MXN treated as ~1:1 against USDTsc.
    const r = verifyCadRate(EPF_RATE, {
      commercialAmount: '1499.00',
      totalToken: '1499000000',
      decimals: 6,
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('RATE_TOTAL_MISMATCH');
  });
});

describe('rateIsExpired', () => {
  it('is false inside the freeze window and true after it', () => {
    expect(rateIsExpired(EPF_RATE, EPF_RATE.frozenAt! + 30)).toBe(false);
    expect(rateIsExpired(EPF_RATE, EPF_RATE.frozenAt! + 61)).toBe(true);
  });

  it('never expires when no freeze metadata is present', () => {
    expect(rateIsExpired({ value: '1.0', pair: 'USD/USDT' })).toBe(false);
  });
});
