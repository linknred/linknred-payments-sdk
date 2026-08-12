// examples/05-vendor-integration-express.ts
//
// Generic Express webhook receiver for any integrator consuming LinknRed
// Payments. Verifies the signature, deduplicates by `event.id`, and dispatches
// each event type to a business-specific handler.
//
// The handlers here are intentionally empty — LinknRed does not know what your
// system should do when a payment is released or a dispute opens. Fill in the
// side-effects that make sense for your product.

import express from 'express';
import { constructEvent, LinknRedSignatureError, type LinknRedEvent } from '@linknred/payments';

const app = express();
const WEBHOOK_SECRET = process.env.LINKNRED_WEBHOOK_SECRET!;

// Replace with a real persistence layer (Postgres, Redis, etc.).
// `event.id` is stable — use it as the idempotency key on the receiver.
const seenEventIds = new Set<string>();
const alreadyProcessed = (id: string) => {
  if (seenEventIds.has(id)) return true;
  seenEventIds.add(id);
  return false;
};

app.post('/webhooks/linknred', express.raw({ type: '*/*' }), (req, res) => {
  let event: LinknRedEvent;
  try {
    event = constructEvent(
      req.body.toString('utf8'),
      req.header('linknred-signature') ?? '',
      WEBHOOK_SECRET,
    );
  } catch (err) {
    if (err instanceof LinknRedSignatureError) return res.status(400).send('invalid signature');
    console.error(err);
    return res.status(500).send('error');
  }

  // Idempotency guard — the delivery pipeline retries on non-2xx responses.
  if (alreadyProcessed(event.id)) return res.status(200).send('duplicate');

  try {
    switch (event.type) {
      case 'escrow.created':
        // Funds locked. Typically: mark local order as paid.
        break;
      case 'escrow.shipped':
        // Seller signed shipment. Typically: notify buyer, update tracking UI.
        break;
      case 'escrow.delivered':
      case 'escrow.released':
      case 'escrow.auto_released':
        // Funds settled to seller. Typically: close order, trigger invoicing.
        break;
      case 'escrow.cancelled':
      case 'escrow.refunded':
        // Funds returned to buyer. Typically: restock, notify buyer.
        break;
      case 'escrow.disputed':
        // Dispute opened. Typically: freeze fulfilment, surface in admin.
        break;
      case 'escrow.dispute_resolved':
      case 'escrow.dispute_resolved_split':
        // Verdict issued. Typically: update order state, expose withdraw UI on split.
        break;
      case 'escrow.withdrawal_claimed':
        // A party pulled their share of a split verdict.
        break;
    }
    res.status(200).send('ok');
  } catch (err) {
    console.error('handler failed', event.id, err);
    // Return 500 so the pipeline retries — handlers are idempotent above.
    res.status(500).send('handler error');
  }
});

app.listen(Number(process.env.PORT ?? 3000));
