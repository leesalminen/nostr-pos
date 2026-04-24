import { describe, expect, it } from 'vitest';
import { createTerminalKeypair } from '../security/keys';
import { signEvent } from '../nostr/pool';
import type { TerminalConfig } from '../pos/types';
import { configFromRevocationEvent, findTerminalRevocation } from './revocation-sync';

const terminalKeys = createTerminalKeypair();
const merchantKeys = createTerminalKeypair();

const config: TerminalConfig = {
  merchantName: 'Seguras Butcher',
  posName: 'Counter 1',
  currency: 'CRC',
  terminalId: 'term1',
  terminalPubkey: terminalKeys.publicKey,
  terminalPrivkeyEnc: terminalKeys.privateKey,
  pairingCode: '4F7G-YJDP',
  activatedAt: 100,
  maxInvoiceSat: 100000,
  syncServers: ['wss://one']
};

describe('revocation relay sync', () => {
  it('locks the terminal when a matching revocation is found', () => {
    const event = signEvent(
      {
        kind: 30382,
        tags: [['p', terminalKeys.publicKey]],
        content: JSON.stringify({ reason: 'merchant_revoked', revoked_at: 2000 }),
        created_at: 2000
      },
      merchantKeys.privateKey
    );

    const revoked = configFromRevocationEvent(config, event, 1000);
    expect(revoked?.activatedAt).toBeUndefined();
    expect(revoked?.revokedAt).toBe(2000000);
    expect(revoked?.revocationReason).toBe('merchant_revoked');
  });

  it('ignores revocations for other terminals', () => {
    const event = signEvent(
      {
        kind: 30382,
        tags: [['p', 'b'.repeat(64)]],
        content: '{}',
        created_at: 2000
      },
      merchantKeys.privateKey
    );

    expect(configFromRevocationEvent(config, event, 1000)).toBeUndefined();
  });

  it('finds newest matching revocation from fetched events', async () => {
    const event = signEvent(
      {
        kind: 30382,
        tags: [['p', terminalKeys.publicKey]],
        content: JSON.stringify({ reason: 'merchant_revoked' }),
        created_at: 2000
      },
      merchantKeys.privateKey
    );

    const revoked = await findTerminalRevocation(config, async () => [event]);
    expect(revoked?.revocationReason).toBe('merchant_revoked');
  });
});
