import { describe, expect, it } from 'vitest';
import { buildBoltzLiquidReverseClaim } from './boltz-claim';

describe('Boltz Liquid claim builder', () => {
  it('requires locally saved preimage and claim key material', async () => {
    await expect(
      buildBoltzLiquidReverseClaim({
        apiBase: 'https://boltz.example',
        lockupTxHex: '00',
        destinationAddress: 'lq1destination',
        swap: {
          id: 'swap1',
          invoice: 'lnbc1',
          preimageHash: '11'.repeat(32),
          timeoutBlockHeight: 500,
          claimAddress: 'lq1destination',
          expectedAmountSat: 1000,
          boltzResponse: {}
        }
      })
    ).rejects.toThrow('Boltz swap missing preimage.');
  });
});
