import { describe, expect, it, vi } from 'vitest';
import type { OutboxItem, TerminalConfig } from '../pos/types';
import { announcePairingRequest } from './pairing';

const saved: OutboxItem[] = [];

vi.mock('../db/repositories/ledger', () => ({
  putOutbox: vi.fn((item: OutboxItem) => saved.push(item))
}));

describe('activation pairing helper', () => {
  it('queues a pairing request for sync', async () => {
    saved.length = 0;
    const config: TerminalConfig = {
      merchantName: 'Seguras Butcher',
      posName: 'Counter 1',
      currency: 'CRC',
      terminalId: 'term1',
      terminalPubkey: 'a'.repeat(64),
      pairingCode: '4F7G-YJDP',
      maxInvoiceSat: 100000,
      syncServers: ['wss://one', 'wss://two']
    };

    const result = await announcePairingRequest(config, 1000, async (_config, item) => ({
      id: item.id,
      attempted: true,
      okCount: 2,
      results: [
        { relay: 'wss://one', ok: true },
        { relay: 'wss://two', ok: true }
      ]
    }));

    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe('pairing_announcement');
    expect(saved[0].payload).toMatchObject({ kind: 30383 });
    expect(result).toMatchObject({ queued: true, published: true, okCount: 2 });
  });

  it('keeps the request queued if immediate publish fails', async () => {
    saved.length = 0;
    const config: TerminalConfig = {
      merchantName: 'Seguras Butcher',
      posName: 'Counter 1',
      currency: 'CRC',
      terminalId: 'term1',
      terminalPubkey: 'a'.repeat(64),
      terminalPrivkeyEnc: 'b'.repeat(64),
      pairingCode: '4F7G-YJDP',
      maxInvoiceSat: 100000,
      syncServers: ['wss://one', 'wss://two']
    };

    const result = await announcePairingRequest(config, 1000, async () => {
      throw new Error('offline');
    });

    expect(saved).toHaveLength(1);
    expect(result).toEqual({ queued: true, published: false, okCount: 0 });
  });
});
