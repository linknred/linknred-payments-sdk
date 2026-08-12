// src/errors.ts
// Typed error hierarchy that mirrors the closed error contract exposed by the
// public API (see supabase/functions/_shared/apiError.ts).
// Every error carries the `request_id` returned by the server (or synthesized
// client-side for transport failures) so partners can correlate with logs.

export type LinknRedErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_error'
  | 'rate_limit_error'
  | 'idempotency_error'
  | 'api_error'
  | 'connection_error';

export interface LinknRedErrorPayload {
  type: LinknRedErrorType;
  code: string;
  message: string;
  param?: string;
  doc_url?: string;
  request_id: string;
  status: number;
}

export class LinknRedError extends Error {
  readonly type: LinknRedErrorType;
  readonly code: string;
  readonly param?: string;
  readonly docUrl?: string;
  readonly requestId: string;
  readonly status: number;

  constructor(p: LinknRedErrorPayload) {
    super(p.message);
    this.name = 'LinknRedError';
    this.type = p.type;
    this.code = p.code;
    this.param = p.param;
    this.docUrl = p.doc_url;
    this.requestId = p.request_id;
    this.status = p.status;
  }
}

export class LinknRedInvalidRequestError extends LinknRedError { constructor(p: LinknRedErrorPayload) { super(p); this.name = 'LinknRedInvalidRequestError'; } }
export class LinknRedAuthenticationError extends LinknRedError { constructor(p: LinknRedErrorPayload) { super(p); this.name = 'LinknRedAuthenticationError'; } }
export class LinknRedPermissionError extends LinknRedError { constructor(p: LinknRedErrorPayload) { super(p); this.name = 'LinknRedPermissionError'; } }
export class LinknRedRateLimitError extends LinknRedError { constructor(p: LinknRedErrorPayload) { super(p); this.name = 'LinknRedRateLimitError'; } }
export class LinknRedIdempotencyError extends LinknRedError { constructor(p: LinknRedErrorPayload) { super(p); this.name = 'LinknRedIdempotencyError'; } }
export class LinknRedAPIError extends LinknRedError { constructor(p: LinknRedErrorPayload) { super(p); this.name = 'LinknRedAPIError'; } }
export class LinknRedConnectionError extends LinknRedError { constructor(p: LinknRedErrorPayload) { super(p); this.name = 'LinknRedConnectionError'; } }
/**
 * Escrow row exists in the LinknRed database but the on-chain funding
 * transaction has not been observed yet by the reconciler. Callers should
 * poll `escrows.status()` (with backoff) until the row becomes `created`
 * before invoking lifecycle actions.
 */
export class LinknRedEscrowNotFundedError extends LinknRedError { constructor(p: LinknRedErrorPayload) { super(p); this.name = 'LinknRedEscrowNotFundedError'; } }

/** Build a typed error from a parsed server body. */
export function fromServerBody(
  status: number,
  body: unknown,
  fallbackRequestId: string,
): LinknRedError {
  const parsed = parseServerBody(body);
  const payload: LinknRedErrorPayload = {
    type: parsed?.type ?? 'api_error',
    code: parsed?.code ?? 'unknown_error',
    message: parsed?.message ?? `Request failed with status ${status}`,
    ...(parsed?.param ? { param: parsed.param } : {}),
    ...(parsed?.doc_url ? { doc_url: parsed.doc_url } : {}),
    request_id: parsed?.request_id ?? fallbackRequestId,
    status,
  };
  // Specialised subclass for the "not funded yet" 404 that api-escrow-* returns
  // when the DB row exists but the on-chain funding hasn't been observed.
  if (payload.code === 'ESCROW_NOT_FUNDED') return new LinknRedEscrowNotFundedError(payload);
  switch (payload.type) {
    case 'invalid_request_error': return new LinknRedInvalidRequestError(payload);
    case 'authentication_error':  return new LinknRedAuthenticationError(payload);
    case 'permission_error':      return new LinknRedPermissionError(payload);
    case 'rate_limit_error':      return new LinknRedRateLimitError(payload);
    case 'idempotency_error':     return new LinknRedIdempotencyError(payload);
    case 'api_error':             return new LinknRedAPIError(payload);
    default:                      return new LinknRedAPIError(payload);
  }
}

/** Build a transport / network error (no HTTP response reached us). */
export function connectionError(message: string, requestId: string, cause?: unknown): LinknRedConnectionError {
  const err = new LinknRedConnectionError({
    type: 'connection_error',
    code: 'connection_failed',
    message,
    request_id: requestId,
    status: 0,
  });
  if (cause !== undefined) (err as unknown as { cause: unknown }).cause = cause;
  return err;
}

function parseServerBody(body: unknown): {
  type?: LinknRedErrorType; code?: string; message?: string; param?: string; doc_url?: string; request_id?: string;
} | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const err = (b.error && typeof b.error === 'object') ? b.error as Record<string, unknown> : b;
  const type = typeof err.type === 'string' ? err.type as LinknRedErrorType : undefined;
  const code = typeof err.code === 'string'
    ? err.code
    : typeof err.error === 'string'
      ? err.error
      : undefined;
  const message = typeof err.message === 'string' ? err.message : undefined;
  const param = typeof err.param === 'string' ? err.param : undefined;
  const doc_url = typeof err.doc_url === 'string' ? err.doc_url : undefined;
  const request_id = typeof err.request_id === 'string' ? err.request_id : undefined;
  return { type, code, message, param, doc_url, request_id };
}
