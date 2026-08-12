// examples/02-verify-webhook.ts
// Minimal Node HTTP server that verifies inbound LinknRed webhooks.
//
// $ export LINKNRED_WEBHOOK_SECRET=whsec_...
// $ npx tsx examples/02-verify-webhook.ts
//
// Then create a webhook pointing at `http://<your-host>/webhooks/linknred` and
// call `client.webhooks.test({ webhook_id })` — the server prints the parsed
// event or the signature failure reason.

import { createServer } from 'node:http';
import { constructEvent, LinknRedSignatureError } from '@linknred/payments';

const SECRET = required('LINKNRED_WEBHOOK_SECRET');
const PORT = Number(process.env.PORT ?? 4242);

createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhooks/linknred') {
    res.writeHead(404); res.end(); return;
  }
  const rawBody = await readBody(req);
  const header = req.headers['x-linknred-signature'];
  const signature = Array.isArray(header) ? header[0] : header;

  try {
    // IMPORTANT: pass the raw body string. Re-serialising a parsed object
    // will produce a different byte sequence and the signature will fail.
    const event = await constructEvent(rawBody, signature, SECRET);
    console.log('received', event.type, event.id ?? '(no id)');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ received: true }));
  } catch (err) {
    if (err instanceof LinknRedSignatureError) {
      console.warn('signature rejected:', err.message);
      res.writeHead(400); res.end('invalid signature'); return;
    }
    console.error(err);
    res.writeHead(500); res.end('internal');
  }
}).listen(PORT, () => console.log(`listening on :${PORT}/webhooks/linknred`));

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
