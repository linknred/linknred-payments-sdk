// src/resources/gasless.ts
// Public wrapper over api-gasless-relay. The concrete payload shape for each
// action is defined by the on-chain forwarder — we keep it as `unknown` here
// so that the SDK does not couple to the current EIP-712 layout. Callers use
// the helper builders in `helpers/gasless.ts` (or their own signer) to
// produce the request object and pass it through verbatim.

import type { HttpClient } from '../http';
import type { Environment } from '../env';
import { LinknRedInvalidRequestError } from '../errors';

/** Canonical list of gasless actions accepted by `api-gasless-relay`. */
export const GASLESS_ACTIONS = [
  'create',
  'markShipped',
  'confirmDelivery',
  'openDispute',
  'withdrawResolved',
] as const;

export type GaslessAction = typeof GASLESS_ACTIONS[number];

const GASLESS_ACTION_SET = new Set<string>(GASLESS_ACTIONS);

export interface RelayRequest {
  action: GaslessAction;
  /** Any additional keys the specific action requires (request, signature, items, etc.). */
  [key: string]: unknown;
}

export interface RelayResponse {
  action: GaslessAction;
  /** Raw result from the internal gasless-relay function. Shape depends on the action. */
  result: unknown;
  requestMeta: { requestId: string; status: number; environment?: Environment };
}

export interface CallOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export class GaslessResource {
  constructor(private readonly http: HttpClient) {}

  async relay(body: RelayRequest, opts: CallOptions = {}): Promise<RelayResponse> {
    if (!body || typeof body !== 'object' || !GASLESS_ACTION_SET.has(String((body as { action?: unknown }).action))) {
      throw new LinknRedInvalidRequestError({
        type: 'invalid_request_error',
        code: 'invalid_action',
        message: `Unknown gasless action. Valid actions: ${GASLESS_ACTIONS.join(', ')}.`,
        param: 'action',
        doc_url: 'https://linknred.com/developers/docs/gasless#actions',
        request_id: '',
        status: 400,
      });
    }
    const res = await this.http.request<{ action: GaslessAction; result: unknown }>({
      method: 'POST',
      path: '/functions/v1/api-gasless-relay',
      body,
      idempotencyKey: opts.idempotencyKey,
      signal: opts.signal,
    });
    const env = res.headers.get('x-linknred-environment');
    return {
      action: res.data.action,
      result: res.data.result,
      requestMeta: {
        requestId: res.requestId,
        status: res.status,
        ...(env === 'test' || env === 'live' ? { environment: env } : {}),
      },
    };
  }
}
