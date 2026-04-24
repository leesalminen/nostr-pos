import type { Event } from 'nostr-tools';
import { saveTerminalConfig } from '../db/repositories/terminal';
import { KINDS } from '../nostr/events';
import { querySignedEvents } from '../nostr/pool';
import type { TerminalConfig } from '../pos/types';

export function configFromRevocationEvent(config: TerminalConfig, event: Event, now = Date.now()): TerminalConfig | undefined {
  if (event.kind !== KINDS.terminalRevocation) return undefined;
  if (!event.tags.some((tag) => tag[0] === 'p' && tag[1] === config.terminalPubkey)) return undefined;
  if (config.posProfile?.merchantPubkey && event.pubkey !== config.posProfile.merchantPubkey) return undefined;
  let reason = 'owner_removed';
  try {
    const content = JSON.parse(event.content) as { reason?: unknown; revoked_at?: unknown };
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
  const events = await fetchEvents(config.syncServers, {
    kinds: [KINDS.terminalRevocation],
    '#p': [config.terminalPubkey],
    limit: 10
  });
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
