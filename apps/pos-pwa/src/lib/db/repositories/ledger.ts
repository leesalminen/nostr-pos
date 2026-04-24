import type { OutboxItem, PaymentAttempt, Receipt, Sale, SwapRecoveryRecord, TransactionRow } from '../../pos/types';
import { getDb } from '../schema';

export async function putSale(sale: Sale): Promise<void> {
  await (await getDb()).put('sales', sale);
}

export async function putAttempt(attempt: PaymentAttempt): Promise<void> {
  await (await getDb()).put('payment_attempts', attempt);
}

export async function putReceipt(receipt: Receipt): Promise<void> {
  await (await getDb()).put('receipts', receipt);
}

export async function putRecovery(record: SwapRecoveryRecord): Promise<void> {
  await (await getDb()).put('swap_recovery_records', record);
}

export async function putOutbox(item: OutboxItem): Promise<void> {
  await (await getDb()).put('outbox', item);
}

export async function outboxItems(): Promise<OutboxItem[]> {
  return (await getDb()).getAll('outbox');
}

export async function getOutboxItem(id: string): Promise<OutboxItem | undefined> {
  return (await getDb()).get('outbox', id);
}

export async function recoveryRecords(): Promise<SwapRecoveryRecord[]> {
  return (await getDb()).getAll('swap_recovery_records');
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
