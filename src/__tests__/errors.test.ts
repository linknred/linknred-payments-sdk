// src/__tests__/errors.test.ts
import { describe, expect, it } from 'vitest';
import { fromServerBody, LinknRedEscrowNotFundedError } from '../errors';

describe('fromServerBody', () => {
  it('maps flat ESCROW_NOT_FUNDED responses into the typed escrow-not-funded error', () => {
    const err = fromServerBody(404, {
      error: 'ESCROW_NOT_FUNDED',
      message: 'escrow row exists but has not been funded on-chain yet (db_status=pending)',
      order_vendor_id: '364a2936-a705-4d67-94ac-322210e1f840',
      escrow_id: '98',
      db_status: 'pending',
    }, 'req_fallback');

    expect(err).toBeInstanceOf(LinknRedEscrowNotFundedError);
    expect(err.code).toBe('ESCROW_NOT_FUNDED');
    expect(err.status).toBe(404);
    expect(err.requestId).toBe('req_fallback');
  });
});