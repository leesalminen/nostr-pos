import { describe, expect, it, vi } from 'vitest';
import type { Receipt } from './types';
import { markReceiptPrinted } from './receipt';

let receipt: Receipt | undefined;

vi.mock('../db/repositories/ledger', () => ({
  getReceiptBySale: vi.fn(async () => receipt),
  putReceipt: vi.fn(async (updated: Receipt) => {
    receipt = updated;
  })
}));

describe('receipt print tracking', () => {
  it('marks an existing receipt as printed', async () => {
    receipt = { id: 'receipt1', saleId: 'sale1', createdAt: 1000 };

    const updated = await markReceiptPrinted('sale1', 2000);

    expect(updated?.printedAt).toBe(2000);
    expect(receipt?.printedAt).toBe(2000);
  });

  it('ignores missing receipts', async () => {
    receipt = undefined;

    await expect(markReceiptPrinted('sale1', 2000)).resolves.toBeUndefined();
  });
});
