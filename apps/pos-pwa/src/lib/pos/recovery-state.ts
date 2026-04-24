import { getRecoveryBySwap, putRecovery } from '../db/repositories/ledger';
import type { SwapRecoveryRecord } from './types';

export async function markSwapClaimable(input: {
  swapId: string;
  claimTxHex?: string;
  claimTxid?: string;
  now?: number;
}): Promise<SwapRecoveryRecord | undefined> {
  const record = await getRecoveryBySwap(input.swapId);
  if (!record || record.status === 'claimed') return record;
  const next: SwapRecoveryRecord = {
    ...record,
    status: 'claimable',
    claimTxHex: input.claimTxHex ?? record.claimTxHex,
    claimTxid: input.claimTxid ?? record.claimTxid,
    claimPreparedAt: input.claimTxHex && input.claimTxHex !== record.claimTxHex ? (input.now ?? Date.now()) : record.claimPreparedAt,
    claimLastError: undefined
  };
  await putRecovery(next);
  return next;
}

export async function markSwapLockupSeen(input: {
  swapId: string;
  lockupTxid?: string;
  lockupTxHex?: string;
}): Promise<SwapRecoveryRecord | undefined> {
  const record = await getRecoveryBySwap(input.swapId);
  if (!record) return undefined;
  const next: SwapRecoveryRecord = {
    ...record,
    lockupTxid: input.lockupTxid ?? record.lockupTxid,
    lockupTxHex: input.lockupTxHex ?? record.lockupTxHex
  };
  await putRecovery(next);
  return next;
}

export async function markSwapClaimBroadcastAttempt(input: {
  swapId: string;
  now?: number;
  feeSatPerVbyte?: number;
}): Promise<SwapRecoveryRecord | undefined> {
  const record = await getRecoveryBySwap(input.swapId);
  if (!record || record.status === 'claimed') return record;
  const next: SwapRecoveryRecord = {
    ...record,
    claimBroadcastAttempts: (record.claimBroadcastAttempts ?? 0) + 1,
    claimLastTriedAt: input.now ?? Date.now(),
    claimFeeSatPerVbyte: input.feeSatPerVbyte ?? record.claimFeeSatPerVbyte,
    claimLastError: undefined
  };
  await putRecovery(next);
  return next;
}

export async function markSwapClaimBroadcastFailed(input: {
  swapId: string;
  error: string;
  now?: number;
}): Promise<SwapRecoveryRecord | undefined> {
  const record = await getRecoveryBySwap(input.swapId);
  if (!record || record.status === 'claimed') return record;
  const replacementRetry = Boolean(record.claimTxid && record.replacedClaimTxids?.includes(record.claimTxid));
  const next: SwapRecoveryRecord = {
    ...record,
    status: replacementRetry ? 'claimed' : 'failed',
    claimLastTriedAt: input.now ?? Date.now(),
    claimNeedsFeeBump: replacementRetry ? true : record.claimNeedsFeeBump,
    claimLastError: input.error
  };
  await putRecovery(next);
  return next;
}

export async function markSwapClaimReplacementFailed(input: {
  swapId: string;
  error: string;
  now?: number;
}): Promise<SwapRecoveryRecord | undefined> {
  const record = await getRecoveryBySwap(input.swapId);
  if (!record) return undefined;
  const next: SwapRecoveryRecord = {
    ...record,
    status: record.claimTxid ? 'claimed' : 'failed',
    claimNeedsFeeBump: Boolean(record.claimTxid),
    claimLastTriedAt: input.now ?? Date.now(),
    claimLastError: input.error
  };
  await putRecovery(next);
  return next;
}

export async function markSwapClaimNeedsFeeBump(input: {
  swapId: string;
  now?: number;
}): Promise<SwapRecoveryRecord | undefined> {
  const record = await getRecoveryBySwap(input.swapId);
  if (!record || record.status !== 'claimed' || record.claimConfirmedAt) return record;
  const next: SwapRecoveryRecord = {
    ...record,
    claimNeedsFeeBump: true,
    claimLastTriedAt: input.now ?? record.claimLastTriedAt
  };
  await putRecovery(next);
  return next;
}

export async function markSwapClaimReplacementPrepared(input: {
  swapId: string;
  claimTxHex: string;
  feeSatPerVbyte: number;
  now?: number;
}): Promise<SwapRecoveryRecord | undefined> {
  const record = await getRecoveryBySwap(input.swapId);
  if (!record || record.claimConfirmedAt) return record;
  const replacedClaimTxids = record.claimTxid
    ? Array.from(new Set([...(record.replacedClaimTxids ?? []), record.claimTxid]))
    : record.replacedClaimTxids;
  const now = input.now ?? Date.now();
  const next: SwapRecoveryRecord = {
    ...record,
    status: 'claimable',
    claimTxHex: input.claimTxHex,
    claimTxid: record.claimTxid,
    replacedClaimTxids,
    claimPreparedAt: now,
    claimFeeSatPerVbyte: input.feeSatPerVbyte,
    claimRbfCount: (record.claimRbfCount ?? 0) + 1,
    claimNeedsFeeBump: false,
    claimConfirmedAt: undefined,
    claimLastError: undefined
  };
  await putRecovery(next);
  return next;
}

export async function markSwapClaimConfirmed(input: {
  swapId: string;
  now?: number;
}): Promise<SwapRecoveryRecord | undefined> {
  const record = await getRecoveryBySwap(input.swapId);
  if (!record) return undefined;
  const next: SwapRecoveryRecord = {
    ...record,
    status: 'claimed',
    claimConfirmedAt: input.now ?? Date.now(),
    claimNeedsFeeBump: false,
    claimLastError: undefined
  };
  await putRecovery(next);
  return next;
}

export async function markSwapRecoveryFinished(input: {
  swapId: string;
  claimTxHex?: string;
  claimTxid?: string;
  now?: number;
}): Promise<SwapRecoveryRecord | undefined> {
  const record = await getRecoveryBySwap(input.swapId);
  if (!record) return undefined;
  const claimTxid = input.claimTxid ?? record.claimTxid;
  const claimTxHex = input.claimTxHex ?? record.claimTxHex;
  const next: SwapRecoveryRecord = {
    ...record,
    status: claimTxid ? 'claimed' : claimTxHex ? 'claimable' : 'failed',
    claimTxHex,
    claimTxid,
    claimLastTriedAt: input.now ?? Date.now(),
    claimBroadcastAt: claimTxid && input.claimTxid ? (input.now ?? Date.now()) : record.claimBroadcastAt,
    claimNeedsFeeBump: false,
    claimLastError: claimTxid ? undefined : 'Claim broadcast did not return a Liquid transaction id.'
  };
  await putRecovery(next);
  return next;
}
