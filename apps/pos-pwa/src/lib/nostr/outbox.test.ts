import { afterEach, describe, expect, it, vi } from 'vitest';
import { nip59, type Event } from 'nostr-tools';
import { createTerminalKeypair, hexToBytes } from '../security/keys';
import type { OutboxItem, TerminalConfig } from '../pos/types';
import { merchantRecoveryPubkey, outboxItemToTemplate, publishOutboxItem, recoveryGiftWrapEvents } from './outbox';
import { decryptContent } from './encryption';

const saved: OutboxItem[] = [];

vi.mock('../db/repositories/ledger', () => ({
  putOutbox: vi.fn((item: OutboxItem) => saved.push(item)),
  outboxItems: vi.fn(() => []),
  getOutboxItem: vi.fn()
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

function privateItem(id: string, type: OutboxItem['type'], kind: number, tag: string, content: Record<string, unknown>): OutboxItem {
  return {
    id,
    type,
    payload: { kind, tags: [[tag, String(content[tag === 'sale' ? 'sale_id' : 'swap_id'])]], content },
    createdAt: 1000,
    okFrom: []
  };
}

describe('signed outbox publisher', () => {
  it('converts local protocol payloads to event templates', () => {
    const item: OutboxItem = {
      id: 'sale1',
      type: 'sale_created',
      payload: { kind: 9380, tags: [['sale', 'sale1']], content: { sale_id: 'sale1' } },
      createdAt: 1000,
      okFrom: []
    };

    expect(outboxItemToTemplate(item)).toEqual({
      kind: 9380,
      tags: [['sale', 'sale1']],
      content: '{"sale_id":"sale1"}',
      created_at: 1
    });
  });

  it('detects merchant recovery keys from authorization payloads', () => {
    expect(
      merchantRecoveryPubkey({
        merchantName: 'Seguras Butcher',
        posName: 'Counter 1',
        currency: 'CRC',
        terminalId: 'term1',
        terminalPubkey: 'a'.repeat(64),
        pairingCode: 'TEST-TEST',
        maxInvoiceSat: 100000,
        syncServers: [],
        authorization: { merchant_recovery_pubkey: 'b'.repeat(64) }
      })
    ).toBe('b'.repeat(64));
  });

  it('signs and records relay OKs', async () => {
    saved.length = 0;
    const keys = createTerminalKeypair();
    const config: TerminalConfig = {
      merchantName: 'Seguras Butcher',
      posName: 'Counter 1',
      currency: 'CRC',
      terminalId: keys.publicKey.slice(-8),
      terminalPubkey: keys.publicKey,
      terminalPrivkeyEnc: keys.privateKey,
      pairingCode: 'TEST-TEST',
      maxInvoiceSat: 100000,
      syncServers: ['wss://one', 'wss://two']
    };
    const item: OutboxItem = {
      id: 'status1',
      type: 'payment_status',
      payload: { kind: 9382, tags: [['sale', 'sale1']], content: { sale_id: 'sale1' } },
      createdAt: 1000,
      okFrom: []
    };
    const publish = vi.fn(async (_relays: string[], event: Event) => [
      { relay: 'wss://one', ok: event.pubkey === keys.publicKey },
      { relay: 'wss://two', ok: false, message: 'offline' }
    ]);

    const report = await publishOutboxItem(config, item, publish);

    expect(report.okCount).toBe(1);
    expect(saved.at(-1)?.okFrom).toEqual(['wss://one']);
    expect(saved.at(-1)?.attempts).toBe(1);
  });

  it('refuses plaintext private payment records in production', async () => {
    vi.stubEnv('PROD', true);
    const keys = createTerminalKeypair();
    const config: TerminalConfig = {
      merchantName: 'Seguras Butcher',
      posName: 'Counter 1',
      currency: 'CRC',
      terminalId: keys.publicKey.slice(-8),
      terminalPubkey: keys.publicKey,
      terminalPrivkeyEnc: keys.privateKey,
      pairingCode: 'TEST-TEST',
      maxInvoiceSat: 100000,
      syncServers: ['wss://one']
    };
    const privateItems: OutboxItem[] = [
      privateItem('sale1', 'sale_created', 9380, 'sale', { sale_id: 'sale1' }),
      privateItem('status1', 'payment_status', 9382, 'sale', { sale_id: 'sale1' }),
      privateItem('receipt1', 'receipt', 9383, 'sale', { sale_id: 'sale1' }),
      privateItem('backup1', 'payment_backup', 9381, 'swap', { swap_id: 'swap1' })
    ];

    for (const item of privateItems) {
      await expect(publishOutboxItem(config, item, vi.fn())).rejects.toThrow(
        'Merchant recovery key is required'
      );
    }
  });

  it('encrypts private sale, status, and receipt records to the merchant recovery key', async () => {
    vi.stubEnv('PROD', true);
    const terminal = createTerminalKeypair();
    const merchant = createTerminalKeypair();
    const config: TerminalConfig = {
      merchantName: 'Seguras Butcher',
      posName: 'Counter 1',
      currency: 'CRC',
      terminalId: terminal.publicKey.slice(-8),
      terminalPubkey: terminal.publicKey,
      terminalPrivkeyEnc: terminal.privateKey,
      pairingCode: 'TEST-TEST',
      maxInvoiceSat: 100000,
      syncServers: ['wss://one'],
      authorization: { merchant_recovery_pubkey: merchant.publicKey }
    };
    const privateItems: OutboxItem[] = [
      privateItem('sale1', 'sale_created', 9380, 'sale', { sale_id: 'sale1' }),
      privateItem('status1', 'payment_status', 9382, 'sale', { sale_id: 'sale1' }),
      privateItem('receipt1', 'receipt', 9383, 'sale', { sale_id: 'sale1' })
    ];

    for (const item of privateItems) {
      const publish = vi.fn(async (_relays: string[], event: Event) => {
        expect(event.content).not.toContain('sale1');
        expect(decryptContent(event.content, merchant.privateKey, terminal.publicKey)).toEqual({ sale_id: 'sale1' });
        return [{ relay: 'wss://one', ok: true }];
      });

      await expect(publishOutboxItem(config, item, publish)).resolves.toMatchObject({ okCount: 1 });
    }
  });

  it('gift-wraps recovery backups to merchant and terminal recipients', async () => {
    const terminal = createTerminalKeypair();
    const merchant = createTerminalKeypair();
    const item: OutboxItem = {
      id: 'recovery1',
      type: 'payment_backup',
      payload: { kind: 9381, tags: [['swap', 'swap1']], content: { swap_id: 'swap1' } },
      createdAt: 1000,
      okFrom: []
    };
    const template = outboxItemToTemplate(item);

    const wraps = recoveryGiftWrapEvents(template, terminal.privateKey, [merchant.publicKey, terminal.publicKey]);

    expect(wraps).toHaveLength(2);
    expect(wraps.every((wrap) => wrap.kind === 1059)).toBe(true);
    expect(wraps[0].tags).toContainEqual(['p', merchant.publicKey]);
    expect(wraps[1].tags).toContainEqual(['p', terminal.publicKey]);
    expect(nip59.unwrapEvent(wraps[0], hexToBytes(merchant.privateKey))).toMatchObject({
      kind: 9381,
      content: '{"swap_id":"swap1"}'
    });
    expect(nip59.unwrapEvent(wraps[1], hexToBytes(terminal.privateKey))).toMatchObject({
      kind: 9381,
      content: '{"swap_id":"swap1"}'
    });
  });

  it('requires each relay to accept every recovery wrap before counting OK', async () => {
    saved.length = 0;
    const terminal = createTerminalKeypair();
    const merchant = createTerminalKeypair();
    const config: TerminalConfig = {
      merchantName: 'Seguras Butcher',
      posName: 'Counter 1',
      currency: 'CRC',
      terminalId: terminal.publicKey.slice(-8),
      terminalPubkey: terminal.publicKey,
      terminalPrivkeyEnc: terminal.privateKey,
      pairingCode: 'TEST-TEST',
      maxInvoiceSat: 100000,
      syncServers: ['wss://one', 'wss://two'],
      authorization: { merchant_recovery_pubkey: merchant.publicKey }
    };
    const item: OutboxItem = {
      id: 'recovery1',
      type: 'payment_backup',
      payload: { kind: 9381, tags: [['swap', 'swap1']], content: { swap_id: 'swap1' } },
      createdAt: 1000,
      okFrom: []
    };
    let call = 0;
    const publish = vi.fn(async (_relays: string[], event: Event) => {
      expect(event.kind).toBe(1059);
      call += 1;
      return call === 1
        ? [
            { relay: 'wss://one', ok: true },
            { relay: 'wss://two', ok: true }
          ]
        : [
            { relay: 'wss://one', ok: true },
            { relay: 'wss://two', ok: false, message: 'offline' }
          ];
    });

    const report = await publishOutboxItem(config, item, publish);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(report.okCount).toBe(1);
    expect(report.results).toEqual([
      { relay: 'wss://one', ok: true, message: undefined },
      { relay: 'wss://two', ok: false, message: 'offline' }
    ]);
    expect(saved.at(-1)?.okFrom).toEqual(['wss://one']);
  });
});
