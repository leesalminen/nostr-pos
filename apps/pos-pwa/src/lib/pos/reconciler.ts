import { getAttempt, getSale, openPaymentAttempts, putAttempt, putOutbox, putSale } from '../db/repositories/ledger';
import { getTerminalConfig } from '../db/repositories/terminal';
import { fetchAddressTransactions, verifyAddressPayment } from '../liquid/esplora';
import { paymentStatusEvent } from '../nostr/events';
import type { PaymentAttempt, Sale } from './types';
import { settleAttempt } from './settlement';

export type ReconcileOptions = {
  now?: number;
  fetcher?: typeof fetch;
};

function saleStatusForAttempt(attempt: PaymentAttempt): Sale['status'] {
  if (attempt.status === 'expired') return 'expired';
  if (attempt.status === 'failed') return 'failed';
  if (attempt.status === 'settled') return 'receipt_ready';
  if (attempt.status === 'detected') return 'payment_detected';
  if (attempt.status === 'settling') return 'settling';
  if (attempt.status === 'needs_recovery') return 'needs_recovery';
  return 'payment_ready';
}

function normalizeOptions(input: number | ReconcileOptions | undefined): Required<Pick<ReconcileOptions, 'now'>> & ReconcileOptions {
  if (typeof input === 'number') return { now: input };
  return { now: input?.now ?? Date.now(), fetcher: input?.fetcher };
}

async function verifyLiquidAttempt(
  sale: Sale,
  attempt: PaymentAttempt,
  options: ReconcileOptions
): Promise<{ changed: boolean; terminal: true } | { changed: false; terminal: false }> {
  if (attempt.method !== 'liquid' || !attempt.liquidAddress) return { changed: false, terminal: false };
  const config = await getTerminalConfig();
  const backend = config?.authorization?.liquid_backends?.find((candidate) => candidate.type === 'esplora' && candidate.url);
  if (!backend) return { changed: false, terminal: false };

  try {
    const transactions = await fetchAddressTransactions(backend.url, attempt.liquidAddress, options.fetcher ?? fetch);
    const verification = verifyAddressPayment(transactions, attempt.liquidAddress, sale.amountSat);
    if (!verification.detected) return { changed: false, terminal: false };
    await settleAttempt({
      sale,
      attempt,
      txid: verification.txid ?? `liquid_${attempt.id}`,
      settledAt: options.now
    });
    return { changed: true, terminal: true };
  } catch {
    return { changed: false, terminal: false };
  }
}

export async function reconcileOpenPayments(input?: number | ReconcileOptions): Promise<number> {
  const options = normalizeOptions(input);
  const attempts = await openPaymentAttempts();
  let changed = 0;
  for (const attempt of attempts) {
    const sale = await getSale(attempt.saleId);
    if (!sale) continue;

    let nextAttempt = attempt;
    if (attempt.expiresAt && attempt.expiresAt <= options.now && attempt.status !== 'detected' && attempt.status !== 'settling') {
      nextAttempt = { ...attempt, status: 'expired', updatedAt: options.now };
    }

    if (nextAttempt !== attempt) {
      const nextSale = { ...sale, status: saleStatusForAttempt(nextAttempt), updatedAt: options.now };
      await putAttempt(nextAttempt);
      await putSale(nextSale);
      await putOutbox({
        id: `status_${nextAttempt.id}_${options.now}`,
        type: 'payment_status',
        payload: paymentStatusEvent(nextSale, nextAttempt),
        createdAt: options.now,
        okFrom: []
      });
      changed += 1;
      continue;
    }

    const verified = await verifyLiquidAttempt(sale, attempt, options);
    if (verified.terminal) {
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
