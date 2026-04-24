import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertTerminalCanCharge, posRefForConfig, recoveryDurabilityMet, swapProviderForConfig } from './payment-state';
import type { TerminalConfig } from './types';

const activeConfig: TerminalConfig = {
  merchantName: 'Merchant',
  posName: 'Counter',
  currency: 'CRC',
  terminalId: 'term1',
  terminalPubkey: 'a'.repeat(64),
  pairingCode: '4F7G-YJDP',
  activatedAt: 1000,
  maxInvoiceSat: 100000,
  syncServers: []
};

afterEach(() => {
  vi.unstubAllEnvs();
});

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
      ...activeConfig,
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

  it('refuses to charge inactive, removed, or expired terminals', () => {
    expect(() => assertTerminalCanCharge(activeConfig, 2000)).not.toThrow();
    expect(() => assertTerminalCanCharge({ ...activeConfig, activatedAt: undefined }, 2000)).toThrow('owner approval');
    expect(() => assertTerminalCanCharge({ ...activeConfig, revokedAt: 1500 }, 2000)).toThrow('removed');
    expect(() =>
      assertTerminalCanCharge({ ...activeConfig, authorization: { expires_at: 1 } }, 2000)
    ).toThrow('expired');
  });

  it('does not fall back to mock Lightning providers in production', () => {
    vi.stubEnv('PROD', true);

    expect(() => swapProviderForConfig(activeConfig)).toThrow('Lightning is temporarily unavailable');
  });
});
