import { nip19, type Event } from 'nostr-tools';
import { KINDS } from '../nostr/events';
import { querySignedEvents } from '../nostr/pool';
import type { LiquidBackend, TerminalConfig } from './types';

export const DEFAULT_PROFILE_RELAYS = ['wss://no.str.cr', 'wss://relay.primal.net', 'wss://nos.lol'];

export type PosProfilePointer = {
  merchantPubkey: string;
  posId: string;
  kind: number;
  relays: string[];
};

export type LoadedPosProfile = {
  pointer: PosProfilePointer;
  eventId: string;
  name: string;
  merchantName: string;
  currency: string;
  relays: string[];
  liquidBackends: LiquidBackend[];
};

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function relayTags(event: Event): string[] {
  return event.tags.filter((tag) => tag[0] === 'relay' && typeof tag[1] === 'string').map((tag) => tag[1]);
}

function tagValue(event: Event, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name && typeof tag[1] === 'string')?.[1];
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function isPosProfileReference(value: string): boolean {
  const ref = decodeURIComponent(value).trim();
  return ref.startsWith('naddr1') || /^30380:[0-9a-fA-F]{64}:.+/.test(ref);
}

export function parsePosProfileReference(value: string): PosProfilePointer {
  const ref = decodeURIComponent(value).trim();
  if (ref.startsWith('naddr1')) {
    const decoded = nip19.decode(ref);
    if (decoded.type !== 'naddr') throw new Error('Payment profile link is not supported.');
    const data = decoded.data;
    if (data.kind !== KINDS.posProfile) throw new Error('Payment profile link is not supported.');
    return {
      merchantPubkey: data.pubkey,
      posId: data.identifier,
      kind: data.kind,
      relays: data.relays ?? []
    };
  }

  const [kind, merchantPubkey, ...posIdParts] = ref.split(':');
  const posId = posIdParts.join(':');
  if (kind !== String(KINDS.posProfile) || !/^[0-9a-fA-F]{64}$/.test(merchantPubkey) || !posId) {
    throw new Error('Payment profile link is not supported.');
  }
  return {
    merchantPubkey: merchantPubkey.toLowerCase(),
    posId,
    kind: KINDS.posProfile,
    relays: []
  };
}

export function profileFromEvent(pointer: PosProfilePointer, event: Event): LoadedPosProfile {
  if (event.kind !== KINDS.posProfile) throw new Error('Payment profile could not be loaded.');
  if (event.pubkey !== pointer.merchantPubkey) throw new Error('Payment profile could not be loaded.');
  if (!event.tags.some((tag) => tag[0] === 'd' && tag[1] === pointer.posId)) {
    throw new Error('Payment profile could not be loaded.');
  }

  const content = asObject(JSON.parse(event.content));
  if (!content) throw new Error('Payment profile is not valid.');

  const rawBackends = Array.isArray(content.liquid_backends) ? content.liquid_backends : [];
  const liquidBackends = rawBackends
    .map(asObject)
    .filter((backend): backend is Record<string, unknown> => !!backend)
    .filter((backend) => backend.type === 'esplora' && typeof backend.url === 'string')
    .map((backend) => ({ type: 'esplora' as const, url: backend.url as string }));

  return {
    pointer,
    eventId: event.id,
    name: typeof content.name === 'string' ? content.name : (tagValue(event, 'name') ?? 'Counter'),
    merchantName: typeof content.merchant_name === 'string' ? content.merchant_name : (tagValue(event, 'merchant') ?? 'Merchant'),
    currency: typeof content.currency === 'string' && /^[A-Z]{3}$/.test(content.currency) ? content.currency : 'USD',
    relays: uniq([...pointer.relays, ...strings(content.relays), ...relayTags(event)]),
    liquidBackends
  };
}

export async function resolvePosProfile(reference: string, fetchEvents = querySignedEvents): Promise<LoadedPosProfile> {
  const pointer = parsePosProfileReference(reference);
  const relays = pointer.relays.length > 0 ? pointer.relays : DEFAULT_PROFILE_RELAYS;
  const events = await fetchEvents(relays, {
    kinds: [KINDS.posProfile],
    authors: [pointer.merchantPubkey],
    '#d': [pointer.posId],
    limit: 5
  });
  const event = [...events]
    .filter((candidate) => candidate.pubkey === pointer.merchantPubkey)
    .filter((candidate) => candidate.tags.some((tag) => tag[0] === 'd' && tag[1] === pointer.posId))
    .sort((a, b) => b.created_at - a.created_at)[0];
  if (!event) throw new Error('Payment profile was not found.');
  return profileFromEvent(pointer, event);
}

export function configWithPosProfile(config: TerminalConfig, profile: LoadedPosProfile, now = Date.now()): TerminalConfig {
  const relays = profile.relays.length > 0 ? profile.relays : config.syncServers;
  const authorization = {
    ...(config.authorization ?? {}),
    ...(profile.liquidBackends.length > 0 ? { liquid_backends: profile.liquidBackends } : {})
  };
  return {
    ...config,
    merchantName: profile.merchantName,
    posName: config.activatedAt ? config.posName : profile.name,
    currency: profile.currency,
    syncServers: relays,
    authorization,
    posProfile: {
      merchantPubkey: profile.pointer.merchantPubkey,
      posId: profile.pointer.posId,
      eventId: profile.eventId,
      loadedAt: now,
      relays
    }
  };
}
