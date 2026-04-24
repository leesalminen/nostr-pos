import { describe, expect, it } from 'vitest';
import { posRefForConfig, recoveryDurabilityMet } from './payment-state';
import type { TerminalConfig } from './types';

describe('payment preparation safety', () => {
  it('requires two backup server confirmations before showing Lightning payment data', () => {
    expect(
      recoveryDurabilityMet({
        results: [
          { relay: 'wss://one', ok: true },
          { relay: 'wss://two', ok: false },
          { relay: 'wss://three', ok: true }
        ]
      })
    ).toBe(true);

    expect(
      recoveryDurabilityMet({
        results: [
          { relay: 'wss://one', ok: true },
          { relay: 'wss://two', ok: false }
        ]
      })
    ).toBe(false);
  });

  it('uses loaded POS profile coordinates for sale records', () => {
    const config: TerminalConfig = {
      merchantName: 'Merchant',
      posName: 'Counter',
      currency: 'CRC',
      terminalId: 'term1',
      terminalPubkey: 'a'.repeat(64),
      pairingCode: '4F7G-YJDP',
      maxInvoiceSat: 100000,
      syncServers: [],
      posProfile: {
        merchantPubkey: 'b'.repeat(64),
        posId: 'seguras',
        eventId: 'event1',
        loadedAt: 1000,
        relays: ['wss://one']
      }
    };

    expect(posRefForConfig(config)).toBe(`30380:${'b'.repeat(64)}:seguras`);
  });
});
