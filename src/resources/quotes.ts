// src/resources/quotes.ts
// LinknRed Quotes — Decision D3 (authoritative FX).
//
// A Commerce Node MUST NOT compute, cache, freeze or "sanity-adjust" its own
// fiat → token rate. It asks LinknRed for a quote, and copies `quote.rate`
// verbatim into the CAD. That is what makes an escrow reconstructible years
// later by a third party holding only public data.

import type { HttpClient } from '../http';

export interface QuoteRateHop {
  from: string;
  to: string;
  value: string;
  source: string;
  sourceRef: string;
  observedAt: number;
}

/** Shape is identical to the CAD `rate` block — copy it as-is. */
export interface QuoteRate {
  value: string;
  pair: string;
  frozenAt: number;
  ttlSec: number;
  roundingMode: 'ROUND_HALF_UP' | 'ROUND_HALF_EVEN' | 'FLOOR' | 'CEIL';
  roundingDecimals: number;
  path: QuoteRateHop[];
}

export interface Quote {
  quote_id: string;
  issuer: 'linknred';
  commercial: { currency: string; amount: string };
  settlement: {
    token_address: string;
    chain_id: number;
    symbol: string;
    canonical_symbol: string;
    decimals: number;
    /** Integer amount in minimal units — this is what goes on-chain. */
    total_token: string;
    total_token_decimal: string;
  };
  rate: QuoteRate;
  expires_at: string;
  expired: boolean;
}

export interface CreateQuoteParams {
  /** Commercial layer: what the buyer actually agreed to pay, in fiat. */
  commercial: {
    currency: 'MXN' | 'USD' | 'EUR' | (string & {});
    /** Plain decimal STRING. Never a JS number — floats are not money. */
    amount: string;
  };
  /** Settlement layer: the token that will move on-chain. */
  settlement: {
    tokenAddress: string;
    chainId: number;
  };
  /** Requested freeze window in seconds (15–300). Server clamps out of range. */
  ttlSec?: number;
}

export interface IndicativeRate {
  binding: false;
  pair: string;
  value: string;
  path: QuoteRateHop[];
  rounding_mode: string;
  rounding_decimals: number;
  observed_at: number;
  notice: string;
}

export class QuotesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Issue an authoritative, server-frozen quote.
   *
   * The returned `rate` is the ONLY rate that may be anchored in a CAD, and
   * `settlement.total_token` is the ONLY amount that may be signed on-chain.
   */
  async create(params: CreateQuoteParams): Promise<Quote> {
    const { data } = await this.http.request<Quote>({
      method: 'POST',
      path: '/functions/v1/api-quotes',
      body: params,
    });
    return data;
  }

  /** Re-read an issued quote — use it to revalidate freshness before signing. */
  async retrieve(quoteId: string): Promise<Quote> {
    const { data } = await this.http.request<Quote>({
      method: 'GET',
      path: `/functions/v1/api-quotes?quote_id=${encodeURIComponent(quoteId)}`,
    });
    return data;
  }

  /**
   * Non-binding indicative rate for display purposes only (price tags, carts).
   * It carries no `quoteId` and no freeze, and MUST NOT be anchored in a CAD.
   *
   * Prefer the authoritative identity form — `indicative('MXN', { tokenAddress,
   * chainId })`. The `to: '<symbol>'` form is a display convenience: symbols
   * are deployment aliases (`USDTsc`) and are not a protocol identity.
   */
  async indicative(
    from: string,
    to: string | { tokenAddress: string; chainId: number },
  ): Promise<IndicativeRate> {
    const target =
      typeof to === 'string'
        ? `to=${encodeURIComponent(to)}`
        : `tokenAddress=${encodeURIComponent(to.tokenAddress)}&chainId=${encodeURIComponent(String(to.chainId))}`;
    const q = `from=${encodeURIComponent(from)}&${target}`;
    const { data } = await this.http.request<IndicativeRate>({
      method: 'GET',
      path: `/functions/v1/api-quotes?mode=indicative&${q}`,
    });
    return data;
  }


  /** True when the freeze window has elapsed. Re-quote instead of signing. */
  static isExpired(quote: Quote, skewSec = 0): boolean {
    return new Date(quote.expires_at).getTime() <= Date.now() + skewSec * 1000;
  }
}
