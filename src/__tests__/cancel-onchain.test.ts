import { describe, it, expect, vi } from 'vitest';
import {
  buildCancelEscrowTx,
  cancelEscrowWithSigner,
  CANCEL_ESCROW_SELECTOR,
} from '../onchain/cancelEscrow';
import { LinknRedInvalidRequestError } from '../errors';

const CONTRACT = '0x1de88fB78A91eBF25c95982d4Ade7390E702Ab34';

describe('buildCancelEscrowTx', () => {
  it('encodes escrowId=100 correctly', () => {
    const tx = buildCancelEscrowTx({ escrowId: 100, verifyingContract: CONTRACT });
    expect(tx.to).toBe(CONTRACT);
    expect(tx.value).toBe('0x0');
    expect(tx.data.startsWith(CANCEL_ESCROW_SELECTOR)).toBe(true);
    // 4-byte selector + 32-byte uint256 argument = 4 + 32 bytes = 8 + 64 hex chars + '0x'
    expect(tx.data.length).toBe(2 + 8 + 64);
    // 100 in hex = 64, right-padded in a 32-byte word
    expect(tx.data.endsWith('0000000000000000000000000000000000000000000000000000000000000064')).toBe(true);
  });

  it('accepts bigint and decimal string', () => {
    const a = buildCancelEscrowTx({ escrowId: 1n, verifyingContract: CONTRACT });
    const b = buildCancelEscrowTx({ escrowId: '1', verifyingContract: CONTRACT });
    expect(a.data).toBe(b.data);
  });

  it('rejects invalid verifyingContract', () => {
    expect(() => buildCancelEscrowTx({ escrowId: 1, verifyingContract: 'not-hex' } as never))
      .toThrow(LinknRedInvalidRequestError);
  });

  it('rejects negative escrowId', () => {
    expect(() => buildCancelEscrowTx({ escrowId: -1, verifyingContract: CONTRACT }))
      .toThrow(LinknRedInvalidRequestError);
  });

  it('rejects non-integer escrowId', () => {
    expect(() => buildCancelEscrowTx({ escrowId: 1.5, verifyingContract: CONTRACT }))
      .toThrow(LinknRedInvalidRequestError);
  });
});

describe('cancelEscrowWithSigner', () => {
  it('sends the tx through the signer and returns txHash', async () => {
    const wait = vi.fn().mockResolvedValue({ status: 1 });
    const sendTransaction = vi.fn().mockResolvedValue({ hash: '0xabc', wait });
    const res = await cancelEscrowWithSigner({
      escrowId: 100,
      verifyingContract: CONTRACT,
      signer: { sendTransaction },
    });
    expect(res.txHash).toBe('0xabc');
    expect(sendTransaction).toHaveBeenCalledWith(expect.objectContaining({ to: CONTRACT, value: '0x0' }));
    expect(wait).toHaveBeenCalled();
  });

  it('skips wait when waitForReceipt=false', async () => {
    const wait = vi.fn();
    const sendTransaction = vi.fn().mockResolvedValue({ hash: '0xdef', wait });
    await cancelEscrowWithSigner({
      escrowId: 1,
      verifyingContract: CONTRACT,
      signer: { sendTransaction },
      waitForReceipt: false,
    });
    expect(wait).not.toHaveBeenCalled();
  });

  it('throws when signer is invalid', async () => {
    await expect(
      cancelEscrowWithSigner({ escrowId: 1, verifyingContract: CONTRACT, signer: {} as never }),
    ).rejects.toThrow(LinknRedInvalidRequestError);
  });
});
