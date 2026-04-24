import type { EventTemplate } from 'nostr-tools';
import { getOutboxItem, outboxItems, putOutbox } from '../db/repositories/ledger';
import type { LocalProtocolEvent } from './events';
import { publishSignedEvent, relayOkCount, signEvent, type PublishResult } from './pool';
import type { OutboxItem, TerminalConfig } from '../pos/types';

export type OutboxPublishReport = {
  id: string;
  attempted: boolean;
  okCount: number;
  results: PublishResult[];
};

export function isLocalProtocolEvent(value: unknown): value is LocalProtocolEvent {
  const event = value as Partial<LocalProtocolEvent>;
  return typeof event.kind === 'number' && Array.isArray(event.tags) && typeof event.content === 'object' && event.content !== null;
}

export function outboxItemToTemplate(item: OutboxItem): EventTemplate {
  if (!isLocalProtocolEvent(item.payload)) throw new Error(`Outbox item ${item.id} is not publishable`);
  return {
    kind: item.payload.kind,
    tags: item.payload.tags,
    content: JSON.stringify(item.payload.content),
    created_at: Math.floor(item.createdAt / 1000)
  };
}

export async function publishOutboxItem(
  config: TerminalConfig,
  item: OutboxItem,
  publish = publishSignedEvent
): Promise<OutboxPublishReport> {
  if (!config.terminalPrivkeyEnc) throw new Error('Terminal signing key is unavailable.');
  if (!isLocalProtocolEvent(item.payload)) {
    return { id: item.id, attempted: false, okCount: item.okFrom.length, results: [] };
  }

  const event = signEvent(outboxItemToTemplate(item), config.terminalPrivkeyEnc);
  const results = await publish(config.syncServers, event);
  const okFrom = Array.from(new Set([...item.okFrom, ...results.filter((result) => result.ok).map((result) => result.relay)]));
  const updated = {
    ...item,
    okFrom,
    attempts: (item.attempts ?? 0) + 1,
    lastTriedAt: Date.now(),
    lastError: results.find((result) => !result.ok)?.message
  };
  await putOutbox(updated);
  return { id: item.id, attempted: true, okCount: relayOkCount(results), results };
}

export async function publishPendingOutbox(config: TerminalConfig, minOk = 2): Promise<OutboxPublishReport[]> {
  const pending = (await outboxItems()).filter((item) => item.okFrom.length < minOk);
  const reports: OutboxPublishReport[] = [];
  for (const item of pending) {
    reports.push(await publishOutboxItem(config, item));
  }
  return reports;
}

export async function markOutboxOk(id: string, relay: string): Promise<void> {
  const item = await getOutboxItem(id);
  if (!item) return;
  await putOutbox({ ...item, okFrom: Array.from(new Set([...item.okFrom, relay])) });
}
