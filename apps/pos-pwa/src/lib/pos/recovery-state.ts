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
    claimTxid: input.claimTxid ?? record.claimTxid
  };
  await putRecovery(next);
  return next;
}

export async function markSwapRecoveryFinished(input: {
  swapId: string;
  claimTxHex?: string;
  claimTxid?: string;
}): Promise<SwapRecoveryRecord | undefined> {
  const record = await getRecoveryBySwap(input.swapId);
  if (!record) return undefined;
  const next: SwapRecoveryRecord = {
    ...record,
    status: 'claimed',
    claimTxHex: input.claimTxHex ?? record.claimTxHex,
    claimTxid: input.claimTxid ?? record.claimTxid
  };
  await putRecovery(next);
  return next;
}
