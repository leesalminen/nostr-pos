import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nip59 } from 'nostr-tools';
import { createTerminalKeypair, hexToBytes } from '../security/keys';
import { outboxItemToTemplate } from '../nostr/outbox';
import type { OutboxItem, SwapRecoveryRecord, TerminalConfig } from './types';

const recoveries = new Map<string, SwapRecoveryRecord>();
const claimTxid = 'b'.repeat(64);
const oldClaimTxid = 'c'.repeat(64);
const newClaimTxid = 'd'.repeat(64);
const lockupTxid = 'e'.repeat(64);

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
      expires_at: 2,
      lockup_txid: lockupTxid,
      claim: {
        claim_tx_hex: 'claimhex',
        claim_txid: claimTxid,
        replaced_claim_txids: [oldClaimTxid],
        claim_prepared_at: 3,
        claim_broadcast_at: 4,
        claim_fee_sat_per_vbyte: 0.3,
        claim_rbf_count: 1
      }
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
      lockupTxid,
      claimTxHex: 'claimhex',
      claimTxid,
      replacedClaimTxids: [oldClaimTxid],
      claimPreparedAt: 3000,
      claimBroadcastAt: 4000,
      claimFeeSatPerVbyte: 0.3,
      claimRbfCount: 1,
      status: 'claimed'
    });
  });

  it('marks relay-prepared claim backups claimable after device recovery', async () => {
    const { syncTerminalRecoveryBackups } = await import('./recovery-sync');
    const item: OutboxItem = {
      id: 'recovery2',
      type: 'payment_backup',
      payload: {
        kind: 9381,
        tags: [['proto', 'nostr-pos', '0.2'], ['swap', 'swap2']],
        content: {
          sale_id: 'sale2',
          payment_attempt_id: 'attempt2',
          swap_id: 'swap2',
          encrypted_local_blob: 'ciphertext',
          expires_at: 5,
          claim: {
            claim_tx_hex: 'claimhex',
            claim_prepared_at: 4
          }
        }
      },
      createdAt: 1000,
      okFrom: []
    };
    const wrapped = nip59.wrapEvent(outboxItemToTemplate(item), hexToBytes(merchant.privateKey), terminal.publicKey);

    await expect(syncTerminalRecoveryBackups(config, async () => [wrapped])).resolves.toBe(1);
    expect(recoveries.get('swap2')).toMatchObject({
      claimTxHex: 'claimhex',
      claimPreparedAt: 4000,
      status: 'claimable'
    });
  });

  it('does not let older relay backups overwrite newer local claim state', async () => {
    const { syncTerminalRecoveryBackups } = await import('./recovery-sync');
    recoveries.set('swap3', {
      saleId: 'sale3',
      paymentAttemptId: 'attempt3',
      swapId: 'swap3',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 1000,
      relaySavedAt: 1000,
      okFrom: [],
      expiresAt: 10_000,
      claimTxHex: 'newclaimhex',
      claimTxid: newClaimTxid,
      claimPreparedAt: 5000,
      claimBroadcastAt: 6000,
      status: 'claimed'
    });
    const item: OutboxItem = {
      id: 'recovery3',
      type: 'payment_backup',
      payload: {
        kind: 9381,
        tags: [['proto', 'nostr-pos', '0.2'], ['swap', 'swap3']],
        content: {
          sale_id: 'sale3',
          payment_attempt_id: 'attempt3',
          swap_id: 'swap3',
          encrypted_local_blob: 'older-ciphertext',
          expires_at: 10,
          claim: {
            claim_tx_hex: 'oldclaimhex',
            claim_txid: oldClaimTxid,
            claim_prepared_at: 4,
            claim_broadcast_at: 5
          }
        }
      },
      createdAt: 1000,
      okFrom: []
    };
    const wrapped = nip59.wrapEvent(outboxItemToTemplate(item), hexToBytes(merchant.privateKey), terminal.publicKey);

    await expect(syncTerminalRecoveryBackups(config, async () => [wrapped])).resolves.toBe(1);
    expect(recoveries.get('swap3')).toMatchObject({
      claimTxHex: 'newclaimhex',
      claimTxid: newClaimTxid,
      claimPreparedAt: 5000,
      claimBroadcastAt: 6000,
      status: 'claimed'
    });
  });

  it('does not restore a claimed state when the relay claim txid equals the lockup txid', async () => {
    const { syncTerminalRecoveryBackups } = await import('./recovery-sync');
    const item: OutboxItem = {
      id: 'recovery-bad-txid',
      type: 'payment_backup',
      payload: {
        kind: 9381,
        tags: [['proto', 'nostr-pos', '0.2'], ['swap', 'swap-bad']],
        content: {
          sale_id: 'sale-bad',
          payment_attempt_id: 'attempt-bad',
          swap_id: 'swap-bad',
          encrypted_local_blob: 'ciphertext',
          expires_at: 5,
          lockup_txid: lockupTxid,
          claim: {
            claim_tx_hex: 'claimhex',
            claim_txid: lockupTxid,
            claim_prepared_at: 4,
            claim_broadcast_at: 5,
            claim_confirmed_at: 6
          }
        }
      },
      createdAt: 1000,
      okFrom: []
    };
    const wrapped = nip59.wrapEvent(outboxItemToTemplate(item), hexToBytes(merchant.privateKey), terminal.publicKey);

    await expect(syncTerminalRecoveryBackups(config, async () => [wrapped])).resolves.toBe(1);
    expect(recoveries.get('swap-bad')).toMatchObject({
      claimTxHex: 'claimhex',
      claimTxid: undefined,
      status: 'claimable'
    });
  });
});
