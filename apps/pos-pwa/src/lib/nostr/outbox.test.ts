import { describe, expect, it, vi } from 'vitest';
import type { Event } from 'nostr-tools';
import { createTerminalKeypair } from '../security/keys';
import type { OutboxItem, TerminalConfig } from '../pos/types';
import { outboxItemToTemplate, publishOutboxItem } from './outbox';

const saved: OutboxItem[] = [];

vi.mock('../db/repositories/ledger', () => ({
  putOutbox: vi.fn((item: OutboxItem) => saved.push(item)),
  outboxItems: vi.fn(() => []),
  getOutboxItem: vi.fn()
}));

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
});
