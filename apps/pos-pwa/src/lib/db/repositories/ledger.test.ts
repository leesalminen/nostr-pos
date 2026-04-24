import { describe, expect, it } from 'vitest';
import { normalizedRecoveryRecord } from './ledger';
import type { SwapRecoveryRecord } from '../../pos/types';

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
});
