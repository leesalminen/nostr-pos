import type { Event } from 'nostr-tools';
import { getAttempt, getReceiptBySale, getSale, putAttempt, putReceipt, putSale } from '../db/repositories/ledger';
import { decryptContent } from '../nostr/encryption';
import { KINDS } from '../nostr/events';
import { isValidSignedEvent, querySignedEvents } from '../nostr/pool';
import { merchantRecoveryPubkey } from '../nostr/outbox';
import { ulid } from '../util/ulid';
import type { PaymentAttempt, PaymentStatus, SaleStatus, TerminalConfig } from './types';

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function plaintextContent(event: Event): Record<string, unknown> | undefined {
  try {
    return asObject(JSON.parse(event.content));
  } catch {
    return undefined;
  }
}

function decryptedContent(config: TerminalConfig, event: Event): Record<string, unknown> | undefined {
  if (!config.terminalPrivkeyEnc) return undefined;
  const candidates = new Set<string>();
  if (event.pubkey !== config.terminalPubkey) candidates.add(event.pubkey);
  const recoveryPubkey = merchantRecoveryPubkey(config);
  if (recoveryPubkey) candidates.add(recoveryPubkey);
  for (const pubkey of candidates) {
    try {
      return decryptContent<Record<string, unknown>>(event.content, config.terminalPrivkeyEnc, pubkey);
    } catch {
      // Try the next possible conversation key.
    }
  }
  return undefined;
}

function eventContent(config: TerminalConfig, event: Event): Record<string, unknown> | undefined {
  return plaintextContent(event) ?? decryptedContent(config, event);
}

function saleStatusFromPayment(status: PaymentStatus): SaleStatus {
  if (status === 'settled') return 'receipt_ready';
  if (status === 'detected') return 'payment_detected';
  if (status === 'settling') return 'settling';
  if (status === 'expired') return 'expired';
  if (status === 'failed') return 'failed';
  if (status === 'needs_recovery') return 'needs_recovery';
  return 'payment_ready';
}

function paymentStatus(value: unknown): PaymentStatus | undefined {
  return ['created', 'waiting', 'detected', 'settling', 'settled', 'expired', 'failed', 'needs_recovery'].includes(String(value))
    ? value as PaymentStatus
    : undefined;
}

export async function applyPaymentHistoryEvent(
  config: TerminalConfig,
  event: Event,
  now = Date.now()
): Promise<boolean> {
  if (!isValidSignedEvent(event)) return false;
  if (event.kind !== KINDS.paymentStatus && event.kind !== KINDS.receipt) return false;
  if (!event.tags.some((tag) => tag[0] === 'p' && tag[1] === config.terminalPubkey)) return false;
  const content = eventContent(config, event);
  const saleId = typeof content?.sale_id === 'string' ? content.sale_id : undefined;
  if (!saleId) return false;
  const sale = await getSale(saleId);
  if (!sale) return false;

  if (event.kind === KINDS.paymentStatus) {
    const status = paymentStatus(content?.status);
    if (!status || !sale.activePaymentAttemptId) return false;
    const attempt = await getAttempt(sale.activePaymentAttemptId);
    if (!attempt) return false;
    const payment = asObject(content?.payment);
    const nextAttempt: PaymentAttempt = {
      ...attempt,
      status,
      swapId: typeof payment?.boltz_swap_id === 'string' ? payment.boltz_swap_id : attempt.swapId,
      settlementTxid: typeof payment?.settlement_txid === 'string' ? payment.settlement_txid : attempt.settlementTxid,
      updatedAt: now
    };
    await putAttempt(nextAttempt);
    await putSale({ ...sale, status: saleStatusFromPayment(status), updatedAt: now });
    return true;
  }

  if (event.kind === KINDS.receipt) {
    const existing = await getReceiptBySale(saleId);
    if (!existing) {
      await putReceipt({
        id: typeof content?.receipt_id === 'string' ? content.receipt_id : ulid(now),
        saleId,
        createdAt: typeof content?.created_at === 'number' ? content.created_at * 1000 : now
      });
    }
    await putSale({ ...sale, status: 'receipt_ready', updatedAt: now });
    return true;
  }

  return false;
}

export async function mergePaymentHistory(
  config: TerminalConfig,
  fetchEvents = querySignedEvents
): Promise<number> {
  const events = await fetchEvents(config.syncServers, {
    kinds: [KINDS.paymentStatus, KINDS.receipt],
    '#p': [config.terminalPubkey],
    limit: 100
  });
  let changed = 0;
  for (const event of events.sort((a, b) => a.created_at - b.created_at)) {
    if (await applyPaymentHistoryEvent(config, event)) changed += 1;
  }
  return changed;
}
