import type { ReverseSwapRequest, ReverseSwapResponse, SwapLimits, SwapPair, SwapProvider, SwapStatus, VerificationResult } from './provider';

export class MockBoltzReverseSwapProvider implements SwapProvider {
  id = 'mock-boltz';

  async getLimits(_pair: SwapPair): Promise<SwapLimits> {
    return { minSat: 1000, maxSat: 100000 };
  }

  async createReverseSwap(req: ReverseSwapRequest): Promise<ReverseSwapResponse> {
    const id = `swap_${req.saleId.toLowerCase()}`;
    return {
      id,
      invoice: `lnbc${req.invoiceSat}n1p${req.saleId.toLowerCase()}`,
      preimageHash: req.saleId.toLowerCase().padEnd(64, '0').slice(0, 64),
      timeoutBlockHeight: 250,
      claimAddress: req.claimAddress,
      expectedAmountSat: Math.max(0, req.invoiceSat - 150)
    };
  }

  async getSwapStatus(_id: string): Promise<SwapStatus> {
    return 'created';
  }

  verifySwap(response: ReverseSwapResponse, expected: ReverseSwapRequest): VerificationResult {
    if (response.claimAddress !== expected.claimAddress) return { ok: false, reason: 'claim address mismatch' };
    if (!response.invoice.includes(String(expected.invoiceSat))) return { ok: false, reason: 'invoice amount mismatch' };
    if (response.timeoutBlockHeight < 10) return { ok: false, reason: 'timeout too short' };
    return { ok: true };
  }

  supportsClaimCovenants(): boolean {
    return false;
  }
}
