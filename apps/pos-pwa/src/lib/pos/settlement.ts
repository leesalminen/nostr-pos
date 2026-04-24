import { getReceiptBySale, putAttempt, putOutbox, putReceipt, putSale } from '../db/repositories/ledger';
import { paymentStatusEvent, receiptEvent } from '../nostr/events';
import { ulid } from '../util/ulid';
import type { PaymentAttempt, Receipt, Sale } from './types';

export async function settleAttempt(input: {
  sale: Sale;
  attempt: PaymentAttempt;
  txid: string;
  settledAt?: number;
}): Promise<Receipt> {
  const settledAt = input.settledAt ?? Date.now();
  const finalSale = { ...input.sale, status: 'receipt_ready' as const, updatedAt: settledAt };
  const finalAttempt = {
    ...input.attempt,
    status: 'settled' as const,
    settlementTxid: input.txid,
    updatedAt: settledAt
  };
  await putSale(finalSale);
  await putAttempt(finalAttempt);

  const existingReceipt = await getReceiptBySale(input.sale.id);
  const receipt = existingReceipt ?? { id: ulid(settledAt), saleId: input.sale.id, createdAt: settledAt };
  if (!existingReceipt) await putReceipt(receipt);

  await putOutbox({
    id: `status_${input.attempt.id}_${settledAt}`,
    type: 'payment_status',
    payload: paymentStatusEvent(finalSale, finalAttempt),
    createdAt: settledAt,
    okFrom: []
  });
  await putOutbox({
    id: `receipt_${input.sale.id}`,
    type: 'receipt',
    payload: receiptEvent(finalSale, finalAttempt),
    createdAt: settledAt,
    okFrom: []
  });

  return receipt;
}
