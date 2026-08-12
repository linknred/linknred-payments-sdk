// src/resources/health.ts
// Public liveness probe for LinknRed Edge Platform.

import type { HttpClient } from '../http';

export interface HealthPingResponse {
  ok: boolean;
  protocol_version: string;
  network: string;
  chain_id: number;
  timestamp: string;
}

export class HealthResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Public liveness probe. Does not require an API key.
   * Returns the LinknRed Edge Platform protocol version and network context.
   */
  async ping(): Promise<HealthPingResponse> {
    const { data } = await this.http.request<HealthPingResponse>({
      method: 'GET',
      path: '/functions/v1/health',
      maxRetries: 0,
    });
    return data;
  }
}
