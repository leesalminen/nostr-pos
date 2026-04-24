export type SwapPair = 'BTC/L-BTC';

export type SwapLimits = {
  minSat: number;
  maxSat: number;
};

export type ReverseSwapRequest = {
  saleId: string;
  invoiceSat: number;
  claimAddress: string;
};

export type ReverseSwapResponse = {
  id: string;
  invoice: string;
  preimage?: string;
  preimageHash: string;
  claimPrivateKey?: string;
  claimPublicKey?: string;
  timeoutBlockHeight: number;
  claimAddress: string;
  expectedAmountSat: number;
  boltzResponse?: Record<string, unknown>;
};

export type SwapStatus =
  | 'created'
  | 'invoice.paid'
  | 'transaction.mempool'
  | 'transaction.confirmed'
  | 'transaction.claimed'
  | 'expired'
  | 'failed';

export type VerificationResult = {
  ok: boolean;
  reason?: string;
};

export interface SwapProvider {
  id: string;
  getLimits(pair: SwapPair): Promise<SwapLimits>;
  createReverseSwap(req: ReverseSwapRequest): Promise<ReverseSwapResponse>;
  getSwapStatus(id: string): Promise<SwapStatus>;
  verifySwap(response: ReverseSwapResponse, expected: ReverseSwapRequest): VerificationResult;
  supportsClaimCovenants(): boolean;
}
