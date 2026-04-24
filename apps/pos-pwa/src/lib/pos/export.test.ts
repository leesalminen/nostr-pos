import { describe, expect, it } from 'vitest';
import { transactionsCsv } from './export';

describe('transaction CSV export', () => {
  it('exports rows with escaped notes', () => {
    const csv = transactionsCsv([
      {
        sale: {
          id: 'sale1',
          receiptNumber: 'R-1',
          posRef: 'pos',
          terminalId: 'term1',
          amountFiat: '8500',
          fiatCurrency: 'CRC',
          amountSat: 25000,
          note: 'hello, counter',
          status: 'receipt_ready',
          createdAt: 0,
          updatedAt: 0
        },
        attempt: {
          id: 'attempt1',
          saleId: 'sale1',
          method: 'liquid',
          status: 'settled',
          settlementTxid: 'txid',
          createdAt: 0,
          updatedAt: 0
        }
      }
    ]);

    expect(csv).toContain('receipt_number,date,sale_id');
    expect(csv).toContain('"hello, counter"');
  });
});
