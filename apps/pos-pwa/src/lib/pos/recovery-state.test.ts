import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SwapRecoveryRecord } from './types';

const recoveries = new Map<string, SwapRecoveryRecord>();

vi.mock('../db/repositories/ledger', () => ({
  getRecoveryBySwap: vi.fn((swapId: string) => recoveries.get(swapId)),
  putRecovery: vi.fn((record: SwapRecoveryRecord) => recoveries.set(record.swapId, record))
}));

describe('swap recovery state', () => {
  beforeEach(() => {
    recoveries.clear();
    recoveries.set('swap1', {
      saleId: 'sale1',
      paymentAttemptId: 'attempt1',
      swapId: 'swap1',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: [],
      expiresAt: 1000,
      status: 'pending'
    });
  });

  it('marks a pending recovery as claimable without losing saved material', async () => {
    const { markSwapClaimable } = await import('./recovery-state');

    await markSwapClaimable({ swapId: 'swap1', claimTxHex: '00', claimTxid: 'tx1', now: 50 });

    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimable',
      encryptedLocalBlob: 'ciphertext',
      claimTxHex: '00',
      claimPreparedAt: 50,
      claimTxid: 'tx1'
    });
  });

  it('tracks claim broadcast attempts and failed retries', async () => {
    const { markSwapClaimBroadcastAttempt, markSwapClaimBroadcastFailed } = await import('./recovery-state');

    await markSwapClaimBroadcastAttempt({ swapId: 'swap1', now: 60, feeSatPerVbyte: 0.2 });
    await markSwapClaimBroadcastFailed({ swapId: 'swap1', error: 'backend rejected tx', now: 61 });

    expect(recoveries.get('swap1')).toMatchObject({
      status: 'failed',
      claimBroadcastAttempts: 1,
      claimLastTriedAt: 61,
      claimFeeSatPerVbyte: 0.2,
      claimLastError: 'backend rejected tx'
    });
  });

  it('marks recovery finished once a claim is observed', async () => {
    const { markSwapRecoveryFinished } = await import('./recovery-state');

    await markSwapRecoveryFinished({ swapId: 'swap1', claimTxHex: '00', claimTxid: 'tx1', now: 70 });

    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimed',
      claimTxHex: '00',
      claimTxid: 'tx1',
      claimLastTriedAt: 70
    });
  });
});
