// examples/01-quickstart.ts
// $ export LINKNRED_API_KEY=lr_test_...
// $ npx tsx examples/01-quickstart.ts
//
// Prints the identity behind the API key (account, application, environment,
// scopes) and lists the configured webhooks. Zero manual configuration —
// the SDK discovers everything from the key.

import { LinknRedClient } from '@linknred/payments';

async function main() {
  const client = new LinknRedClient({ apiKey: requireEnv('LINKNRED_API_KEY') });

  const me = await client.whoami();
  console.log('whoami:', {
    account: me.account_id,
    application: me.application_id,
    environment: me.environment,
    scopes: me.scopes,
    rateLimitPerMinute: me.rate_limit_per_minute,
  });

  const { webhooks, requestMeta } = await client.webhooks.list();
  console.log(`webhooks (${webhooks.length}) — request_id=${requestMeta.requestId}`);
  for (const wh of webhooks) console.log(' -', wh.id, wh.url, wh.events.join(','));
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

main().catch((err) => { console.error(err); process.exit(1); });
