import { finalizeEvent, SimplePool, verifyEvent, type Event, type EventTemplate } from 'nostr-tools';
import { hexToBytes } from '../security/keys';

export type PublishResult = {
  relay: string;
  ok: boolean;
  message?: string;
};

export function signEvent(template: EventTemplate, privateKeyHex: string): Event {
  return finalizeEvent(template, hexToBytes(privateKeyHex));
}

export function isValidSignedEvent(event: Event): boolean {
  return verifyEvent(event);
}

export async function publishSignedEvent(relays: string[], event: Event): Promise<PublishResult[]> {
  const pool = new SimplePool();
  const settled = await Promise.allSettled(
    pool.publish(relays, event, { maxWait: 5000 }).map(async (promise, index) => {
      await promise;
      return { relay: relays[index], ok: true };
    })
  );
  pool.destroy();
  return settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    return { relay: relays[index], ok: false, message: String(result.reason) };
  });
}

export function relayOkCount(results: PublishResult[]): number {
  return results.filter((result) => result.ok).length;
}
