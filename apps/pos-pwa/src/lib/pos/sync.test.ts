import { describe, expect, it } from 'vitest';
import { syncQueuedRecords } from './sync';
import type { TerminalConfig } from './types';

const config: TerminalConfig = {
  merchantName: 'Merchant',
  posName: 'Counter',
  currency: 'CRC',
  terminalId: 'term1',
  terminalPubkey: 'a'.repeat(64),
  pairingCode: '4F7G-YJDP',
  activatedAt: 1000,
  maxInvoiceSat: 100000,
  syncServers: ['wss://one']
};

describe('queued record sync', () => {
  it('returns publish reports when sync succeeds', async () => {
    const reports = await syncQueuedRecords(config, async () => [
      { id: 'status1', attempted: true, okCount: 2, results: [] }
    ]);

    expect(reports).toHaveLength(1);
    expect(reports[0].okCount).toBe(2);
  });

  it('keeps cashier flow moving when sync fails', async () => {
    const reports = await syncQueuedRecords(config, async () => {
      throw new Error('offline');
    });

    expect(reports).toEqual([]);
  });
});
