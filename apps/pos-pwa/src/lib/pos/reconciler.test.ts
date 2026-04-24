import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentAttempt, Receipt, Sale, TerminalConfig } from './types';

const sales = new Map<string, Sale>();
const attempts = new Map<string, PaymentAttempt>();
const receipts = new Map<string, Receipt>();
const outbox: unknown[] = [];
let config: TerminalConfig | undefined;

vi.mock('../db/repositories/ledger', () => ({
  openPaymentAttempts: vi.fn(() => Array.from(attempts.values())),
  getSale: vi.fn((id: string) => sales.get(id)),
  getAttempt: vi.fn((id: string) => attempts.get(id)),
  getReceiptBySale: vi.fn((saleId: string) => Array.from(receipts.values()).find((receipt) => receipt.saleId === saleId)),
  putAttempt: vi.fn((attempt: PaymentAttempt) => attempts.set(attempt.id, attempt)),
  putReceipt: vi.fn((receipt: Receipt) => receipts.set(receipt.id, receipt)),
  putSale: vi.fn((sale: Sale) => sales.set(sale.id, sale)),
  putOutbox: vi.fn((item: unknown) => outbox.push(item))
}));

vi.mock('../db/repositories/terminal', () => ({
  getTerminalConfig: vi.fn(() => config)
}));

describe('startup reconciliation', () => {
  beforeEach(() => {
    sales.clear();
    attempts.clear();
    receipts.clear();
    outbox.length = 0;
    config = undefined;
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

  it('settles Liquid attempts detected by the configured backend', async () => {
    const { reconcileOpenPayments } = await import('./reconciler');
    config = {
      merchantName: 'Merchant',
      posName: 'Counter',
      currency: 'CRC',
      terminalId: 'term1',
      terminalPubkey: 'pub',
      pairingCode: 'ABCD-EFGH',
      maxInvoiceSat: 100000,
      syncServers: [],
      authorization: {
        liquid_backends: [{ type: 'esplora', url: 'https://liquid.example/api' }]
      }
    };
    sales.set('sale2', {
      id: 'sale2',
      receiptNumber: 'R-2',
      posRef: 'pos',
      terminalId: 'term1',
      amountFiat: '8500',
      fiatCurrency: 'CRC',
      amountSat: 25000,
      status: 'payment_ready',
      createdAt: 0,
      updatedAt: 0
    });
    attempts.set('attempt2', {
      id: 'attempt2',
      saleId: 'sale2',
      method: 'liquid',
      status: 'waiting',
      liquidAddress: 'tex1qpaid',
      createdAt: 0,
      updatedAt: 0,
      expiresAt: 100
    });

    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            txid: 'tx123',
            status: { confirmed: false },
            vout: [{ scriptpubkey_address: 'tex1qpaid', value: 25000 }]
          }
        ]),
        { status: 200 }
      )
    );

    await expect(reconcileOpenPayments({ now: 12, fetcher })).resolves.toBe(1);
    expect(fetcher).toHaveBeenCalledWith('https://liquid.example/api/address/tex1qpaid/txs');
    expect(attempts.get('attempt2')?.status).toBe('settled');
    expect(attempts.get('attempt2')?.settlementTxid).toBe('tx123');
    expect(sales.get('sale2')?.status).toBe('receipt_ready');
    expect(Array.from(receipts.values())).toHaveLength(1);
    expect(outbox).toHaveLength(2);
  });
});
