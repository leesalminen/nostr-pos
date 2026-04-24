import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nip59 } from 'nostr-tools';
import { createTerminalKeypair, hexToBytes } from '../security/keys';
import { outboxItemToTemplate } from '../nostr/outbox';
import type { OutboxItem, SwapRecoveryRecord, TerminalConfig } from './types';

const recoveries = new Map<string, SwapRecoveryRecord>();

vi.mock('../db/repositories/ledger', () => ({
  getRecoveryBySwap: vi.fn((swapId: string) => recoveries.get(swapId)),
  putRecovery: vi.fn((record: SwapRecoveryRecord) => recoveries.set(record.swapId, record))
}));

describe('terminal recovery backup sync', () => {
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
    syncServers: ['wss://one']
  };

  beforeEach(() => recoveries.clear());

  it('unwraps terminal-addressed recovery backups into IndexedDB records', async () => {
    const { syncTerminalRecoveryBackups } = await import('./recovery-sync');
    const payload = {
      sale_id: 'sale1',
      payment_attempt_id: 'attempt1',
      swap_id: 'swap1',
      encrypted_local_blob: 'ciphertext',
      expires_at: 2
    };
    const item: OutboxItem = {
      id: 'recovery1',
      type: 'payment_backup',
      payload: { kind: 9381, tags: [['proto', 'nostr-pos', '0.2'], ['swap', 'swap1']], content: payload },
      createdAt: 1000,
      okFrom: []
    };
    const wrapped = nip59.wrapEvent(outboxItemToTemplate(item), hexToBytes(merchant.privateKey), terminal.publicKey);

    await expect(syncTerminalRecoveryBackups(config, async () => [wrapped])).resolves.toBe(1);
    expect(recoveries.get('swap1')).toMatchObject({
      saleId: 'sale1',
      paymentAttemptId: 'attempt1',
      encryptedLocalBlob: 'ciphertext',
      expiresAt: 2000,
      status: 'pending'
    });
  });
});
