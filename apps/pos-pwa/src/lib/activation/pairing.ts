import { putOutbox } from '../db/repositories/ledger';
import { pairingAnnouncementEvent } from '../nostr/events';
import { publishOutboxItem, type OutboxPublishReport } from '../nostr/outbox';
import type { TerminalConfig } from '../pos/types';

export type PairingAnnouncementResult = {
  queued: true;
  published: boolean;
  okCount: number;
  report?: OutboxPublishReport;
};

export async function announcePairingRequest(
  config: TerminalConfig,
  now = Date.now(),
  publish = publishOutboxItem
): Promise<PairingAnnouncementResult> {
  const item = {
    id: `pairing_${config.pairingCode}`,
    type: 'pairing_announcement',
    payload: pairingAnnouncementEvent({
      terminalPubkey: config.terminalPubkey,
      pairingCode: config.pairingCode,
      createdAt: now
    }),
    createdAt: now,
    okFrom: []
  };
  await putOutbox(item);

  try {
    const report = await publish(config, item);
    return { queued: true, published: report.okCount > 0, okCount: report.okCount, report };
  } catch {
    return { queued: true, published: false, okCount: 0 };
  }
}
