import { decryptJson } from '../db/crypto';
import { getRecoveryBySwap, recoveryRecords } from '../db/repositories/ledger';
import { broadcastLiquidTransaction, fetchTransactionHex } from '../liquid/esplora';
import { buildBoltzLiquidReverseClaim } from '../swaps/boltz-claim';
import { markSwapClaimable, markSwapRecoveryFinished } from './recovery-state';
import type { LiquidBackend, SwapRecoveryRecord, TerminalConfig } from './types';
import type { ReverseSwapResponse } from '../swaps/provider';

export type PreparedClaimResult = {
  swapId: string;
  status: 'broadcast' | 'skipped' | 'failed';
  txid?: string;
  reason?: string;
};

function primaryLiquidBackend(config: TerminalConfig): LiquidBackend | undefined {
  return config.authorization?.liquid_backends?.find((backend) => backend.type === 'esplora' && backend.url);
}

function primaryBoltzApiBase(config: TerminalConfig): string | undefined {
  return config.authorization?.swap_providers?.find((provider) => provider.type === 'boltz' && provider.api_base)?.api_base;
}

function preparedClaimRows(records: SwapRecoveryRecord[]): SwapRecoveryRecord[] {
  return records.filter((record) => record.status === 'claimable' && Boolean(record.claimTxHex));
}

export async function broadcastPreparedClaims(
  config: TerminalConfig,
  options: { fetcher?: typeof fetch; records?: SwapRecoveryRecord[] } = {}
): Promise<PreparedClaimResult[]> {
  const backend = primaryLiquidBackend(config);
  const records = preparedClaimRows(options.records ?? (await recoveryRecords()));

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
      const txid = await broadcastLiquidTransaction(backend.url, record.claimTxHex as string, options.fetcher);
      await markSwapRecoveryFinished({ swapId: record.swapId, claimTxHex: record.claimTxHex, claimTxid: txid });
      results.push({ swapId: record.swapId, status: 'broadcast', txid });
    } catch (err) {
      results.push({
        swapId: record.swapId,
        status: 'failed',
        reason: err instanceof Error ? err.message : 'Could not broadcast claim.'
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
  input: { swapId: string; lockupTxHex?: string; lockupTxid?: string; fetcher?: typeof fetch }
): Promise<PreparedClaimResult> {
  const backend = primaryLiquidBackend(config);
  if (!backend) return { swapId: input.swapId, status: 'skipped', reason: 'No Liquid backend configured.' };

  const existing = await getRecoveryBySwap(input.swapId);
  if (!existing) return { swapId: input.swapId, status: 'skipped', reason: 'No recovery record found.' };
  if (existing.claimTxHex) {
    const [result] = await broadcastPreparedClaims(config, { fetcher: input.fetcher, records: [existing] });
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
      fetcher: input.fetcher
    });

    await markSwapClaimable({ swapId: input.swapId, claimTxHex });
    const txid = await broadcastLiquidTransaction(backend.url, claimTxHex, input.fetcher);
    await markSwapRecoveryFinished({ swapId: input.swapId, claimTxHex, claimTxid: txid });
    return { swapId: input.swapId, status: 'broadcast', txid };
  } catch (err) {
    return {
      swapId: input.swapId,
      status: 'failed',
      reason: err instanceof Error ? err.message : 'Could not finish Liquid claim.'
    };
  }
}
