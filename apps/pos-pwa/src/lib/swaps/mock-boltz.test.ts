import { describe, expect, it } from 'vitest';
import { MockBoltzReverseSwapProvider } from './mock-boltz';

describe('mock Boltz adapter', () => {
  it('creates and verifies reverse swaps', async () => {
    const provider = new MockBoltzReverseSwapProvider();
    const req = { saleId: 'sale1', invoiceSat: 25000, claimAddress: 'tex1qabc' };
    const swap = await provider.createReverseSwap(req);

    expect(swap.invoice).toContain('25000');
    expect(provider.verifySwap(swap, req)).toEqual({ ok: true });
    expect(provider.supportsClaimCovenants()).toBe(false);
  });

  it('rejects tampered claim addresses', async () => {
    const provider = new MockBoltzReverseSwapProvider();
    const req = { saleId: 'sale1', invoiceSat: 25000, claimAddress: 'tex1qabc' };
    const swap = await provider.createReverseSwap(req);

    expect(provider.verifySwap({ ...swap, claimAddress: 'tex1qattacker' }, req).ok).toBe(false);
  });
});
