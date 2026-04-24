import { bech32 } from 'bech32';
import { describe, expect, it } from 'vitest';
import { decodeBolt11Invoice, normalizeBolt11Invoice } from './bolt11';

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

  it('decodes Bolt11 amount and payment hash', () => {
    const invoice =
      'lnbc10u1p57hfy0pp5nhqtyrwlwh2ywscqx8ravrvw36jc3kjuyq0s0gtcc9y5xr92amcqdpz2djkuepqw3hjqnpdgf2yxgrpv3j8yetnwvcqzxrxqyp2xqsp5qvxl5mgzmdvc6c5fcy30dfmrerv3kew0z55ad6sd2pxjg6fgt2dq9qxpqysgq3kcxfthlplf7zjpa60wfejmrupdt02tq42k0c2dnmzfvfyklxnpkvm9z7l6sz8l653u836rtmyzk0yy2rjuyhvcwlgccew2txzxwa6sqfntvdj';

    expect(decodeBolt11Invoice(invoice)).toMatchObject({
      amountSat: 1000,
      paymentHash: '9dc0b20ddf75d447430031c7d60d8e8ea588da5c201f07a178c149430caaeef0'
    });
  });
});
