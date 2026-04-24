import { getAttempt, getSale, openPaymentAttempts, putAttempt, putOutbox, putSale } from '../db/repositories/ledger';
import { getTerminalConfig } from '../db/repositories/terminal';
import { fetchAddressTransactions, verifyAddressPayment } from '../liquid/esplora';
import { paymentStatusEvent } from '../nostr/events';
import type { PaymentAttempt, Sale } from './types';
import { claimLiquidReverseSwap } from './claim-engine';
import { settleAttempt } from './settlement';
import { swapProviderForConfig } from './payment-state';
import type { SwapProvider, SwapStatus } from '../swaps/provider';
import { markSwapClaimable, markSwapRecoveryFinished } from './recovery-state';

export type ReconcileOptions = {
  now?: number;
  fetcher?: typeof fetch;
  swapProvider?: SwapProvider;
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
  return { now: input?.now ?? Date.now(), fetcher: input?.fetcher, swapProvider: input?.swapProvider };
}

async function verifyLiquidAttempt(
  sale: Sale,
  attempt: PaymentAttempt,
  options: ReconcileOptions
): Promise<{ changed: boolean; terminal: true } | { changed: false; terminal: false }> {
  if (!attempt.liquidAddress || !['created', 'waiting'].includes(attempt.status)) return { changed: false, terminal: false };
  const config = await getTerminalConfig();
  const backend = config?.authorization?.liquid_backends?.find((candidate) => candidate.type === 'esplora' && candidate.url);
  if (!backend) return { changed: false, terminal: false };

  try {
    const transactions = await fetchAddressTransactions(backend.url, attempt.liquidAddress, options.fetcher ?? fetch);
    const verification = verifyAddressPayment(transactions, attempt.liquidAddress, sale.amountSat, { minCreatedAt: sale.createdAt });
    if (!verification.detected) return { changed: false, terminal: false };
    await settleAttempt({
      sale,
      attempt: { ...attempt, method: 'liquid' },
      txid: verification.txid ?? `liquid_${attempt.id}`,
      settledAt: options.now
    });
    return { changed: true, terminal: true };
  } catch {
    return { changed: false, terminal: false };
  }
}

async function reconcileSwapAttempt(
  sale: Sale,
  attempt: PaymentAttempt,
  options: ReconcileOptions
): Promise<{ changed: boolean; terminal: boolean }> {
  if (attempt.method === 'liquid' || !attempt.swapId) return { changed: false, terminal: false };
  const config = await getTerminalConfig();
  if (!config) return { changed: false, terminal: false };
  let details;
  try {
    const provider = options.swapProvider ?? swapProviderForConfig(config);
    details = provider.getSwapStatusDetails
      ? await provider.getSwapStatusDetails(attempt.swapId)
      : { status: await provider.getSwapStatus(attempt.swapId) };
  } catch {
    return { changed: false, terminal: false };
  }
  if (details.status === 'transaction.mempool' || details.status === 'transaction.confirmed') {
    const claim = await claimLiquidReverseSwap(config, {
      swapId: attempt.swapId,
      lockupTxHex: details.transactionHex,
      lockupTxid: details.txid,
      fetcher: options.fetcher
    });
    if (claim.status === 'broadcast' && claim.txid) {
      return applySwapStatusUpdate(sale, attempt, 'transaction.claimed', { now: options.now, txid: claim.txid });
    }
  }
  return applySwapStatusUpdate(sale, attempt, details.status, { now: options.now, txid: details.txid });
}

export async function applySwapStatusUpdate(
  sale: Sale,
  attempt: PaymentAttempt,
  status: SwapStatus,
  options: { now?: number; txid?: string } = {}
): Promise<{ changed: boolean; terminal: boolean }> {
  const now = options.now ?? Date.now();
  if (status === 'transaction.claimed') {
    if (attempt.swapId) await markSwapRecoveryFinished({ swapId: attempt.swapId, claimTxid: options.txid });
    await settleAttempt({
      sale,
      attempt,
      txid: options.txid ?? `claim_${attempt.swapId ?? attempt.id}`,
      settledAt: now
    });
    return { changed: true, terminal: true };
  }

  const nextStatus =
    status === 'expired' || status === 'failed'
      ? status
      : status === 'invoice.paid' || status === 'transaction.mempool' || status === 'transaction.confirmed'
        ? 'detected'
        : undefined;
  if (!nextStatus || nextStatus === attempt.status) return { changed: false, terminal: false };
  if (attempt.swapId && (status === 'transaction.mempool' || status === 'transaction.confirmed')) {
    await markSwapClaimable({ swapId: attempt.swapId, claimTxid: options.txid });
  }
  const nextAttempt: PaymentAttempt = { ...attempt, status: nextStatus, updatedAt: now };
  const nextSale: Sale = { ...sale, status: saleStatusForAttempt(nextAttempt), updatedAt: now };
  await putAttempt(nextAttempt);
  await putSale(nextSale);
  await putOutbox({
    id: `status_${nextAttempt.id}_${now}`,
    type: 'payment_status',
    payload: paymentStatusEvent(nextSale, nextAttempt),
    createdAt: now,
    okFrom: []
  });
  return { changed: true, terminal: true };
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
      continue;
    }

    const swap = await reconcileSwapAttempt(sale, attempt, options);
    if (swap.terminal) {
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

export async function resumeSale(saleId: string): Promise<{ sale: Sale; attempt: PaymentAttempt } | undefined> {
  const sale = await getSale(saleId);
  if (!sale?.activePaymentAttemptId) return undefined;
  const attempt = await getAttempt(sale.activePaymentAttemptId);
  if (!attempt) return undefined;
  return { sale, attempt };
}
