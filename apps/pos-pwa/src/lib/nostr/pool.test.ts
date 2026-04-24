import { describe, expect, it } from 'vitest';
import { createTerminalKeypair } from '../security/keys';
import { isValidSignedEvent, relayOkCount, relayPublishMessageOk, signEvent } from './pool';

describe('Nostr pool helpers', () => {
  it('signs verifiable events with terminal keys', () => {
    const keys = createTerminalKeypair();
    const event = signEvent(
      {
        kind: 1,
        tags: [['proto', 'nostr-pos', '0.2']],
        content: '{}',
        created_at: 100
      },
      keys.privateKey
    );

    expect(event.pubkey).toBe(keys.publicKey);
    expect(isValidSignedEvent(event)).toBe(true);
  });

  it('counts successful relay publishes', () => {
    expect(relayOkCount([{ relay: 'wss://one', ok: true }, { relay: 'wss://two', ok: false }])).toBe(1);
  });

  it('treats relay connection failure messages as publish failures', () => {
    expect(relayPublishMessageOk('stored')).toBe(true);
    expect(relayPublishMessageOk('connection failure: WebSocket is not defined')).toBe(false);
    expect(relayPublishMessageOk('blocked: policy')).toBe(false);
  });
});
