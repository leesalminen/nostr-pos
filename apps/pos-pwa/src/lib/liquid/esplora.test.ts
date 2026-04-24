import { describe, expect, it, vi } from 'vitest';
import { fetchAddressTransactions, verifyAddressPayment } from './esplora';

describe('Liquid Esplora adapter', () => {
  it('fetches address transactions', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => [{ txid: 'tx1', vout: [] }]
    }));

    await expect(fetchAddressTransactions('https://example.test/api/', 'tex1qabc', fetcher as unknown as typeof fetch)).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith('https://example.test/api/address/tex1qabc/txs');
  });

  it('verifies sufficient address payment', () => {
    const result = verifyAddressPayment(
      [
        {
          txid: 'tx1',
          status: { confirmed: false },
          vout: [{ scriptpubkey_address: 'tex1qabc', value: 12_000 }]
        },
        {
          txid: 'tx2',
          status: { confirmed: true },
          vout: [{ scriptpubkey_address: 'tex1qabc', value: 13_000 }]
        }
      ],
      'tex1qabc',
      25_000
    );

    expect(result).toEqual({ detected: true, confirmed: true, receivedSat: 25_000, txid: 'tx1' });
  });
});
