import type { Event } from 'nostr-tools';
import { saveTerminalConfig } from '../db/repositories/terminal';
import { decryptContent } from '../nostr/encryption';
import { KINDS } from '../nostr/events';
import { querySignedEvents } from '../nostr/pool';
import type { TerminalConfig } from '../pos/types';
import { configWithTerminalAuthorization } from './authorization';

export type ApprovalSyncOptions = {
  allowPlaintext?: boolean;
};

function plaintextApprovalAllowed(): boolean {
  return !import.meta.env.PROD;
}

export function configFromApprovalEvent(
  config: TerminalConfig,
  event: Event,
  now = Date.now(),
  options: ApprovalSyncOptions = {}
): TerminalConfig | undefined {
  const allowPlaintext = options.allowPlaintext ?? plaintextApprovalAllowed();
  const candidates = allowPlaintext ? [event.content] : [];
  if (config.terminalPrivkeyEnc) {
    try {
      candidates.push(JSON.stringify(decryptContent<unknown>(event.content, config.terminalPrivkeyEnc, event.pubkey)));
    } catch {
      // Plaintext approval payloads are accepted only for CLI/dev pilots.
    }
  }

  for (const candidate of candidates) {
    try {
      return configWithTerminalAuthorization(config, candidate, now);
    } catch {
      // Ignore approvals for other terminals or stale/invalid payloads.
    }
  }
  return undefined;
}

export async function findTerminalApproval(
  config: TerminalConfig,
  fetchEvents = querySignedEvents,
  options: ApprovalSyncOptions = {}
): Promise<TerminalConfig | undefined> {
  const events = await fetchEvents(config.syncServers, {
    kinds: [KINDS.terminalAuthorization],
    '#p': [config.terminalPubkey],
    limit: 10
  });
  const newestFirst = [...events].sort((a, b) => b.created_at - a.created_at);
  for (const event of newestFirst) {
    const approved = configFromApprovalEvent(config, event, Date.now(), options);
    if (approved) return approved;
  }
  return undefined;
}

export async function syncTerminalApproval(config: TerminalConfig): Promise<TerminalConfig | undefined> {
  const approved = await findTerminalApproval(config);
  if (!approved) return undefined;
  await saveTerminalConfig(approved);
  return approved;
}
