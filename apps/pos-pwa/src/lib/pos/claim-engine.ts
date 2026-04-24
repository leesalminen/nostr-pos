import { decryptJson } from '../db/crypto';
import { getAttempt, getRecoveryBySwap, getSale, putOutbox, recoveryRecords } from '../db/repositories/ledger';
import { broadcastLiquidTransaction, fetchTransactionHex, fetchTransactionStatus } from '../liquid/esplora';
import { isDistinctLiquidClaimTxid, isLiquidTxid } from '../liquid/txid';
import { swapRecoveryEvent } from '../nostr/events';
import { merchantRecoveryPubkey } from '../nostr/outbox';
import { buildBoltzLiquidReverseClaim } from '../swaps/boltz-claim';
import type { Fetcher } from '../net/fetch';
import {
  markSwapClaimable,
  markSwapClaimBroadcastAttempt,
  markSwapClaimBroadcastFailed,
  markSwapClaimConfirmed,
  markSwapClaimNeedsFeeBump,
  markSwapClaimReplacementFailed,
  markSwapClaimReplacementPrepared,
  markSwapLockupSeen,
  markSwapRecoveryFinished
} from './recovery-state';
import { settleAttempt } from './settlement';
import type { LiquidBackend, SwapRecoveryRecord, TerminalConfig } from './types';
import type { ReverseSwapResponse } from '../swaps/provider';

export type PreparedClaimResult = {
  swapId: string;
  status: 'broadcast' | 'skipped' | 'failed';
  txid?: string;
  reason?: string;
};

export type ClaimConfirmationResult = {
  swapId: string;
  status: 'confirmed' | 'unconfirmed' | 'fee_bump_due' | 'failed';
  reason?: string;
};

export type ClaimFeeBumpResult = PreparedClaimResult & {
  feeSatPerVbyte?: number;
};

function primaryLiquidBackend(config: TerminalConfig): LiquidBackend | undefined {
  return config.authorization?.liquid_backends?.find((backend) => backend.type === 'esplora' && backend.url);
}

function primaryBoltzApiBase(config: TerminalConfig): string | undefined {
  return config.authorization?.swap_providers?.find((provider) => provider.type === 'boltz' && provider.api_base)?.api_base;
}

function preparedClaimRows(records: SwapRecoveryRecord[]): SwapRecoveryRecord[] {
  return records.filter((record) => ['claimable', 'failed'].includes(record.status) && Boolean(record.claimTxHex));
}

function nextClaimFeeRate(record: SwapRecoveryRecord): number {
  const current = record.claimFeeSatPerVbyte ?? 0.1;
  return Math.max(Number((current * 1.5).toFixed(2)), Number((current + 0.1).toFixed(2)));
}

async function parsedLiquidTxid(txHex: string): Promise<string | undefined> {
  try {
    const liquid = await import('liquidjs-lib');
    return liquid.Transaction.fromHex(txHex).getId();
  } catch {
    return undefined;
  }
}

async function assertClaimBroadcastTxid(claimTxHex: string, txid: string, lockupTxid?: string): Promise<void> {
  if (!isLiquidTxid(txid)) throw new Error('Liquid backend did not return a valid claim transaction id.');
  if (!isDistinctLiquidClaimTxid(txid, lockupTxid)) {
    throw new Error('Liquid backend returned the lockup transaction id instead of the claim transaction id.');
  }
  const parsedTxid = await parsedLiquidTxid(claimTxHex);
  if (parsedTxid && parsedTxid.toLowerCase() !== txid.toLowerCase()) {
    throw new Error('Liquid backend returned a transaction id that does not match the claim transaction.');
  }
}

async function settleRecoveredClaim(record: SwapRecoveryRecord, txid: string, settledAt = Date.now()): Promise<void> {
  const sale = await getSale(record.saleId);
  const attempt = await getAttempt(record.paymentAttemptId);
  if (!sale || !attempt) return;
  if (attempt.status === 'settled' && (sale.status === 'receipt_ready' || sale.status === 'settled')) return;
  await settleAttempt({ sale, attempt, txid, settledAt });
}

async function queueRecoveryRecordUpdate(config: TerminalConfig, record: SwapRecoveryRecord, now = Date.now()): Promise<void> {
  await putOutbox({
    id: `recovery_${record.swapId}_${now}`,
    type: 'payment_backup',
    payload: swapRecoveryEvent({
      saleId: record.saleId,
      paymentAttemptId: record.paymentAttemptId,
      swapId: record.swapId,
      terminalId: config.terminalId,
      encryptedLocalBlob: record.encryptedLocalBlob,
      expiresAt: record.expiresAt,
      recoveryPubkey: merchantRecoveryPubkey(config),
      lockupTxid: record.lockupTxid,
      lockupTxHex: record.lockupTxHex,
      claimTxHex: record.claimTxHex,
      claimTxid: record.claimTxid,
      replacedClaimTxids: record.replacedClaimTxids,
      claimPreparedAt: record.claimPreparedAt,
      claimBroadcastAt: record.claimBroadcastAt,
      claimConfirmedAt: record.claimConfirmedAt,
      claimFeeSatPerVbyte: record.claimFeeSatPerVbyte,
      claimRbfCount: record.claimRbfCount
    }),
    createdAt: now,
    okFrom: []
  });
}

export async function broadcastPreparedClaims(
  config: TerminalConfig,
  options: { fetcher?: Fetcher; records?: SwapRecoveryRecord[]; now?: number } = {}
): Promise<PreparedClaimResult[]> {
  const backend = primaryLiquidBackend(config);
  const records = preparedClaimRows(options.records ?? (await recoveryRecords()));
  const now = options.now ?? Date.now();

  if (!backend) {
    return records.map((record) => ({
      swapId: record.swapId,
      status: 'skipped',
      reason: 'No Liquid backend configured.'
    }));
  }

  const results: PreparedClaimResult[] = [];
  for (const record of records) {
    try {
      await queueRecoveryRecordUpdate(config, record, now);
      await markSwapClaimBroadcastAttempt({ swapId: record.swapId, now, feeSatPerVbyte: record.claimFeeSatPerVbyte });
      const txid = await broadcastLiquidTransaction(backend.url, record.claimTxHex as string, options.fetcher);
      await assertClaimBroadcastTxid(record.claimTxHex as string, txid, record.lockupTxid);
      const finished = await markSwapRecoveryFinished({ swapId: record.swapId, claimTxHex: record.claimTxHex, claimTxid: txid, now });
      if (finished) await queueRecoveryRecordUpdate(config, finished, now);
      await settleRecoveredClaim(record, txid, now);
      results.push({ swapId: record.swapId, status: 'broadcast', txid });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Could not broadcast claim.';
      await markSwapClaimBroadcastFailed({ swapId: record.swapId, error: reason, now });
      results.push({
        swapId: record.swapId,
        status: 'failed',
        reason
      });
    }
  }
  return results;
}

export async function resumePreparedClaims(
  config: TerminalConfig,
  options: { fetcher?: Fetcher; records?: SwapRecoveryRecord[]; now?: number } = {}
): Promise<PreparedClaimResult[]> {
  const records = (options.records ?? (await recoveryRecords())).filter(
    (record) => record.status === 'claimable' && Boolean(record.claimTxHex)
  );
  return broadcastPreparedClaims(config, { ...options, records });
}

type RecoveryPayload = {
  settlement?: { address?: string };
  swap?: ReverseSwapResponse;
};

export async function claimLiquidReverseSwap(
  config: TerminalConfig,
  input: { swapId: string; lockupTxHex?: string; lockupTxid?: string; fetcher?: Fetcher; now?: number; feeSatPerVbyte?: number }
): Promise<PreparedClaimResult> {
  const backend = primaryLiquidBackend(config);
  if (!backend) return { swapId: input.swapId, status: 'skipped', reason: 'No Liquid backend configured.' };

  const existing = await getRecoveryBySwap(input.swapId);
  if (!existing) return { swapId: input.swapId, status: 'skipped', reason: 'No recovery record found.' };
  if (input.lockupTxHex || input.lockupTxid) {
    await markSwapLockupSeen({ swapId: input.swapId, lockupTxHex: input.lockupTxHex, lockupTxid: input.lockupTxid });
  }
  if (existing.claimTxHex) {
    const [result] = await broadcastPreparedClaims(config, { fetcher: input.fetcher, records: [existing], now: input.now });
    return result ?? { swapId: input.swapId, status: 'skipped', reason: 'No prepared claim transaction is ready.' };
  }

  const apiBase = primaryBoltzApiBase(config);
  if (!apiBase) return { swapId: input.swapId, status: 'skipped', reason: 'No Boltz provider configured.' };

  try {
    const lockupTxid = input.lockupTxid ?? existing.lockupTxid;
    const lockupTxHex = input.lockupTxHex ?? existing.lockupTxHex ?? (lockupTxid ? await fetchTransactionHex(backend.url, lockupTxid, input.fetcher) : undefined);
    if (!lockupTxHex) return { swapId: input.swapId, status: 'skipped', reason: 'No Liquid lockup transaction available.' };
    await markSwapLockupSeen({ swapId: input.swapId, lockupTxHex, lockupTxid });
    const payload = await decryptJson<RecoveryPayload>(existing.encryptedLocalBlob, config.terminalId);
    if (!payload.swap) return { swapId: input.swapId, status: 'failed', reason: 'Recovery record does not contain swap material.' };
    const destinationAddress = payload.settlement?.address ?? payload.swap.claimAddress;
    const claimTxHex = await buildBoltzLiquidReverseClaim({
      apiBase,
      swap: payload.swap,
      lockupTxHex,
      destinationAddress,
      feeSatPerVbyte: input.feeSatPerVbyte ?? existing.claimFeeSatPerVbyte,
      fetcher: input.fetcher
    });

    const now = input.now ?? Date.now();
    const claimable = await markSwapClaimable({ swapId: input.swapId, claimTxHex, now });
    if (claimable) await queueRecoveryRecordUpdate(config, claimable, now);
    await markSwapClaimBroadcastAttempt({ swapId: input.swapId, now, feeSatPerVbyte: input.feeSatPerVbyte });
    const txid = await broadcastLiquidTransaction(backend.url, claimTxHex, input.fetcher);
    await assertClaimBroadcastTxid(claimTxHex, txid, lockupTxid);
    const finished = await markSwapRecoveryFinished({ swapId: input.swapId, claimTxHex, claimTxid: txid, now });
    if (finished) await queueRecoveryRecordUpdate(config, finished, now);
    await settleRecoveredClaim(existing, txid, now);
    return { swapId: input.swapId, status: 'broadcast', txid };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Could not finish Liquid claim.';
    await markSwapClaimBroadcastFailed({ swapId: input.swapId, error: reason, now: input.now });
    return {
      swapId: input.swapId,
      status: 'failed',
      reason
    };
  }
}

export async function reconcileClaimBroadcasts(
  config: TerminalConfig,
  options: { fetcher?: Fetcher; now?: number; records?: SwapRecoveryRecord[]; rbfDelayMs?: number } = {}
): Promise<ClaimConfirmationResult[]> {
  const backend = primaryLiquidBackend(config);
  const records = (options.records ?? (await recoveryRecords())).filter(
    (record) => record.claimTxid && !record.claimConfirmedAt && record.status === 'claimed'
  );
  if (!backend) {
    return records.map((record) => ({ swapId: record.swapId, status: 'failed', reason: 'No Liquid backend configured.' }));
  }

  const now = options.now ?? Date.now();
  const rbfDelayMs = options.rbfDelayMs ?? 30 * 60_000;
  const results: ClaimConfirmationResult[] = [];
  for (const record of records) {
    try {
      await settleRecoveredClaim(record, record.claimTxid as string, record.claimBroadcastAt ?? now);
      const status = await fetchTransactionStatus(backend.url, record.claimTxid as string, options.fetcher);
      if (status.confirmed) {
        await markSwapClaimConfirmed({ swapId: record.swapId, now });
        results.push({ swapId: record.swapId, status: 'confirmed' });
        continue;
      }
      const broadcastAt = record.claimBroadcastAt ?? record.claimLastTriedAt ?? now;
      if (now - broadcastAt >= rbfDelayMs) {
        await markSwapClaimNeedsFeeBump({ swapId: record.swapId, now });
        results.push({ swapId: record.swapId, status: 'fee_bump_due' });
      } else {
        results.push({ swapId: record.swapId, status: 'unconfirmed' });
      }
    } catch (err) {
      results.push({
        swapId: record.swapId,
        status: 'failed',
        reason: err instanceof Error ? err.message : 'Could not verify claim transaction.'
      });
    }
  }
  return results;
}

export async function bumpFeeDueClaims(
  config: TerminalConfig,
  options: { fetcher?: Fetcher; now?: number; records?: SwapRecoveryRecord[] } = {}
): Promise<ClaimFeeBumpResult[]> {
  const backend = primaryLiquidBackend(config);
  const apiBase = primaryBoltzApiBase(config);
  const records = (options.records ?? (await recoveryRecords())).filter(
    (record) => record.claimNeedsFeeBump && record.claimTxid && !record.claimConfirmedAt
  );
  if (!backend) {
    return records.map((record) => ({ swapId: record.swapId, status: 'skipped', reason: 'No Liquid backend configured.' }));
  }
  if (!apiBase) {
    return records.map((record) => ({ swapId: record.swapId, status: 'skipped', reason: 'No Boltz provider configured.' }));
  }

  const now = options.now ?? Date.now();
  const results: ClaimFeeBumpResult[] = [];
  for (const record of records) {
    const nextFee = nextClaimFeeRate(record);
    try {
      const lockupTxHex =
        record.lockupTxHex ?? (record.lockupTxid ? await fetchTransactionHex(backend.url, record.lockupTxid, options.fetcher) : undefined);
      if (!lockupTxHex) {
        results.push({ swapId: record.swapId, status: 'skipped', reason: 'No Liquid lockup transaction available.' });
        continue;
      }
      if (!record.lockupTxHex) {
        await markSwapLockupSeen({ swapId: record.swapId, lockupTxHex, lockupTxid: record.lockupTxid });
      }

      const payload = await decryptJson<RecoveryPayload>(record.encryptedLocalBlob, config.terminalId);
      if (!payload.swap) {
        await markSwapClaimReplacementFailed({ swapId: record.swapId, error: 'Recovery record does not contain swap material.', now });
        results.push({ swapId: record.swapId, status: 'failed', reason: 'Recovery record does not contain swap material.' });
        continue;
      }
      const destinationAddress = payload.settlement?.address ?? payload.swap.claimAddress;
      const claimTxHex = await buildBoltzLiquidReverseClaim({
        apiBase,
        swap: payload.swap,
        lockupTxHex,
        destinationAddress,
        feeSatPerVbyte: nextFee,
        fetcher: options.fetcher
      });
      const prepared = await markSwapClaimReplacementPrepared({
        swapId: record.swapId,
        claimTxHex,
        feeSatPerVbyte: nextFee,
        now
      });
      if (!prepared) {
        results.push({ swapId: record.swapId, status: 'skipped', reason: 'No recovery record found.' });
        continue;
      }
      await queueRecoveryRecordUpdate(config, prepared, now);
      const [broadcast] = await broadcastPreparedClaims(config, { fetcher: options.fetcher, records: [prepared], now });
      results.push({ ...(broadcast ?? { swapId: record.swapId, status: 'skipped' as const }), feeSatPerVbyte: nextFee });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Could not bump claim fee.';
      await markSwapClaimReplacementFailed({ swapId: record.swapId, error: reason, now });
      results.push({ swapId: record.swapId, status: 'failed', reason, feeSatPerVbyte: nextFee });
    }
  }
  return results;
}
