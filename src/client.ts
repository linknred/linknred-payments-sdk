// src/client.ts
// LinknRedClient — pure constructor (no I/O), lazy whoami discovery, and a
// stable public surface. Resources are attached in later tasks (T2).

import { detectEnvironment, keyPrefixFor, type Environment } from './env';
import {
  defaultEndpointResolver, stripTrailingSlash, type EndpointResolver,
} from './endpoints';
import { HttpClient, type FetchLike } from './http';
import { WebhooksResource } from './resources/webhooks';
import { GaslessResource } from './resources/gasless';
import { EscrowsResource } from './resources/escrows';
import { HealthResource } from './resources/health';
import { QuotesResource } from './resources/quotes';
import { ProtocolResource } from './resources/protocol';

const SDK_VERSION = '0.4.0';
const DEFAULT_API_VERSION = '2026-07-04';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

export interface LinknRedClientOptions {
  /** Secret API key. Must start with `lr_test_` or `lr_live_`. */
  apiKey: string;
  /** Explicit override for the base URL. Wins over `endpoints`. */
  baseUrl?: string;
  /** Custom endpoint resolver — plug staging/regional/enterprise deployments here. */
  endpoints?: EndpointResolver;
  /** Per-request timeout in ms. Default: 30_000. */
  timeoutMs?: number;
  /** Max retry attempts on 429/5xx/network errors. Default: 2. */
  maxRetries?: number;
  /** Custom fetch implementation (Node <18, tests, Workers wrappers, etc.). */
  fetch?: FetchLike;
  /** Pin a specific API version string sent via `X-LinknRed-Version`. */
  apiVersion?: string;
  /** Optional label appended to the User-Agent for observability. */
  appInfo?: { name: string; version?: string; url?: string };
}

export interface WhoamiResponse {
  account_id: string;
  application_id: string;
  environment: Environment;
  scopes: string[];
  api_version: string;
  rate_limit_per_minute: number;
  key_prefix: string;
}

export class LinknRedClient {
  readonly environment: Environment;
  readonly baseUrl: string;
  readonly keyPrefix: string;
  /** @internal exposed for resources; do not use directly. */
  readonly http: HttpClient;

  readonly webhooks: WebhooksResource;
  readonly gasless: GaslessResource;
  readonly escrows: EscrowsResource;
  readonly health: HealthResource;
  /** Authoritative FX — Decision D3. The only sanctioned fiat → token source. */
  readonly quotes: QuotesResource;
  /** Deployed Core version — LNR-RFC-0003 §8. On-chain `protocolVersion()` is authoritative. */
  readonly protocol: ProtocolResource;

  private whoamiPromise: Promise<WhoamiResponse> | null = null;

  constructor(options: LinknRedClientOptions) {
    if (!options || typeof options !== 'object') {
      throw new Error('[linknred] LinknRedClient requires an options object.');
    }
    const { apiKey } = options;
    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      throw new Error('[linknred] `apiKey` is required.');
    }

    this.environment = detectEnvironment(apiKey);
    this.keyPrefix = keyPrefixFor(apiKey);
    this.baseUrl = resolveBaseUrl(this.environment, options);

    const fetchImpl = options.fetch ?? resolveGlobalFetch();
    this.http = new HttpClient({
      apiKey,
      baseUrl: this.baseUrl,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      fetchImpl,
      userAgent: buildUserAgent(options.appInfo),
      apiVersion: options.apiVersion ?? DEFAULT_API_VERSION,
    });

    this.webhooks = new WebhooksResource(this.http);
    this.gasless = new GaslessResource(this.http);
    this.escrows = new EscrowsResource(this.http, this.gasless);
    this.health = new HealthResource(this.http);
    this.quotes = new QuotesResource(this.http);
    this.protocol = new ProtocolResource(this.http);
  }

  /**
   * Discover the identity behind the API key. Lazy: the SDK never calls this
   * automatically from the constructor. The result is cached per client
   * instance; subsequent calls return the same promise.
   */
  whoami(): Promise<WhoamiResponse> {
    if (!this.whoamiPromise) {
      this.whoamiPromise = this.http
        .request<WhoamiResponse>({ method: 'GET', path: '/functions/v1/api-v1-whoami' })
        .then((r) => r.data)
        .catch((err) => {
          // Do not cache failures — the next call should retry.
          this.whoamiPromise = null;
          throw err;
        });
    }
    return this.whoamiPromise;
  }

  /** Reset the cached whoami result (e.g., after key rotation in-process). */
  clearWhoamiCache(): void {
    this.whoamiPromise = null;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function resolveBaseUrl(env: Environment, opts: LinknRedClientOptions): string {
  if (opts.baseUrl) return stripTrailingSlash(opts.baseUrl);
  const resolver = opts.endpoints ?? defaultEndpointResolver;
  return stripTrailingSlash(resolver.resolve(env));
}

function resolveGlobalFetch(): FetchLike {
  const f = (globalThis as { fetch?: FetchLike }).fetch;
  if (typeof f !== 'function') {
    throw new Error(
      '[linknred] global `fetch` is not available in this runtime. Pass `fetch` in LinknRedClient options.',
    );
  }
  return f.bind(globalThis);
}

function buildUserAgent(appInfo?: LinknRedClientOptions['appInfo']): string {
  const base = `linknred-payments/${SDK_VERSION}`;
  if (!appInfo?.name) return base;
  const app = appInfo.version ? `${appInfo.name}/${appInfo.version}` : appInfo.name;
  return appInfo.url ? `${base} ${app} (${appInfo.url})` : `${base} ${app}`;
}
