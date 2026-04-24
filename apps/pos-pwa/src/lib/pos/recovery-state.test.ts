import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SwapRecoveryRecord } from './types';

const recoveries = new Map<string, SwapRecoveryRecord>();
const txid = 'a'.repeat(64);
const lockupTxid = 'b'.repeat(64);

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

    await markSwapClaimable({ swapId: 'swap1', claimTxHex: '00', claimTxid: txid, now: 50 });

    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimable',
      encryptedLocalBlob: 'ciphertext',
      claimTxHex: '00',
      claimPreparedAt: 50,
      claimTxid: txid
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

    await markSwapRecoveryFinished({ swapId: 'swap1', claimTxHex: '00', claimTxid: txid, now: 70 });

    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimed',
      claimTxHex: '00',
      claimTxid: txid,
      claimLastTriedAt: 70,
      claimBroadcastAt: 70
    });
  });

  it('rejects synthetic claim txids when marking recovery finished', async () => {
    const { markSwapRecoveryFinished } = await import('./recovery-state');

    await markSwapRecoveryFinished({ swapId: 'swap1', claimTxHex: '00', claimTxid: 'claim_swap1', now: 70 });

    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimable',
      claimTxid: undefined,
      claimLastError: 'Claim broadcast did not return a Liquid transaction id.'
    });
  });

  it('does not mark recovery claimed without a Liquid claim txid', async () => {
    const { markSwapRecoveryFinished } = await import('./recovery-state');

    await markSwapRecoveryFinished({ swapId: 'swap1', claimTxHex: '00', now: 70 });

    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimable',
      claimTxHex: '00',
      claimTxid: undefined,
      claimLastError: 'Claim broadcast did not return a Liquid transaction id.'
    });
  });

  it('does not mark recovery claimed when the returned txid is the lockup txid', async () => {
    const { markSwapLockupSeen, markSwapRecoveryFinished } = await import('./recovery-state');

    await markSwapLockupSeen({ swapId: 'swap1', lockupTxid, lockupTxHex: 'lockuphex' });
    await markSwapRecoveryFinished({ swapId: 'swap1', claimTxHex: '00', claimTxid: lockupTxid, now: 70 });

    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimable',
      claimTxHex: '00',
      claimTxid: undefined,
      claimLastError: 'Claim broadcast returned the lockup transaction id, not the claim transaction id.'
    });
  });

  it('does not confirm recovery rows whose claim txid matches the lockup txid', async () => {
    const { markSwapClaimConfirmed } = await import('./recovery-state');
    recoveries.set('swap1', {
      ...recoveries.get('swap1')!,
      status: 'claimed',
      lockupTxid,
      claimTxHex: '00',
      claimTxid: lockupTxid
    });

    await markSwapClaimConfirmed({ swapId: 'swap1', now: 80 });

    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimable',
      claimTxid: undefined,
      claimConfirmedAt: undefined,
      claimLastError: 'Claim confirmation is impossible without a distinct Liquid claim transaction id.'
    });
  });

  it('stores the lockup transaction and prepares replacement claims without losing old tx audit', async () => {
    const { markSwapClaimReplacementPrepared, markSwapLockupSeen, markSwapRecoveryFinished } = await import('./recovery-state');

    await markSwapLockupSeen({ swapId: 'swap1', lockupTxid: 'lockup1', lockupTxHex: 'lockuphex' });
    await markSwapRecoveryFinished({ swapId: 'swap1', claimTxHex: 'oldhex', claimTxid: txid, now: 70 });
    await markSwapClaimReplacementPrepared({ swapId: 'swap1', claimTxHex: 'newhex', feeSatPerVbyte: 0.3, now: 250 });

    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimable',
      lockupTxid: 'lockup1',
      lockupTxHex: 'lockuphex',
      claimTxHex: 'newhex',
      claimTxid: txid,
      replacedClaimTxids: [txid],
      claimPreparedAt: 250,
      claimFeeSatPerVbyte: 0.3,
      claimRbfCount: 1,
      claimNeedsFeeBump: false
    });
  });

  it('keeps the old claim observable when a replacement broadcast fails', async () => {
    const { markSwapClaimBroadcastFailed, markSwapClaimReplacementPrepared, markSwapRecoveryFinished } = await import('./recovery-state');

    await markSwapRecoveryFinished({ swapId: 'swap1', claimTxHex: 'oldhex', claimTxid: txid, now: 70 });
    await markSwapClaimReplacementPrepared({ swapId: 'swap1', claimTxHex: 'newhex', feeSatPerVbyte: 0.3, now: 250 });
    await markSwapClaimBroadcastFailed({ swapId: 'swap1', error: 'rejected replacement', now: 251 });

    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimed',
      claimTxid: txid,
      claimTxHex: 'newhex',
      claimNeedsFeeBump: true,
      claimLastError: 'rejected replacement'
    });
  });

  it('flags stale unconfirmed claims for fee bump and clears flag on confirmation', async () => {
    const { markSwapClaimNeedsFeeBump, markSwapClaimConfirmed, markSwapRecoveryFinished } = await import('./recovery-state');

    await markSwapRecoveryFinished({ swapId: 'swap1', claimTxHex: '00', claimTxid: txid, now: 70 });
    await markSwapClaimNeedsFeeBump({ swapId: 'swap1', now: 200 });

    expect(recoveries.get('swap1')).toMatchObject({
      claimNeedsFeeBump: true,
      claimLastTriedAt: 200
    });

    await markSwapClaimConfirmed({ swapId: 'swap1', now: 300 });
    expect(recoveries.get('swap1')).toMatchObject({
      claimConfirmedAt: 300,
      claimNeedsFeeBump: false
    });
  });
});
