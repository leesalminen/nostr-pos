import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentAttempt, Sale } from './types';

const sales = new Map<string, Sale>();
const attempts = new Map<string, PaymentAttempt>();
const outbox: unknown[] = [];

vi.mock('../db/repositories/ledger', () => ({
  openPaymentAttempts: vi.fn(() => Array.from(attempts.values())),
  getSale: vi.fn((id: string) => sales.get(id)),
  getAttempt: vi.fn((id: string) => attempts.get(id)),
  putAttempt: vi.fn((attempt: PaymentAttempt) => attempts.set(attempt.id, attempt)),
  putSale: vi.fn((sale: Sale) => sales.set(sale.id, sale)),
  putOutbox: vi.fn((item: unknown) => outbox.push(item))
}));

describe('startup reconciliation', () => {
  beforeEach(() => {
    sales.clear();
    attempts.clear();
    outbox.length = 0;
  });

  it('expires stale waiting attempts', async () => {
    const { reconcileOpenPayments } = await import('./reconciler');
    sales.set('sale1', {
      id: 'sale1',
      receiptNumber: 'R-1',
      posRef: 'pos',
      terminalId: 'term1',
      amountFiat: '8500',
      fiatCurrency: 'CRC',
      amountSat: 25000,
      status: 'payment_ready',
      createdAt: 0,
      updatedAt: 0
    });
    attempts.set('attempt1', {
      id: 'attempt1',
      saleId: 'sale1',
      method: 'lightning_swap',
      status: 'waiting',
      createdAt: 0,
      updatedAt: 0,
      expiresAt: 10
    });

    await expect(reconcileOpenPayments(11)).resolves.toBe(1);
    expect(attempts.get('attempt1')?.status).toBe('expired');
    expect(sales.get('sale1')?.status).toBe('expired');
    expect(outbox).toHaveLength(1);
  });
});
