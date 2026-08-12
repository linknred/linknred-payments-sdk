// examples/03-gasless-relay.ts
// Relay an already-signed EIP-712 payload through the public gasless endpoint.
// Signing is out of scope for the SDK — use `helpers/gasless.ts` or your
// own signer to produce `request` and `signature`, then hand them to the SDK.
//
// $ export LINKNRED_API_KEY=lr_test_...
// $ npx tsx examples/03-gasless-relay.ts

import { LinknRedClient, LinknRedError } from '@linknred/payments';

async function main() {
  const client = new LinknRedClient({ apiKey: required('LINKNRED_API_KEY') });

  try {
    const res = await client.gasless.relay(
      {
        action: 'create',
        // request: <EIP-712 payload built with helpers/gasless.ts>,
        // signature: <0x...>,
        // items: [...],
      },
      { idempotencyKey: crypto.randomUUID() },
    );
    console.log('relay ok', res.action, res.result, 'request_id=', res.requestMeta.requestId);
  } catch (err) {
    if (err instanceof LinknRedError) {
      console.error(`[${err.type}/${err.code}] ${err.message} (request_id=${err.requestId})`);
      if (err.docUrl) console.error('docs:', err.docUrl);
      process.exit(1);
    }
    throw err;
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

main().catch((err) => { console.error(err); process.exit(1); });
