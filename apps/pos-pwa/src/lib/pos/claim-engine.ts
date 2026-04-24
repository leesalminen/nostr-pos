import { decryptJson } from '../db/crypto';
import { getAttempt, getRecoveryBySwap, getSale, recoveryRecords } from '../db/repositories/ledger';
import { broadcastLiquidTransaction, fetchTransactionHex, fetchTransactionStatus } from '../liquid/esplora';
import { buildBoltzLiquidReverseClaim } from '../swaps/boltz-claim';
import {
  markSwapClaimable,
  markSwapClaimBroadcastAttempt,
  markSwapClaimBroadcastFailed,
  markSwapClaimConfirmed,
  markSwapClaimNeedsFeeBump,
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

function primaryLiquidBackend(config: TerminalConfig): LiquidBackend | undefined {
  return config.authorization?.liquid_backends?.find((backend) => backend.type === 'esplora' && backend.url);
}

function primaryBoltzApiBase(config: TerminalConfig): string | undefined {
  return config.authorization?.swap_providers?.find((provider) => provider.type === 'boltz' && provider.api_base)?.api_base;
}

function preparedClaimRows(records: SwapRecoveryRecord[]): SwapRecoveryRecord[] {
  return records.filter((record) => ['claimable', 'failed'].includes(record.status) && Boolean(record.claimTxHex));
}

async function settleRecoveredClaim(record: SwapRecoveryRecord, txid: string, settledAt = Date.now()): Promise<void> {
  const sale = await getSale(record.saleId);
  const attempt = await getAttempt(record.paymentAttemptId);
  if (!sale || !attempt || attempt.status === 'settled') return;
  await settleAttempt({ sale, attempt, txid, settledAt });
}

export async function broadcastPreparedClaims(
  config: TerminalConfig,
  options: { fetcher?: typeof fetch; records?: SwapRecoveryRecord[]; now?: number } = {}
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
      await markSwapClaimBroadcastAttempt({ swapId: record.swapId, now, feeSatPerVbyte: record.claimFeeSatPerVbyte });
      const txid = await broadcastLiquidTransaction(backend.url, record.claimTxHex as string, options.fetcher);
      await markSwapRecoveryFinished({ swapId: record.swapId, claimTxHex: record.claimTxHex, claimTxid: txid, now });
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

type RecoveryPayload = {
  settlement?: { address?: string };
  swap?: ReverseSwapResponse;
};

export async function claimLiquidReverseSwap(
  config: TerminalConfig,
  input: { swapId: string; lockupTxHex?: string; lockupTxid?: string; fetcher?: typeof fetch; now?: number; feeSatPerVbyte?: number }
): Promise<PreparedClaimResult> {
  const backend = primaryLiquidBackend(config);
  if (!backend) return { swapId: input.swapId, status: 'skipped', reason: 'No Liquid backend configured.' };

  const existing = await getRecoveryBySwap(input.swapId);
  if (!existing) return { swapId: input.swapId, status: 'skipped', reason: 'No recovery record found.' };
  if (existing.claimTxHex) {
    const [result] = await broadcastPreparedClaims(config, { fetcher: input.fetcher, records: [existing], now: input.now });
    return result ?? { swapId: input.swapId, status: 'skipped', reason: 'No prepared claim transaction is ready.' };
  }

  const apiBase = primaryBoltzApiBase(config);
  if (!apiBase) return { swapId: input.swapId, status: 'skipped', reason: 'No Boltz provider configured.' };

  try {
    const lockupTxHex = input.lockupTxHex ?? (input.lockupTxid ? await fetchTransactionHex(backend.url, input.lockupTxid, input.fetcher) : undefined);
    if (!lockupTxHex) return { swapId: input.swapId, status: 'skipped', reason: 'No Liquid lockup transaction available.' };
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
    await markSwapClaimable({ swapId: input.swapId, claimTxHex, now });
    await markSwapClaimBroadcastAttempt({ swapId: input.swapId, now, feeSatPerVbyte: input.feeSatPerVbyte });
    const txid = await broadcastLiquidTransaction(backend.url, claimTxHex, input.fetcher);
    await markSwapRecoveryFinished({ swapId: input.swapId, claimTxHex, claimTxid: txid, now });
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
  options: { fetcher?: typeof fetch; now?: number; records?: SwapRecoveryRecord[]; rbfDelayMs?: number } = {}
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
