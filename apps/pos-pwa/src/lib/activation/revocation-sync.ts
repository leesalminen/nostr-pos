import type { Event } from 'nostr-tools';
import { saveTerminalConfig } from '../db/repositories/terminal';
import { decryptContent } from '../nostr/encryption';
import { KINDS } from '../nostr/events';
import { querySignedEvents } from '../nostr/pool';
import type { TerminalConfig } from '../pos/types';

export function configFromRevocationEvent(config: TerminalConfig, event: Event, now = Date.now()): TerminalConfig | undefined {
  if (event.kind !== KINDS.terminalRevocation) return undefined;
  const expectedD = `${config.posProfile?.posId ?? ''}:${config.terminalId}`;
  const addressedByD = event.tags.some((tag) => tag[0] === 'd' && tag[1] === expectedD);
  const legacyAddressedByP = event.tags.some((tag) => tag[0] === 'p' && tag[1] === config.terminalPubkey);
  if (!addressedByD && !legacyAddressedByP) return undefined;
  if (config.posProfile?.merchantPubkey && event.pubkey !== config.posProfile.merchantPubkey) return undefined;
  let reason = 'owner_removed';
  try {
    let content: { reason?: unknown; revoked_at?: unknown };
    try {
      content = config.terminalPrivkeyEnc
        ? decryptContent<{ reason?: unknown; revoked_at?: unknown }>(event.content, config.terminalPrivkeyEnc, event.pubkey)
        : JSON.parse(event.content) as { reason?: unknown; revoked_at?: unknown };
    } catch {
      content = JSON.parse(event.content) as { reason?: unknown; revoked_at?: unknown };
    }
    if (typeof content.reason === 'string') reason = content.reason;
    if (typeof content.revoked_at === 'number') now = content.revoked_at * 1000;
  } catch {
    // Empty or malformed content still revokes when the signed tags match.
  }
  return {
    ...config,
    activatedAt: undefined,
    revokedAt: now,
    revocationReason: reason
  };
}

export async function findTerminalRevocation(
  config: TerminalConfig,
  fetchEvents = querySignedEvents
): Promise<TerminalConfig | undefined> {
  const filter = {
    kinds: [KINDS.terminalRevocation],
    '#d': [`${config.posProfile?.posId ?? ''}:${config.terminalId}`],
    limit: 10
  } as { kinds: number[]; authors?: string[]; '#d': string[]; limit: number };
  if (config.posProfile?.merchantPubkey) filter.authors = [config.posProfile.merchantPubkey];
  const events = await fetchEvents(config.syncServers, filter);
  const newestFirst = [...events].sort((a, b) => b.created_at - a.created_at);
  for (const event of newestFirst) {
    const revoked = configFromRevocationEvent(config, event);
    if (revoked) return revoked;
  }
  return undefined;
}

export async function syncTerminalRevocation(config: TerminalConfig): Promise<TerminalConfig | undefined> {
  const revoked = await findTerminalRevocation(config);
  if (!revoked) return undefined;
  await saveTerminalConfig(revoked);
  return revoked;
}
