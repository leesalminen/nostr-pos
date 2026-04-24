import { nip59, type Event } from 'nostr-tools';
import { getRecoveryBySwap, putRecovery } from '../db/repositories/ledger';
import { KINDS } from '../nostr/events';
import { isValidSignedEvent, querySignedEvents } from '../nostr/pool';
import { hexToBytes } from '../security/keys';
import type { SwapRecoveryRecord, TerminalConfig } from './types';

type RecoveryRumor = {
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
  pubkey: string;
  id: string;
};

function parseRecoveryContent(content: string): Partial<SwapRecoveryRecord> | undefined {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const saleId = typeof parsed.sale_id === 'string' ? parsed.sale_id : undefined;
    const paymentAttemptId = typeof parsed.payment_attempt_id === 'string' ? parsed.payment_attempt_id : undefined;
    const swapId = typeof parsed.swap_id === 'string' ? parsed.swap_id : undefined;
    const encryptedLocalBlob = typeof parsed.encrypted_local_blob === 'string' ? parsed.encrypted_local_blob : undefined;
    const expiresAt = typeof parsed.expires_at === 'number' ? parsed.expires_at * 1000 : undefined;
    const claim = parsed.claim && typeof parsed.claim === 'object' ? (parsed.claim as Record<string, unknown>) : {};
    const replacedClaimTxids = Array.isArray(claim.replaced_claim_txids)
      ? claim.replaced_claim_txids.filter((txid): txid is string => typeof txid === 'string')
      : undefined;
    if (!saleId || !paymentAttemptId || !swapId || !encryptedLocalBlob || !expiresAt) return undefined;
    return {
      saleId,
      paymentAttemptId,
      swapId,
      encryptedLocalBlob,
      expiresAt,
      lockupTxHex: typeof parsed.lockup_tx_hex === 'string' ? parsed.lockup_tx_hex : undefined,
      lockupTxid: typeof parsed.lockup_txid === 'string' ? parsed.lockup_txid : undefined,
      claimTxHex: typeof claim.claim_tx_hex === 'string' ? claim.claim_tx_hex : undefined,
      claimTxid: typeof claim.claim_txid === 'string' ? claim.claim_txid : undefined,
      replacedClaimTxids,
      claimPreparedAt: typeof claim.claim_prepared_at === 'number' ? claim.claim_prepared_at * 1000 : undefined,
      claimBroadcastAt: typeof claim.claim_broadcast_at === 'number' ? claim.claim_broadcast_at * 1000 : undefined,
      claimConfirmedAt: typeof claim.claim_confirmed_at === 'number' ? claim.claim_confirmed_at * 1000 : undefined,
      claimFeeSatPerVbyte: typeof claim.claim_fee_sat_per_vbyte === 'number' ? claim.claim_fee_sat_per_vbyte : undefined,
      claimRbfCount: typeof claim.claim_rbf_count === 'number' ? claim.claim_rbf_count : undefined
    };
  } catch {
    return undefined;
  }
}

export function unwrapTerminalRecoveryEvent(config: TerminalConfig, event: Event): RecoveryRumor | undefined {
  if (!config.terminalPrivkeyEnc || event.kind !== KINDS.giftWrap || !isValidSignedEvent(event)) return undefined;
  if (!event.tags.some((tag) => tag[0] === 'p' && tag[1] === config.terminalPubkey)) return undefined;
  try {
    const rumor = nip59.unwrapEvent(event, hexToBytes(config.terminalPrivkeyEnc));
    return rumor.kind === KINDS.swapRecovery ? rumor : undefined;
  } catch {
    return undefined;
  }
}

export async function applyTerminalRecoveryBackup(config: TerminalConfig, event: Event, now = Date.now()): Promise<boolean> {
  const rumor = unwrapTerminalRecoveryEvent(config, event);
  if (!rumor) return false;
  const parsed = parseRecoveryContent(rumor.content);
  if (!parsed?.swapId || !parsed.saleId || !parsed.paymentAttemptId || !parsed.encryptedLocalBlob || !parsed.expiresAt) return false;
  const existing = await getRecoveryBySwap(parsed.swapId);
  const next: SwapRecoveryRecord = {
    saleId: parsed.saleId,
    paymentAttemptId: parsed.paymentAttemptId,
    swapId: parsed.swapId,
    encryptedLocalBlob: parsed.encryptedLocalBlob,
    localSavedAt: existing?.localSavedAt ?? now,
    relaySavedAt: existing?.relaySavedAt ?? now,
    okFrom: existing?.okFrom ?? [],
    expiresAt: parsed.expiresAt,
    lockupTxHex: parsed.lockupTxHex ?? existing?.lockupTxHex,
    lockupTxid: parsed.lockupTxid ?? existing?.lockupTxid,
    claimTxHex: parsed.claimTxHex ?? existing?.claimTxHex,
    claimTxid: parsed.claimTxid ?? existing?.claimTxid,
    replacedClaimTxids: parsed.replacedClaimTxids ?? existing?.replacedClaimTxids,
    claimPreparedAt: parsed.claimPreparedAt ?? existing?.claimPreparedAt,
    claimLastTriedAt: existing?.claimLastTriedAt,
    claimBroadcastAttempts: existing?.claimBroadcastAttempts,
    claimLastError: existing?.claimLastError,
    claimFeeSatPerVbyte: parsed.claimFeeSatPerVbyte ?? existing?.claimFeeSatPerVbyte,
    claimRbfCount: parsed.claimRbfCount ?? existing?.claimRbfCount,
    claimBroadcastAt: parsed.claimBroadcastAt ?? existing?.claimBroadcastAt,
    claimConfirmedAt: parsed.claimConfirmedAt ?? existing?.claimConfirmedAt,
    claimNeedsFeeBump: existing?.claimNeedsFeeBump,
    status: existing?.status ?? 'pending'
  };
  await putRecovery(next);
  return true;
}

export async function syncTerminalRecoveryBackups(
  config: TerminalConfig,
  fetchEvents = querySignedEvents
): Promise<number> {
  if (!config.terminalPrivkeyEnc) return 0;
  const events = await fetchEvents(config.syncServers, {
    kinds: [KINDS.giftWrap],
    '#p': [config.terminalPubkey],
    limit: 100
  });
  let changed = 0;
  for (const event of events) {
    if (await applyTerminalRecoveryBackup(config, event)) changed += 1;
  }
  return changed;
}
