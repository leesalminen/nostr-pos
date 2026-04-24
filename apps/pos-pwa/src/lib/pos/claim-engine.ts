import { broadcastLiquidTransaction } from '../liquid/esplora';
import { recoveryRecords } from '../db/repositories/ledger';
import { markSwapRecoveryFinished } from './recovery-state';
import type { LiquidBackend, SwapRecoveryRecord, TerminalConfig } from './types';

export type PreparedClaimResult = {
  swapId: string;
  status: 'broadcast' | 'skipped' | 'failed';
  txid?: string;
  reason?: string;
};

function primaryLiquidBackend(config: TerminalConfig): LiquidBackend | undefined {
  return config.authorization?.liquid_backends?.find((backend) => backend.type === 'esplora' && backend.url);
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
