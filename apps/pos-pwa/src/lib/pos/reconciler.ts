import { getAttempt, getSale, openPaymentAttempts, putAttempt, putOutbox, putSale } from '../db/repositories/ledger';
import { paymentStatusEvent } from '../nostr/events';
import type { PaymentAttempt, Sale } from './types';

function saleStatusForAttempt(attempt: PaymentAttempt): Sale['status'] {
  if (attempt.status === 'expired') return 'expired';
  if (attempt.status === 'failed') return 'failed';
  if (attempt.status === 'settled') return 'receipt_ready';
  if (attempt.status === 'detected') return 'payment_detected';
  if (attempt.status === 'settling') return 'settling';
  if (attempt.status === 'needs_recovery') return 'needs_recovery';
  return 'payment_ready';
}

export async function reconcileOpenPayments(now = Date.now()): Promise<number> {
  const attempts = await openPaymentAttempts();
  let changed = 0;
  for (const attempt of attempts) {
    const sale = await getSale(attempt.saleId);
    if (!sale) continue;

    let nextAttempt = attempt;
    if (attempt.expiresAt && attempt.expiresAt <= now && attempt.status !== 'detected' && attempt.status !== 'settling') {
      nextAttempt = { ...attempt, status: 'expired', updatedAt: now };
    }

    if (nextAttempt !== attempt) {
      const nextSale = { ...sale, status: saleStatusForAttempt(nextAttempt), updatedAt: now };
      await putAttempt(nextAttempt);
      await putSale(nextSale);
      await putOutbox({
        id: `status_${nextAttempt.id}_${now}`,
        type: 'payment_status',
        payload: paymentStatusEvent(nextSale, nextAttempt),
        createdAt: now,
        okFrom: []
      });
      changed += 1;
    }
  }
  return changed;
}

export async function resumeAttempt(attemptId: string): Promise<{ sale: Sale; attempt: PaymentAttempt } | undefined> {
  const attempt = await getAttempt(attemptId);
  if (!attempt) return undefined;
  const sale = await getSale(attempt.saleId);
  if (!sale) return undefined;
  return { sale, attempt };
}
