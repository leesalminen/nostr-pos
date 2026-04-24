import { describe, expect, it, vi } from 'vitest';
import { broadcastLiquidTransaction, fetchAddressTransactions, fetchTransactionHex, verifyAddressPayment } from './esplora';

describe('Liquid Esplora adapter', () => {
  it('fetches address transactions', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => [{ txid: 'tx1', vout: [] }]
    }));

    await expect(fetchAddressTransactions('https://example.test/api/', 'tex1qabc', fetcher as unknown as typeof fetch)).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith('https://example.test/api/address/tex1qabc/txs');
  });

  it('broadcasts a raw Liquid transaction', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => 'txid1\n'
    }));

    await expect(broadcastLiquidTransaction('https://example.test/api/', '02000000', fetcher as unknown as typeof fetch)).resolves.toBe(
      'txid1'
    );
    expect(fetcher).toHaveBeenCalledWith('https://example.test/api/tx', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '02000000'
    });
  });

  it('fetches transaction hex by txid', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => '02000000\n'
    }));

    await expect(fetchTransactionHex('https://example.test/api/', 'txid1', fetcher as unknown as typeof fetch)).resolves.toBe('02000000');
    expect(fetcher).toHaveBeenCalledWith('https://example.test/api/tx/txid1/hex');
  });

  it('surfaces failed broadcasts as retryable errors', async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      text: async () => 'bad tx'
    }));

    await expect(broadcastLiquidTransaction('https://example.test/api', '02000000', fetcher as unknown as typeof fetch)).rejects.toThrow(
      "Can't broadcast the Liquid claim right now."
    );
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
