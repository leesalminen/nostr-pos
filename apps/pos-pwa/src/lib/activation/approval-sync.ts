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

function short(value: string | undefined): string {
  if (!value) return 'none';
  return value.length <= 16 ? value : `${value.slice(0, 8)}...${value.slice(-8)}`;
}

export function configFromApprovalEvent(
  config: TerminalConfig,
  event: Event,
  now = Date.now(),
  options: ApprovalSyncOptions = {}
): TerminalConfig | undefined {
  console.log('[nostr-pos] approval candidate', {
    eventId: short(event.id),
    merchantPubkey: short(event.pubkey),
    createdAt: event.created_at,
    kind: event.kind,
    tags: event.tags,
    currentTerminalId: config.terminalId,
    currentMerchantName: config.merchantName,
    currentPosName: config.posName,
    currentCurrency: config.currency
  });

  const allowPlaintext = options.allowPlaintext ?? plaintextApprovalAllowed();
  const candidates = allowPlaintext ? [event.content] : [];
  if (config.terminalPrivkeyEnc) {
    try {
      const decrypted = decryptContent<unknown>(event.content, config.terminalPrivkeyEnc, event.pubkey);
      console.log('[nostr-pos] approval decrypted', {
        eventId: short(event.id),
        payload:
          decrypted && typeof decrypted === 'object'
            ? {
                type: (decrypted as Record<string, unknown>).type,
                terminal_pubkey: short((decrypted as Record<string, unknown>).terminal_pubkey as string | undefined),
                terminal_id: (decrypted as Record<string, unknown>).terminal_id,
                merchant_name: (decrypted as Record<string, unknown>).merchant_name,
                currency: (decrypted as Record<string, unknown>).currency,
                terminal_name: (decrypted as Record<string, unknown>).terminal_name,
                pairing_code_hint: (decrypted as Record<string, unknown>).pairing_code_hint
              }
            : typeof decrypted
      });
      candidates.push(JSON.stringify(decrypted));
    } catch {
      console.log('[nostr-pos] approval decrypt failed', {
        eventId: short(event.id),
        merchantPubkey: short(event.pubkey)
      });
      // Plaintext approval payloads are accepted only for CLI/dev pilots.
    }
  }

  for (const candidate of candidates) {
    try {
      const approved = configWithTerminalAuthorization(config, candidate, now);
      console.log('[nostr-pos] approval accepted', {
        eventId: short(event.id),
        terminalId: approved.terminalId,
        merchantName: approved.merchantName,
        posName: approved.posName,
        currency: approved.currency,
        hasBranding: approvalHasBranding(approved)
      });
      return approved;
    } catch (error) {
      console.log('[nostr-pos] approval rejected', {
        eventId: short(event.id),
        reason: error instanceof Error ? error.message : String(error)
      });
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

  console.log('[nostr-pos] approval sync start', {
    terminalId: config.terminalId,
    terminalPubkey: short(config.terminalPubkey),
    pairingCode: config.pairingCode,
    merchantName: config.merchantName,
    posName: config.posName,
    currency: config.currency,
    posProfile: config.posProfile,
    filters
  });

  const byId = new Map<string, Event>();
  for (const filter of filters) {
    const events = await fetchEvents(config.syncServers, filter);
    console.log('[nostr-pos] approval sync fetched', {
      filter,
      count: events.length,
      eventIds: events.map((event) => short(event.id))
    });
    for (const event of events) {
      byId.set(event.id, event);
    }
  }

  const newestFirst = [...byId.values()].sort((a, b) => b.created_at - a.created_at);
  const valid: TerminalConfig[] = [];
  for (const event of newestFirst) {
    const approved = configFromApprovalEvent(config, event, Date.now(), options);
    if (approved) valid.push(approved);
  }
  const selected = valid.find(approvalHasBranding) ?? valid[0];
  console.log('[nostr-pos] approval sync selected', {
    validCount: valid.length,
    terminalId: selected?.terminalId,
    merchantName: selected?.merchantName,
    posName: selected?.posName,
    currency: selected?.currency,
    hasBranding: selected ? approvalHasBranding(selected) : false
  });
  return selected;
}

export async function syncTerminalApproval(config: TerminalConfig): Promise<TerminalConfig | undefined> {
  const approved = await findTerminalApproval(config);
  if (!approved) return undefined;
  await saveTerminalConfig(approved);
  return approved;
}
