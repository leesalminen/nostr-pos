import type { EventTemplate } from 'nostr-tools';
import { getOutboxItem, outboxItems, putOutbox } from '../db/repositories/ledger';
import type { LocalProtocolEvent } from './events';
import { publishSignedEvent, relayOkCount, signEvent, type PublishResult } from './pool';
import type { OutboxItem, TerminalConfig } from '../pos/types';
import { encryptContent } from './encryption';

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

export function outboxItemToTemplate(item: OutboxItem, privateKeyHex?: string, recipientPubkeyHex?: string): EventTemplate {
  if (!isLocalProtocolEvent(item.payload)) throw new Error(`Outbox item ${item.id} is not publishable`);
  const content = privateKeyHex && recipientPubkeyHex
    ? encryptContent(item.payload.content, privateKeyHex, recipientPubkeyHex)
    : JSON.stringify(item.payload.content);
  return {
    kind: item.payload.kind,
    tags: item.payload.tags,
    content,
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

  const recipient = merchantRecoveryPubkey(config);
  const event = signEvent(outboxItemToTemplate(item, config.terminalPrivkeyEnc, recipient), config.terminalPrivkeyEnc);
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

export function merchantRecoveryPubkey(config: TerminalConfig): string | undefined {
  if (!config.authorization || typeof config.authorization !== 'object') return undefined;
  const value = (config.authorization as { merchant_recovery_pubkey?: unknown }).merchant_recovery_pubkey;
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value) ? value : undefined;
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
