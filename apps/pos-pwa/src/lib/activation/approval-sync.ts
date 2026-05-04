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

type ApprovalFilter = {
  kinds: number[];
  authors?: string[];
  '#d'?: string[];
  limit: number;
};

function approvalCoordinate(config: TerminalConfig): string | undefined {
  if (!config.posProfile?.posId || !config.terminalId) return undefined;
  return `${config.posProfile.posId}:${config.terminalId}`;
}

function approvalHasBranding(config: TerminalConfig): boolean {
  return (
    typeof config.authorization?.merchant_name === 'string' &&
    typeof config.authorization?.currency === 'string'
  );
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
  const baseFilter = {
    kinds: [KINDS.terminalAuthorization],
    limit: 50
  } as ApprovalFilter;
  if (config.posProfile?.merchantPubkey) baseFilter.authors = [config.posProfile.merchantPubkey];

  const filters: ApprovalFilter[] = [];
  const coordinate = approvalCoordinate(config);
  if (coordinate) filters.push({ ...baseFilter, '#d': [coordinate], limit: 20 });
  filters.push(baseFilter);

  const byId = new Map<string, Event>();
  for (const filter of filters) {
    for (const event of await fetchEvents(config.syncServers, filter)) {
      byId.set(event.id, event);
    }
  }

  const newestFirst = [...byId.values()].sort((a, b) => b.created_at - a.created_at);
  const valid: TerminalConfig[] = [];
  for (const event of newestFirst) {
    const approved = configFromApprovalEvent(config, event, Date.now(), options);
    if (approved) valid.push(approved);
  }
  return valid.find(approvalHasBranding) ?? valid[0];
}

export async function syncTerminalApproval(config: TerminalConfig): Promise<TerminalConfig | undefined> {
  const approved = await findTerminalApproval(config);
  if (!approved) return undefined;
  await saveTerminalConfig(approved);
  return approved;
}
