import { describe, expect, it } from 'vitest';
import { recoveryBackupsJson, transactionsCsv } from './export';

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
        },
        receipt: { id: 'receipt1', saleId: 'sale1', createdAt: 0, printedAt: 1000 }
      }
    ]);

    expect(csv).toContain('receipt_number,date,sale_id');
    expect(csv).toContain('"hello, counter"');
    expect(csv).toContain('1970-01-01T00:00:01.000Z');
  });
});

describe('recovery backup export', () => {
  it('exports encrypted recovery records with stable snake-case keys', () => {
    const json = recoveryBackupsJson(
      [
        {
          saleId: 'sale1',
          paymentAttemptId: 'attempt1',
          swapId: 'swap1',
          encryptedLocalBlob: 'ciphertext',
          localSavedAt: 0,
          relaySavedAt: 1000,
          okFrom: ['wss://one.example', 'wss://two.example'],
          expiresAt: 2000,
          status: 'pending'
        }
      ],
      new Date(3000)
    );

    expect(JSON.parse(json)).toEqual({
      version: 1,
      exported_at: '1970-01-01T00:00:03.000Z',
      record_count: 1,
      records: [
        {
          sale_id: 'sale1',
          payment_attempt_id: 'attempt1',
          swap_id: 'swap1',
          encrypted_local_blob: 'ciphertext',
          local_saved_at: '1970-01-01T00:00:00.000Z',
          relay_saved_at: '1970-01-01T00:00:01.000Z',
          ok_from: ['wss://one.example', 'wss://two.example'],
          expires_at: '1970-01-01T00:00:02.000Z',
          claim_tx_hex: null,
          claim_txid: null,
          claim_prepared_at: null,
          claim_last_tried_at: null,
          claim_broadcast_attempts: 0,
          claim_last_error: null,
          claim_fee_sat_per_vbyte: null,
          claim_rbf_count: 0,
          claim_broadcast_at: null,
          claim_confirmed_at: null,
          claim_needs_fee_bump: false,
          status: 'pending'
        }
      ]
    });
  });
});
