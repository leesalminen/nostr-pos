import { describe, expect, it } from 'vitest';
import { paymentStatusEvent, receiptEvent, saleCreatedEvent } from './events';
import type { PaymentAttempt, Sale } from '../pos/types';

const sale: Sale = {
  id: 'sale1',
  receiptNumber: 'R-1',
  posRef: 'pos',
  terminalId: 'term1',
  amountFiat: '8500',
  fiatCurrency: 'CRC',
  amountSat: 25000,
  status: 'payment_ready',
  createdAt: 1000,
  updatedAt: 1000
};

const attempt: PaymentAttempt = {
  id: 'attempt1',
  saleId: 'sale1',
  method: 'lightning_swap',
  status: 'settled',
  settlementTxid: 'txid',
  createdAt: 1000,
  updatedAt: 2000
};

describe('local protocol events', () => {
  it('builds sale/status/receipt payloads', () => {
    expect(saleCreatedEvent(sale).kind).toBe(9380);
    expect(paymentStatusEvent(sale, attempt).content.status).toBe('settled');
    expect(receiptEvent(sale, attempt).content.receipt_id).toBe('R-1');
  });
});
