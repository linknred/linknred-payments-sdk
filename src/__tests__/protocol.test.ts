// Protocol version discovery — LNR-RFC-0003 §8.
import { describe, it, expect } from 'vitest';
import { LinknRedClient } from '../client';
import { decodeAbiString } from '../resources/protocol';

function abiEncodeString(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
  return '0x' + (32).toString(16).padStart(64, '0') + bytes.length.toString(16).padStart(64, '0') + padded;
}

describe('client.protocol.version()', () => {
  it('decodes an ABI string return', () => {
    expect(decodeAbiString(abiEncodeString('4.4.0'))).toBe('4.4.0');
  });

  it('reads protocolVersion() on-chain and marks the source as chain', async () => {
    const calls: Array<{ to: string; data: string }> = [];
    const client = new LinknRedClient({
      apiKey: 'lr_test_x',
      fetch: async () => new Response('{}', { status: 200 }),
    });
    const res = await client.protocol.version({
      coreAddress: '0x0194000000000000000000000000000000000000',
      provider: {
        call: async (tx) => {
          calls.push(tx);
          return abiEncodeString('4.4.0');
        },
      },
    });
    expect(calls[0].data).toBe('0x2ae9c600');
    expect(res).toEqual({ version: '4.4.0', source: 'chain' });
  });

  it('falls back to the edge health probe when no provider is supplied', async () => {
    const client = new LinknRedClient({
      apiKey: 'lr_test_x',
      fetch: async () =>
        new Response(JSON.stringify({ ok: true, protocol_version: '4.4.0' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });
    const res = await client.protocol.version();
    expect(res).toEqual({ version: '4.4.0', source: 'edge' });
  });

  it('rejects an empty eth_call result', () => {
    expect(() => decodeAbiString('0x')).toThrow(/eth_call/);
  });
});
