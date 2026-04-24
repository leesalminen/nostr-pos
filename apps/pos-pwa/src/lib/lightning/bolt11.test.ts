import { bech32 } from 'bech32';
import { describe, expect, it } from 'vitest';
import { normalizeBolt11Invoice } from './bolt11';

function validInvoiceLike(prefix = 'lnbc1560n'): string {
  return bech32.encode(prefix, [1, 2, 3, 4, 5], 5000);
}

describe('Bolt11 invoice normalization', () => {
  it('accepts bech32 Lightning invoices with optional lightning scheme', () => {
    const invoice = validInvoiceLike();
    expect(normalizeBolt11Invoice(invoice)).toBe(invoice);
    expect(normalizeBolt11Invoice(`lightning:${invoice}`)).toBe(invoice);
  });

  it('rejects synthetic UI placeholders that are not checksummed invoices', () => {
    expect(normalizeBolt11Invoice('lnbc1560n1p01kq03dncs73fryh7a8v3wwyszlightning')).toBeUndefined();
  });
});
