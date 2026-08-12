// Public entrypoint for @linknred/payments.
// T2 scope: client + transport + errors + endpoint resolution + resources
// (webhooks, gasless) + webhook signature verification.

export { LinknRedClient } from './client';
export type { LinknRedClientOptions, WhoamiResponse } from './client';
export type { Environment } from './env';
export {
  defaultEndpointResolver,
  staticEndpointResolver,
  type EndpointResolver,
} from './endpoints';
export {
  LinknRedError,
  LinknRedInvalidRequestError,
  LinknRedAuthenticationError,
  LinknRedPermissionError,
  LinknRedRateLimitError,
  LinknRedIdempotencyError,
  LinknRedAPIError,
  LinknRedConnectionError,
  LinknRedEscrowNotFundedError,
  type LinknRedErrorType,
  type LinknRedErrorPayload,
} from './errors';

export {
  WebhooksResource,
  SUBSCRIBABLE_WEBHOOK_EVENTS,
  type SubscribableWebhookEvent,
  type Webhook,
  type CreateWebhookParams,
  type CreateWebhookResult,
  type UpdateWebhookParams,
  type RotateWebhookParams,
  type RotateWebhookResult,
  type TestWebhookResult,
} from './resources/webhooks';

export {
  EscrowsResource,
  type EscrowStatus,
  type EscrowSummary,
  type EscrowInspection,
  type EscrowMutationResult,
  type ShipParams,
  type ConfirmParams,
  type CancelParams,
  type DisputeParams,
  type WithdrawParams,
  type StatusQuery,
} from './resources/escrows';

export {
  GaslessResource,
  GASLESS_ACTIONS,
  type GaslessAction,
  type RelayRequest,
  type RelayResponse,
} from './resources/gasless';

export {
  ProtocolResource,
  decodeAbiString,
  type EthCallLike,
  type OnChainVersionParams,
  type ProtocolVersionResult,
} from './resources/protocol';

export {
  HealthResource,
  type HealthPingResponse,
} from './resources/health';

// Authoritative FX — Decision D3. Commerce Nodes MUST NOT implement their own
// fiat → token conversion; `client.quotes` is the single source of truth.
export {
  QuotesResource,
  type Quote,
  type QuoteRate,
  type QuoteRateHop,
  type CreateQuoteParams,
  type IndicativeRate,
} from './resources/quotes';

export {
  verifyCadRate,
  rateIsExpired,
  type CadRate,
  type CadRateHop,
  type RateError,
  type RateErrorCode,
  type VerifyRateResult,
} from './cad/rate';

export {
  constructEvent,
  LinknRedSignatureError,
  type ConstructEventOptions,
  type WebhookEvent,
} from './webhookSignature';

export {
  signLifecycleAction,
  signMarkShipped,
  signConfirmDelivery,
  signOpenDispute,
  signWithdrawResolved,
  LIFECYCLE_EIP712_TYPES,
  type LifecycleAction,
  type SignedLifecycleAction,
  type SignerLike,
  type EIP712Domain,
  type EIP712Types,
  type BuildLifecycleParams,
} from './signing/escrowActions';

export {
  signCreateEscrow,
  CREATE_ESCROW_EIP712_TYPES,
  type BuildCreateEscrowParams,
  type SignedCreateEscrow,
} from './signing/createEscrow';

export {
  computeItemsHash,
  canonicalizeItems,
  toPriceArrays,
  MAX_ITEMS,
  type EscrowItem,
} from './signing/items';

export {
  buildCancelEscrowTx,
  cancelEscrowWithSigner,
  CANCEL_ESCROW_SELECTOR,
  type CancelEscrowTx,
  type BuildCancelEscrowTxParams,
  type CancelEscrowWithSignerParams,
  type CancelEscrowResult,
  type TxSenderLike,
} from './onchain/cancelEscrow';

// CAD (Commercial Agreement Document) — RFC 0002 / CAD v1.0.
// Identity policy (Frozen v1.0, Gate G8-#4): cadHash is the sole
// cryptographic identity anchor; cadCid is retrieval-only. See
// `docs/architecture/edge-platform-v1-draft.md` §5b, §7.6.1, CF-cad-01a.
export {
  canonicalizeCad,
  canonicalizeJson,
  hashCad,
  cidCad,
  CAS_CHUNK_SIZE_BYTES,
  encodeAnchor,
  decodeAnchor,
  isLegacyMetadata,
  verifyCad,
  type CidRegime,
  type CidCadOptions,
  type CadAnchor,
  type VerifyCadOptions,
  type VerifyResult,
  type VerifyError,
  type VerifyErrorCode,
  type VerifyWarning,
  type VerifyWarningCode,
} from './cad';

