import { describe, expect, it } from 'vitest';
import { pairingAnnouncementEvent, paymentStatusEvent, receiptEvent, saleCreatedEvent, swapRecoveryEvent } from './events';
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
  it('builds pairing announcements for activation', () => {
    const event = pairingAnnouncementEvent({
      terminalPubkey: 'a'.repeat(64),
      pairingCode: '4F7G-YJDP',
      createdAt: 100_000
    });

    expect(event.kind).toBe(30383);
    expect(event.tags).toContainEqual(['d', '4F7G-YJDP']);
    expect(event.tags).not.toContainEqual(['pairing', '4F7G-YJDP']);
    expect(event.tags).toContainEqual(['expiration', '400']);
  });

  it('builds sale/status/receipt payloads', () => {
    expect(saleCreatedEvent(sale).kind).toBe(9380);
    expect(saleCreatedEvent(sale).tags).toContainEqual(['a', 'pos']);
    expect(saleCreatedEvent(sale).tags).not.toContainEqual(['sale', 'sale1']);
    expect(paymentStatusEvent(sale, attempt).tags).toContainEqual(['a', 'pos']);
    expect(paymentStatusEvent(sale, attempt).tags).not.toContainEqual(['sale', 'sale1']);
    expect(paymentStatusEvent(sale, attempt).tags).not.toContainEqual(['status', 'settled']);
    expect(paymentStatusEvent(sale, attempt).content.status).toBe('settled');
    expect(receiptEvent(sale, attempt).tags).toContainEqual(['a', 'pos']);
    expect(receiptEvent(sale, attempt).tags).not.toContainEqual(['sale', 'sale1']);
    expect(receiptEvent(sale, attempt).content.receipt_id).toBe('R-1');
  });

  it('builds publishable swap recovery backup payloads', () => {
    const event = swapRecoveryEvent({
      saleId: 'sale1',
      paymentAttemptId: 'attempt1',
      swapId: 'swap1',
      terminalId: 'term1',
      encryptedLocalBlob: 'ciphertext',
      expiresAt: 60_000,
      recoveryPubkey: 'b'.repeat(64),
      claimTxHex: 'claimhex'
    });

    expect(event.kind).toBe(9381);
    expect(event.tags).toContainEqual(['swap', 'swap1']);
    expect(event.tags).toContainEqual(['p', 'b'.repeat(64)]);
    expect(event.content.encrypted_local_blob).toBe('ciphertext');
    expect(event.content.claim).toMatchObject({ claim_tx_hex: 'claimhex' });
  });
});
