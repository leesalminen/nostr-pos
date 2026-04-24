import { publishPendingOutbox, type OutboxPublishReport } from '../nostr/outbox';
import type { TerminalConfig } from './types';

export async function syncQueuedRecords(
  config: TerminalConfig,
  publish = publishPendingOutbox
): Promise<OutboxPublishReport[]> {
  try {
    return await publish(config);
  } catch {
    return [];
  }
}
