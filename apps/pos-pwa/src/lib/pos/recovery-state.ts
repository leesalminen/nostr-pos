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
  const next: SwapRecoveryRecord = {
    ...record,
    status: 'failed',
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
  const next: SwapRecoveryRecord = {
    ...record,
    status: 'claimed',
    claimTxHex: input.claimTxHex ?? record.claimTxHex,
    claimTxid: input.claimTxid ?? record.claimTxid,
    claimLastTriedAt: input.now ?? Date.now(),
    claimBroadcastAt: input.claimTxid ? (input.now ?? Date.now()) : record.claimBroadcastAt,
    claimNeedsFeeBump: false,
    claimLastError: undefined
  };
  await putRecovery(next);
  return next;
}
