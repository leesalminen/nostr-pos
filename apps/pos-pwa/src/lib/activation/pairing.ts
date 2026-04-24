import { putOutbox } from '../db/repositories/ledger';
import { pairingAnnouncementEvent } from '../nostr/events';
import type { TerminalConfig } from '../pos/types';

export async function announcePairingRequest(config: TerminalConfig, now = Date.now()): Promise<void> {
  await putOutbox({
    id: `pairing_${config.pairingCode}`,
    type: 'pairing_announcement',
    payload: pairingAnnouncementEvent({
      terminalPubkey: config.terminalPubkey,
      pairingCode: config.pairingCode,
      createdAt: now
    }),
    createdAt: now,
    okFrom: []
  });
}
