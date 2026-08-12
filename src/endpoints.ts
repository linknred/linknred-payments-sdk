// src/endpoints.ts
// Endpoint resolution strategy. The SDK does not hardcode a single base URL
// so that future evolutions — staging, regional deploys, enterprise/on-prem
// installations — can be plugged in without breaking the public API.
//
// Precedence in LinknRedClient:
//   1. explicit `baseUrl` (string)  — highest priority, always wins
//   2. explicit `endpoints` (EndpointResolver) — custom strategy
//   3. defaultEndpointResolver — the LinknRed-hosted defaults

import type { Environment } from './env';

export interface EndpointResolver {
  /** Return the absolute base URL (no trailing slash) for a given environment. */
  resolve(env: Environment): string;
}

const DEFAULTS: Record<Environment, string> = {
  test: 'https://api.sandbox.linknred.com',
  live: 'https://api.linknred.com',
};

export const defaultEndpointResolver: EndpointResolver = {
  resolve(env) {
    return DEFAULTS[env];
  },
};

/** Convenience factory for pinning both environments to fixed URLs. */
export function staticEndpointResolver(map: Partial<Record<Environment, string>>): EndpointResolver {
  return {
    resolve(env) {
      const url = map[env] ?? DEFAULTS[env];
      return stripTrailingSlash(url);
    },
  };
}

export function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
