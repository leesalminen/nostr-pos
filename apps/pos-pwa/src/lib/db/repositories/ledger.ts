import type { OutboxItem, PaymentAttempt, Receipt, Sale, SwapRecoveryRecord, TransactionRow } from '../../pos/types';
import { toPlainJson } from '../plain';
import { getDb } from '../schema';

export function normalizedRecoveryRecord(record: SwapRecoveryRecord): SwapRecoveryRecord {
  if (record.status !== 'claimed' || record.claimTxid || record.claimConfirmedAt) return record;
  return {
    ...record,
    status: record.claimTxHex ? 'claimable' : 'failed',
    claimNeedsFeeBump: false,
    claimLastError:
      record.claimLastError ??
      (record.claimTxHex
        ? 'Claim was marked without a Liquid transaction id. Retry claim broadcast.'
        : 'Claim was marked without a Liquid transaction id or prepared claim transaction.')
  };
}

export async function putSale(sale: Sale): Promise<void> {
  await (await getDb()).put('sales', toPlainJson(sale));
}

export async function putAttempt(attempt: PaymentAttempt): Promise<void> {
  await (await getDb()).put('payment_attempts', toPlainJson(attempt));
}

export async function putReceipt(receipt: Receipt): Promise<void> {
  await (await getDb()).put('receipts', toPlainJson(receipt));
}

export async function putRecovery(record: SwapRecoveryRecord): Promise<void> {
  await (await getDb()).put('swap_recovery_records', toPlainJson(record));
}

export async function putOutbox(item: OutboxItem): Promise<void> {
  await (await getDb()).put('outbox', toPlainJson(item));
}

export async function outboxItems(): Promise<OutboxItem[]> {
  return (await getDb()).getAll('outbox');
}

export async function getOutboxItem(id: string): Promise<OutboxItem | undefined> {
  return (await getDb()).get('outbox', id);
}

export async function recoveryRecords(): Promise<SwapRecoveryRecord[]> {
  const db = await getDb();
  const records = await db.getAll('swap_recovery_records');
  const normalized = records.map(normalizedRecoveryRecord);
  await Promise.all(
    normalized.map((record, index) =>
      record === records[index] ? Promise.resolve() : db.put('swap_recovery_records', toPlainJson(record))
    )
  );
  return normalized;
}

export async function getRecoveryBySwap(swapId: string): Promise<SwapRecoveryRecord | undefined> {
  const db = await getDb();
  const record = await db.get('swap_recovery_records', swapId);
  if (!record) return undefined;
  const normalized = normalizedRecoveryRecord(record);
  if (normalized !== record) await db.put('swap_recovery_records', toPlainJson(normalized));
  return normalized;
}

export async function openPaymentAttempts(): Promise<PaymentAttempt[]> {
  const attempts = await (await getDb()).getAll('payment_attempts');
  return attempts.filter((attempt) => !['settled', 'expired', 'failed'].includes(attempt.status));
}

export async function getSale(id: string): Promise<Sale | undefined> {
  return (await getDb()).get('sales', id);
}

export async function getAttempt(id: string): Promise<PaymentAttempt | undefined> {
  return (await getDb()).get('payment_attempts', id);
}

export async function getReceiptBySale(saleId: string): Promise<Receipt | undefined> {
  const receipts = await (await getDb()).getAllFromIndex('receipts', 'by-sale', saleId);
  return receipts[0];
}

export async function recentTransactions(limit = 50): Promise<TransactionRow[]> {
  const db = await getDb();
  const sales = await db.getAllFromIndex('sales', 'by-updated');
  const latest = sales.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  const rows = await Promise.all(
    latest.map(async (sale) => {
      const attempt = sale.activePaymentAttemptId
        ? await db.get('payment_attempts', sale.activePaymentAttemptId)
        : undefined;
      const receipt = await getReceiptBySale(sale.id);
      return { sale, attempt, receipt };
    })
  );
  return rows;
}
