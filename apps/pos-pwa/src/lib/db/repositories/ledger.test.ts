import { describe, expect, it } from 'vitest';
import { normalizedRecoveryRecord } from './ledger';
import type { SwapRecoveryRecord } from '../../pos/types';

const lockupTxid = 'a'.repeat(64);

describe('ledger recovery normalization', () => {
  it('repairs claimed recovery rows that have no Liquid claim txid', () => {
    const record: SwapRecoveryRecord = {
      saleId: 'sale1',
      paymentAttemptId: 'attempt1',
      swapId: 'swap1',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: [],
      expiresAt: 1000,
      claimTxHex: 'claimhex',
      status: 'claimed'
    };

    expect(normalizedRecoveryRecord(record)).toMatchObject({
      status: 'claimable',
      claimTxHex: 'claimhex',
      claimLastError: 'Claim was marked without a Liquid transaction id. Retry claim broadcast.'
    });
  });

  it('repairs claimed recovery rows with synthetic claim txids or confirmations', () => {
    const record: SwapRecoveryRecord = {
      saleId: 'sale1',
      paymentAttemptId: 'attempt1',
      swapId: 'swap1',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: [],
      expiresAt: 1000,
      claimTxHex: 'claimhex',
      claimTxid: 'claim_swap1',
      claimConfirmedAt: 2000,
      status: 'claimed'
    };

    expect(normalizedRecoveryRecord(record)).toMatchObject({
      status: 'claimable',
      claimTxid: undefined,
      claimConfirmedAt: undefined
    });
  });

  it('repairs claimed recovery rows whose claim txid is actually the lockup txid', () => {
    const record: SwapRecoveryRecord = {
      saleId: 'sale1',
      paymentAttemptId: 'attempt1',
      swapId: 'swap1',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: [],
      expiresAt: 1000,
      lockupTxid,
      claimTxHex: 'claimhex',
      claimTxid: lockupTxid,
      claimConfirmedAt: 2000,
      status: 'claimed'
    };

    expect(normalizedRecoveryRecord(record)).toMatchObject({
      status: 'claimable',
      claimTxid: undefined,
      claimConfirmedAt: undefined,
      claimLastError: 'Claim txid matches the lockup txid. Retry claim broadcast.'
    });
  });
});
