import { describe, expect, it, vi } from 'vitest';
import { BoltzReverseSwapProvider } from './boltz';

describe('Boltz reverse swap adapter', () => {
  it('creates v2 Lightning to Liquid reverse swaps with locally held claim material', async () => {
    let randomCall = 0;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        invoiceAmount: 25000,
        to: 'L-BTC',
        from: 'BTC'
      });
      expect(body.preimageHash).toMatch(/^[0-9a-f]{64}$/);
      expect(body.claimPublicKey).toMatch(/^[0-9a-f]{66}$/);
      return new Response(
        JSON.stringify({
          id: 'swap1',
          invoice: 'lnbc25000n1demo',
          timeoutBlockHeight: 250,
          onchainAmount: 24850,
          refundPublicKey: '03'.padEnd(66, '0'),
          swapTree: { tree: [] }
        }),
        { status: 200 }
      );
    });
    const provider = new BoltzReverseSwapProvider({
      apiBase: 'https://api.boltz.exchange/',
      fetcher: fetcher as unknown as typeof fetch,
      randomBytes: (length) => new Uint8Array(length).fill(++randomCall)
    });

    const swap = await provider.createReverseSwap({
      saleId: 'sale1',
      invoiceSat: 25000,
      claimAddress: 'lq1claim'
    });

    expect(fetcher).toHaveBeenCalledWith('https://api.boltz.exchange/v2/swap/reverse', expect.any(Object));
    expect(swap).toMatchObject({
      id: 'swap1',
      invoice: 'lnbc25000n1demo',
      claimAddress: 'lq1claim',
      expectedAmountSat: 24850
    });
    expect(provider.verifySwap(swap, { saleId: 'sale1', invoiceSat: 25000, claimAddress: 'lq1claim' })).toEqual({ ok: true });
    expect(swap.preimage).toMatch(/^[0-9a-f]{64}$/);
    expect(swap.claimPrivateKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalizes status polling responses', async () => {
    const provider = new BoltzReverseSwapProvider({
      apiBase: 'https://api.boltz.exchange',
      fetcher: vi.fn(async () =>
        new Response(JSON.stringify({ status: 'transaction.mempool', transaction: { id: 'tx1', hex: '00' } }), { status: 200 })
      ) as unknown as typeof fetch
    });

    await expect(provider.getSwapStatus('swap1')).resolves.toBe('transaction.mempool');
    await expect(provider.getSwapStatusDetails('swap1')).resolves.toEqual({
      status: 'transaction.mempool',
      txid: 'tx1',
      transactionHex: '00'
    });
  });
});
