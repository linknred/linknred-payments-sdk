// src/resources/protocol.ts
// Protocol version discovery — LNR-RFC-0003 §8.
//
// `LinknRedProtocolCore.protocolVersion()` is the SOURCE OF TRUTH for the
// deployed protocol version (spec §9 invariant #12). This resource reads it
// straight from the chain when the caller supplies an eth_call-capable
// provider, and falls back to the Edge health probe (`/health`) otherwise.
//
// The on-chain path is intentionally dependency-free: it encodes the 4-byte
// selector and decodes the ABI string return by hand, so `ethers` stays an
// optional peer dependency.

import type { HttpClient } from '../http';

/** `protocolVersion()` selector — keccak256("protocolVersion()")[0:4]. */
const PROTOCOL_VERSION_SELECTOR = '0x2ae9c600';

/** Minimal eth_call surface. Satisfied by `ethers.JsonRpcProvider`, viem clients (via a shim), or any custom RPC wrapper. */
export interface EthCallLike {
  call(tx: { to: string; data: string }): Promise<string>;
}

export interface OnChainVersionParams {
  /** Address of the `LinknRedProtocolCore` proxy. */
  coreAddress: string;
  /** Provider used to perform the `eth_call`. */
  provider: EthCallLike;
}

export interface ProtocolVersionResult {
  /** SemVer string, e.g. `"4.4.0"`. */
  version: string;
  /** Where the value came from. `chain` is authoritative. */
  source: 'chain' | 'edge';
}

export class ProtocolResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Read the deployed Core version.
   *
   * - With `{ coreAddress, provider }`: reads `protocolVersion()` on-chain.
   *   This is the authoritative value.
   * - Without arguments: reads the Edge health probe, which reports the
   *   version the platform believes is deployed. Convenient, not authoritative.
   */
  async version(params?: OnChainVersionParams): Promise<ProtocolVersionResult> {
    if (params) {
      const raw = await params.provider.call({
        to: params.coreAddress,
        data: PROTOCOL_VERSION_SELECTOR,
      });
      return { version: decodeAbiString(raw), source: 'chain' };
    }
    const { data } = await this.http.request<{ protocol_version?: string }>({
      method: 'GET',
      path: '/functions/v1/health',
      maxRetries: 0,
    });
    return { version: String(data?.protocol_version ?? ''), source: 'edge' };
  }
}

/**
 * Decode a single ABI-encoded `string` return value (offset + length + bytes).
 * Exported for tests; integrators should not need it.
 */
export function decodeAbiString(hex: string): string {
  const body = (hex ?? '').replace(/^0x/, '');
  if (body.length < 128) {
    throw new Error('[linknred] protocolVersion(): unexpected empty or short eth_call result.');
  }
  const offset = Number(BigInt('0x' + body.slice(0, 64))) * 2;
  const length = Number(BigInt('0x' + body.slice(offset, offset + 64)));
  const dataHex = body.slice(offset + 64, offset + 64 + length * 2);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}
