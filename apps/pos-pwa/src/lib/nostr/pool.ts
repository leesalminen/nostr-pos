import { finalizeEvent, SimplePool, verifyEvent, type Event, type EventTemplate } from 'nostr-tools';
import type { Filter } from 'nostr-tools/filter';
import { hexToBytes } from '../security/keys';

export type PublishResult = {
  relay: string;
  ok: boolean;
  message?: string;
};

export function relayPublishMessageOk(message: string): boolean {
  return !/^(connection failure|blocked|invalid|error|restricted|rate-limited|auth-required|pow:|duplicate)/i.test(message);
}

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
      const message = await promise;
      return { relay: relays[index], ok: relayPublishMessageOk(message), message };
    })
  );
  pool.destroy();
  return settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    return { relay: relays[index], ok: false, message: String(result.reason) };
  });
}

export async function querySignedEvents(relays: string[], filter: Filter, maxWait = 5000): Promise<Event[]> {
  const pool = new SimplePool();
  try {
    return await pool.querySync(relays, filter, { maxWait });
  } finally {
    pool.destroy();
  }
}

export function relayOkCount(results: PublishResult[]): number {
  return results.filter((result) => result.ok).length;
}
