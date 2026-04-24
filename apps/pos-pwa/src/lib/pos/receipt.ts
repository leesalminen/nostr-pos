import { getReceiptBySale, putReceipt } from '../db/repositories/ledger';
import type { Receipt } from './types';

export async function markReceiptPrinted(saleId: string, printedAt = Date.now()): Promise<Receipt | undefined> {
  const receipt = await getReceiptBySale(saleId);
  if (!receipt) return undefined;
  const updated = { ...receipt, printedAt };
  await putReceipt(updated);
  return updated;
}
