import { describe, expect, it, vi } from 'vitest';
import { invoiceAmountMsat, normalizeLnurlPayload, requestLnurlWithdraw } from './lnurl';

describe('LNURL withdraw', () => {
  it('normalizes lightning-prefixed payloads', () => {
    expect(normalizeLnurlPayload('lightning:https://card.example/lnurl')).toBe('https://card.example/lnurl');
  });

  it('decodes invoice amount prefixes', () => {
    expect(invoiceAmountMsat('lnbc25000n1demo')).toBe(2_500_000);
  });

  it('calls withdraw callback with k1 and invoice', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          callback: 'https://card.example/callback',
          k1: 'abc',
          minWithdrawable: 1,
          maxWithdrawable: 10_000_000
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'OK' }) });

    await requestLnurlWithdraw('https://card.example/lnurl', 'lnbc25000n1demo', fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain('k1=abc');
    expect(String(fetcher.mock.calls[1][0])).toContain('pr=lnbc25000n1demo');
  });
});
