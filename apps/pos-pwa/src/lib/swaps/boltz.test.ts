import { describe, expect, it, vi } from 'vitest';
import { BoltzReverseSwapProvider } from './boltz';

const validInvoice =
  'lnbc10u1p57hfy0pp5nhqtyrwlwh2ywscqx8ravrvw36jc3kjuyq0s0gtcc9y5xr92amcqdpz2djkuepqw3hjqnpdgf2yxgrpv3j8yetnwvcqzxrxqyp2xqsp5qvxl5mgzmdvc6c5fcy30dfmrerv3kew0z55ad6sd2pxjg6fgt2dq9qxpqysgq3kcxfthlplf7zjpa60wfejmrupdt02tq42k0c2dnmzfvfyklxnpkvm9z7l6sz8l653u836rtmyzk0yy2rjuyhvcwlgccew2txzxwa6sqfntvdj';
const validPaymentHash = '9dc0b20ddf75d447430031c7d60d8e8ea588da5c201f07a178c149430caaeef0';

describe('Boltz reverse swap adapter', () => {
  it('creates v2 Lightning to Liquid reverse swaps with locally held claim material', async () => {
    let randomCall = 0;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        invoiceAmount: 1000,
        to: 'L-BTC',
        from: 'BTC',
        description: 'Seguras Butcher sale sale1'
      });
      expect(body.preimageHash).toMatch(/^[0-9a-f]{64}$/);
      expect(body.claimPublicKey).toMatch(/^[0-9a-f]{66}$/);
      return new Response(
        JSON.stringify({
          id: 'swap1',
          invoice: validInvoice,
          timeoutBlockHeight: 250,
          onchainAmount: 970,
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
      invoiceSat: 1000,
      claimAddress: 'lq1claim',
      memo: 'Seguras Butcher sale sale1'
    });
    swap.preimageHash = validPaymentHash;

    expect(fetcher).toHaveBeenCalledWith('https://api.boltz.exchange/v2/swap/reverse', expect.any(Object));
    expect(swap).toMatchObject({
      id: 'swap1',
      invoice: validInvoice,
      claimAddress: 'lq1claim',
      expectedAmountSat: 970
    });
    expect(provider.verifySwap(swap, { saleId: 'sale1', invoiceSat: 1000, claimAddress: 'lq1claim' })).toEqual({ ok: true });
    expect(swap.preimage).toMatch(/^[0-9a-f]{64}$/);
    expect(swap.claimPrivateKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reads current v2 reverse swap limits', async () => {
    const provider = new BoltzReverseSwapProvider({
      apiBase: 'https://api.boltz.exchange',
      fetcher: vi.fn(async () =>
        new Response(
          JSON.stringify({
            BTC: {
              'L-BTC': {
                limits: { minimal: 100, maximal: 25000000 }
              }
            }
          }),
          { status: 200 }
        )
      ) as unknown as typeof fetch
    });

    await expect(provider.getLimits('BTC/L-BTC')).resolves.toEqual({
      minSat: 100,
      maxSat: 25000000
    });
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
