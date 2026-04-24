import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTerminalKeypair } from '../security/keys';
import { encryptContent } from '../nostr/encryption';
import { signEvent } from '../nostr/pool';
import type { PaymentAttempt, Receipt, Sale, TerminalConfig } from './types';

const sales = new Map<string, Sale>();
const attempts = new Map<string, PaymentAttempt>();
const receipts = new Map<string, Receipt>();

vi.mock('../db/repositories/ledger', () => ({
  getSale: vi.fn((id: string) => sales.get(id)),
  getAttempt: vi.fn((id: string) => attempts.get(id)),
  getReceiptBySale: vi.fn((saleId: string) => Array.from(receipts.values()).find((receipt) => receipt.saleId === saleId)),
  putAttempt: vi.fn((attempt: PaymentAttempt) => attempts.set(attempt.id, attempt)),
  putReceipt: vi.fn((receipt: Receipt) => receipts.set(receipt.id, receipt)),
  putSale: vi.fn((sale: Sale) => sales.set(sale.id, sale))
}));

describe('relay payment history merge', () => {
  const terminal = createTerminalKeypair();
  const merchant = createTerminalKeypair();
  const config: TerminalConfig = {
    merchantName: 'Merchant',
    posName: 'Counter',
    currency: 'CRC',
    terminalId: 'term1',
    terminalPubkey: terminal.publicKey,
    terminalPrivkeyEnc: terminal.privateKey,
    pairingCode: '4F7G-YJDP',
    activatedAt: 1000,
    maxInvoiceSat: 100000,
    syncServers: ['wss://one'],
    authorization: { merchant_recovery_pubkey: merchant.publicKey }
  };

  beforeEach(() => {
    sales.clear();
    attempts.clear();
    receipts.clear();
    sales.set('sale1', {
      id: 'sale1',
      receiptNumber: 'R-1',
      posRef: 'pos',
      terminalId: terminal.publicKey,
      amountFiat: '8500',
      fiatCurrency: 'CRC',
      amountSat: 25000,
      status: 'payment_ready',
      activePaymentAttemptId: 'attempt1',
      createdAt: 0,
      updatedAt: 0
    });
    attempts.set('attempt1', {
      id: 'attempt1',
      saleId: 'sale1',
      method: 'lightning_swap',
      status: 'waiting',
      createdAt: 0,
      updatedAt: 0
    });
  });

  it('decrypts and applies terminal-authored payment status events', async () => {
    const { mergeRelayPaymentHistory } = await import('./relay-history');
    const content = {
      sale_id: 'sale1',
      status: 'settled',
      payment: { boltz_swap_id: 'swap1', settlement_txid: 'tx1' }
    };
    const event = signEvent(
      {
        kind: 9382,
        tags: [
          ['proto', 'nostr-pos', '0.2'],
          ['sale', 'sale1'],
          ['terminal', terminal.publicKey]
        ],
        content: encryptContent(content, terminal.privateKey, merchant.publicKey),
        created_at: 100
      },
      terminal.privateKey
    );

    await expect(mergeRelayPaymentHistory(config, async () => [event])).resolves.toBe(1);
    expect(attempts.get('attempt1')).toMatchObject({
      status: 'settled',
      swapId: 'swap1',
      settlementTxid: 'tx1'
    });
    expect(sales.get('sale1')?.status).toBe('receipt_ready');
  });

  it('applies receipt events for known local sales', async () => {
    const { mergeRelayPaymentHistory } = await import('./relay-history');
    const event = signEvent(
      {
        kind: 9383,
        tags: [
          ['proto', 'nostr-pos', '0.2'],
          ['sale', 'sale1'],
          ['terminal', terminal.publicKey]
        ],
        content: encryptContent({ sale_id: 'sale1', receipt_id: 'R-1', created_at: 100 }, terminal.privateKey, merchant.publicKey),
        created_at: 100
      },
      terminal.privateKey
    );

    await expect(mergeRelayPaymentHistory(config, async () => [event])).resolves.toBe(1);
    expect(receipts.get('R-1')).toMatchObject({ saleId: 'sale1' });
    expect(sales.get('sale1')?.status).toBe('receipt_ready');
  });
});
