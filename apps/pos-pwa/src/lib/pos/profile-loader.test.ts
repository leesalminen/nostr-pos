import { nip19 } from 'nostr-tools';
import { describe, expect, it } from 'vitest';
import { signEvent } from '../nostr/pool';
import { createTerminalKeypair } from '../security/keys';
import type { TerminalConfig } from './types';
import { configWithPosProfile, isPosProfileReference, parsePosProfileReference, resolvePosProfile } from './profile-loader';

const merchant = createTerminalKeypair();

const baseConfig: TerminalConfig = {
  merchantName: 'Default',
  posName: 'Counter',
  currency: 'USD',
  terminalId: 'term1',
  terminalPubkey: createTerminalKeypair().publicKey,
  pairingCode: '4F7G-YJDP',
  maxInvoiceSat: 100000,
  syncServers: ['wss://old']
};

function profileEvent(createdAt: number, name: string) {
  return signEvent(
    {
      kind: 30380,
      tags: [
        ['d', 'seguras'],
        ['relay', 'wss://profile']
      ],
      content: JSON.stringify({
        name,
        merchant_name: 'Seguras Butcher',
        currency: 'CRC',
        relays: ['wss://relay-one'],
        liquid_backends: [{ type: 'esplora', url: 'https://liquid.example/api' }]
      }),
      created_at: createdAt
    },
    merchant.privateKey
  );
}

describe('POS profile loading', () => {
  it('parses profile references from naddr and coordinates', () => {
    const naddr = nip19.naddrEncode({
      kind: 30380,
      pubkey: merchant.publicKey,
      identifier: 'seguras',
      relays: ['wss://relay-one']
    });

    expect(isPosProfileReference(naddr)).toBe(true);
    expect(parsePosProfileReference(naddr)).toMatchObject({
      merchantPubkey: merchant.publicKey,
      posId: 'seguras',
      kind: 30380,
      relays: ['wss://relay-one']
    });
    expect(parsePosProfileReference(`30380:${merchant.publicKey}:seguras`).posId).toBe('seguras');
  });

  it('resolves the newest signed profile event from relays', async () => {
    const loaded = await resolvePosProfile(`30380:${merchant.publicKey}:seguras`, async (_relays, filter) => {
      expect(filter).toMatchObject({
        kinds: [30380],
        authors: [merchant.publicKey],
        '#d': ['seguras']
      });
      return [profileEvent(10, 'Old Counter'), profileEvent(20, 'Main Counter')];
    });

    expect(loaded.name).toBe('Main Counter');
    expect(loaded.merchantName).toBe('Seguras Butcher');
    expect(loaded.relays).toEqual(['wss://relay-one', 'wss://profile']);
  });

  it('applies profile branding, backend, and relay config to a terminal', () => {
    const loaded = configWithPosProfile(
      baseConfig,
      {
        pointer: {
          kind: 30380,
          merchantPubkey: merchant.publicKey,
          posId: 'seguras',
          relays: ['wss://relay-one']
        },
        eventId: 'event1',
        name: 'Main Counter',
        merchantName: 'Seguras Butcher',
        currency: 'CRC',
        relays: ['wss://relay-one'],
        liquidBackends: [{ type: 'esplora', url: 'https://liquid.example/api' }]
      },
      1234
    );

    expect(loaded.merchantName).toBe('Seguras Butcher');
    expect(loaded.currency).toBe('CRC');
    expect(loaded.syncServers).toEqual(['wss://relay-one']);
    expect(loaded.authorization?.liquid_backends?.[0]?.url).toBe('https://liquid.example/api');
    expect(loaded.posProfile?.loadedAt).toBe(1234);
  });
});
