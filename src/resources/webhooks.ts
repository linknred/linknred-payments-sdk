// src/resources/webhooks.ts
// Webhooks resource — mirrors the api-webhooks-* endpoints.
// The `app_id` is derived server-side from the API key, so it never appears
// in this surface.

import type { HttpClient } from '../http';
import type { Environment } from '../env';
import { LinknRedInvalidRequestError } from '../errors';

/**
 * Canonical list of subscribable webhook events (protocol spec §6.1).
 * `webhook.test` is intentionally excluded: it is a reserved payload type
 * emitted only by `client.webhooks.test()` as a signed ping, and is delivered
 * to the endpoint regardless of the events it is subscribed to.
 */
export const SUBSCRIBABLE_WEBHOOK_EVENTS = [
  'escrow.created',
  'escrow.shipped',
  'escrow.cancelled',
  'escrow.delivered',
  'escrow.released',
  'escrow.auto_released',
  'escrow.disputed',
  'escrow.dispute_resolved',
  'escrow.dispute_resolved_split',
  'escrow.refunded',
  'escrow.withdrawal_claimed',
] as const;

export type SubscribableWebhookEvent = typeof SUBSCRIBABLE_WEBHOOK_EVENTS[number];

const SUBSCRIBABLE_SET = new Set<string>(SUBSCRIBABLE_WEBHOOK_EVENTS);

export interface Webhook {
  id: string;
  app_id: string;
  url: string;
  description: string | null;
  events: string[];
  secret_prefix: string;
  rotation_secret_prefix?: string | null;
  rotation_expires_at?: string | null;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateWebhookParams {
  url: string;
  events: string[];
  description?: string;
}

export interface CreateWebhookResult {
  webhook: Webhook;
  /** Only returned at creation — store it, LinknRed cannot show it again. */
  signing_secret: string;
}

export interface UpdateWebhookParams {
  webhook_id: string;
  url?: string;
  events?: string[];
  description?: string;
  enabled?: boolean;
}

export interface RotateWebhookParams {
  webhook_id: string;
  /** Grace window in hours before the old secret expires. 1–168, default 24. */
  grace_hours?: number;
}

export interface RotateWebhookResult {
  webhook: Pick<Webhook, 'id' | 'url' | 'secret_prefix' | 'rotation_secret_prefix' | 'rotation_expires_at'>;
  signing_secret: string;
  rotation_expires_at: string;
  rotation_notice: string;
}

export interface TestWebhookResult {
  delivered: boolean;
  http_status: number | null;
  delivery_error?: string;
}

export interface RequestMeta {
  requestId: string;
  status: number;
  environment?: Environment;
}

export interface CallOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  async create(params: CreateWebhookParams, opts: CallOptions = {}): Promise<CreateWebhookResult & { requestMeta: RequestMeta }> {
    validateEvents(params.events);
    const res = await this.http.request<CreateWebhookResult>({
      method: 'POST',
      path: '/functions/v1/api-webhooks-create',
      body: params,
      idempotencyKey: opts.idempotencyKey,
      signal: opts.signal,
    });
    return { ...res.data, requestMeta: metaOf(res) };
  }

  async list(opts: CallOptions = {}): Promise<{ webhooks: Webhook[]; requestMeta: RequestMeta }> {
    const res = await this.http.request<{ webhooks: Webhook[] }>({
      method: 'GET',
      path: '/functions/v1/api-webhooks-list',
      signal: opts.signal,
    });
    return { webhooks: res.data.webhooks ?? [], requestMeta: metaOf(res) };
  }

  async update(params: UpdateWebhookParams, opts: CallOptions = {}): Promise<{ webhook: Webhook; requestMeta: RequestMeta }> {
    if (params.events) validateEvents(params.events);
    const res = await this.http.request<{ webhook: Webhook }>({
      method: 'POST',
      path: '/functions/v1/api-webhooks-update',
      body: params,
      idempotencyKey: opts.idempotencyKey,
      signal: opts.signal,
    });
    return { webhook: res.data.webhook, requestMeta: metaOf(res) };
  }

  async rotate(params: RotateWebhookParams, opts: CallOptions = {}): Promise<RotateWebhookResult & { requestMeta: RequestMeta }> {
    const res = await this.http.request<RotateWebhookResult>({
      method: 'POST',
      path: '/functions/v1/api-webhooks-rotate',
      body: params,
      idempotencyKey: opts.idempotencyKey,
      signal: opts.signal,
    });
    return { ...res.data, requestMeta: metaOf(res) };
  }

  async test(params: { webhook_id: string }, opts: CallOptions = {}): Promise<TestWebhookResult & { requestMeta: RequestMeta }> {
    const res = await this.http.request<TestWebhookResult>({
      method: 'POST',
      path: '/functions/v1/api-webhooks-test',
      body: params,
      idempotencyKey: opts.idempotencyKey,
      signal: opts.signal,
    });
    return { ...res.data, requestMeta: metaOf(res) };
  }

  async del(params: { webhook_id: string }, opts: CallOptions = {}): Promise<{ deleted: true; id: string; requestMeta: RequestMeta }> {
    const res = await this.http.request<{ deleted: true; id: string }>({
      method: 'POST',
      path: '/functions/v1/api-webhooks-delete',
      body: params,
      signal: opts.signal,
    });
    return { ...res.data, requestMeta: metaOf(res) };
  }
}

function validateEvents(events: string[]): void {
  if (!Array.isArray(events) || events.length === 0) {
    throw new LinknRedInvalidRequestError({
      type: 'invalid_request_error',
      code: 'invalid_event',
      message: '`events` must be a non-empty array of subscribable event types.',
      param: 'events',
      request_id: '',
      status: 400,
    });
  }
  for (const ev of events) {
    if (ev === 'webhook.test') {
      throw new LinknRedInvalidRequestError({
        type: 'invalid_request_error',
        code: 'invalid_event',
        message:
          '`webhook.test` is a reserved event and cannot be subscribed to. ' +
          'Use `client.webhooks.test()` to emit a signed ping to your endpoint.',
        param: 'events',
        doc_url: 'https://linknred.com/developers/docs/webhooks#reserved-events',
        request_id: '',
        status: 400,
      });
    }
    if (!SUBSCRIBABLE_SET.has(ev)) {
      throw new LinknRedInvalidRequestError({
        type: 'invalid_request_error',
        code: 'invalid_event',
        message: `Unknown event: ${ev}. Valid events: ${SUBSCRIBABLE_WEBHOOK_EVENTS.join(', ')}.`,
        param: 'events',
        doc_url: 'https://linknred.com/developers/docs/webhooks#events',
        request_id: '',
        status: 400,
      });
    }
  }
}

function metaOf(res: { status: number; requestId: string; headers: Headers }): RequestMeta {
  const env = res.headers.get('x-linknred-environment');
  return {
    requestId: res.requestId,
    status: res.status,
    ...(env === 'test' || env === 'live' ? { environment: env } : {}),
  };
}
