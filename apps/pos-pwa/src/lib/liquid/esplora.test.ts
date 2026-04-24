import { describe, expect, it, vi } from 'vitest';
import {
  broadcastLiquidTransaction,
  fetchAddressTransactions,
  fetchTransactionHex,
  fetchTransactionStatus,
  verifyConfidentialAddressPayment,
  verifyAddressPayment
} from './esplora';

vi.mock('lwk_wasm', () => {
  class Address {
    value: string;
    constructor(value: string) {
      this.value = value;
    }
    isMainnet() {
      return true;
    }
    toUnconfidential() {
      return new Address(this.value === 'lq1qqconfidential' ? 'ex1qtarget' : this.value);
    }
    toString() {
      return this.value;
    }
  }
  class Network {
    static mainnet() {
      return new Network();
    }
    static testnet() {
      return new Network();
    }
    policyAsset() {
      return { toString: () => 'policy-asset' };
    }
  }
  class WolletDescriptor {
    constructor(_descriptor: string) {}
  }
  class Transaction {
    static fromString(_hex: string) {
      return new Transaction();
    }
  }
  class Wollet {
    constructor(_network: Network, _descriptor: WolletDescriptor) {}
    address(_index: number) {
      return { address: () => new Address('lq1qqconfidential') };
    }
    applyTransaction(_tx: Transaction) {}
    transactions() {
      return [
        {
          txid: () => ({ toString: () => 'confidentialtx' }),
          outputs: () => [
            {
              get: () => ({
                wildcardIndex: () => 7,
                address: () => new Address('lq1qqconfidential'),
                outpoint: () => ({
                  txid: () => ({ toString: () => 'confidentialtx' }),
                  vout: () => 0
                }),
                height: () => 123,
                unblinded: () => ({
                  asset: () => ({ toString: () => 'policy-asset' }),
                  value: () => BigInt(25_000)
                })
              })
            }
          ],
          inputs: () => []
        },
        {
          txid: () => ({ toString: () => 'receivetx' }),
          outputs: () => [
            {
              get: () => ({
                wildcardIndex: () => 7,
                address: () => new Address('lq1qqconfidential'),
                outpoint: () => ({
                  txid: () => ({ toString: () => 'receivetx' }),
                  vout: () => 1
                }),
                height: () => undefined,
                unblinded: () => ({
                  asset: () => ({ toString: () => 'policy-asset' }),
                  value: () => BigInt(25_000)
                })
              })
            }
          ],
          inputs: () => []
        },
        {
          txid: () => ({ toString: () => 'spendtx' }),
          outputs: () => [],
          inputs: () => [
            {
              get: () => ({
                wildcardIndex: () => 7,
                address: () => new Address('lq1qqconfidential'),
                outpoint: () => ({
                  txid: () => ({ toString: () => 'receivetx' }),
                  vout: () => 1
                }),
                height: () => 456,
                unblinded: () => ({
                  asset: () => ({ toString: () => 'policy-asset' }),
                  value: () => BigInt(25_000)
                })
              })
            }
          ]
        }
      ];
    }
  }
  return { Address, Network, Transaction, Wollet, WolletDescriptor };
});

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

  it('fetches transaction confirmation status', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ txid: 'txid1', status: { confirmed: true, block_height: 100 } })
    }));

    await expect(fetchTransactionStatus('https://example.test/api/', 'txid1', fetcher as unknown as typeof fetch)).resolves.toEqual({
      txid: 'txid1',
      confirmed: true,
      blockHeight: 100
    });
    expect(fetcher).toHaveBeenCalledWith('https://example.test/api/tx/txid1');
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

  it('does not verify confidential address payments without unblinding amounts', () => {
    const result = verifyAddressPayment(
      [
        {
          txid: 'confidentialtx',
          status: { confirmed: true, block_time: 200 },
          vout: [
            {
              scriptpubkey_address: 'ex1qunconfidential',
              valuecommitment: '08commitment',
              assetcommitment: '0acommitment'
            }
          ]
        }
      ],
      'lq1qqconfidential',
      25_000,
      { minCreatedAt: 150_000 }
    );

    expect(result).toEqual({ detected: false, confirmed: false, receivedSat: 0, txid: undefined });
  });

  it('verifies confidential address payments by unblinding wallet outputs', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => '02000000'
    }));

    await expect(
      verifyConfidentialAddressPayment(
        [
          {
            txid: 'confidentialtx',
            status: { confirmed: true, block_time: 200 },
            vout: [{ scriptpubkey_address: 'ex1qunconfidential', valuecommitment: '08commitment' }]
          }
        ],
        'lq1qqconfidential',
        25_000,
        {
          apiBase: 'https://example.test/api',
          descriptor: 'ct(slip77(00),elwpkh(xpub-demo/0/*))',
          addressIndex: 7,
          fetcher: fetcher as unknown as typeof fetch,
          minCreatedAt: 150_000
        }
      )
    ).resolves.toEqual({
      detected: true,
      confirmed: true,
      receivedSat: 25_000,
      txid: 'confidentialtx'
    });
    expect(fetcher).toHaveBeenCalledWith('https://example.test/api/tx/confidentialtx/hex');
  });

  it('verifies spent confidential receive outputs from wallet inputs', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => '02000000'
    }));

    await expect(
      verifyConfidentialAddressPayment(
        [
          {
            txid: 'spendtx',
            status: { confirmed: false },
            vout: [{ scriptpubkey_address: 'ex1qchange', valuecommitment: '08change' }]
          }
        ],
        'lq1qqconfidential',
        25_000,
        {
          apiBase: 'https://example.test/api',
          descriptor: 'ct(slip77(00),elwpkh(xpub-demo/0/*))',
          addressIndex: 7,
          fetcher: fetcher as unknown as typeof fetch,
          minCreatedAt: 150_000
        }
      )
    ).resolves.toEqual({
      detected: true,
      confirmed: true,
      receivedSat: 25_000,
      txid: 'receivetx'
    });
    expect(fetcher).toHaveBeenCalledWith('https://example.test/api/tx/spendtx/hex');
  });

  it('fetches matching prevout txs before checking confidential spends', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => '02000000'
    }));

    await expect(
      verifyConfidentialAddressPayment(
        [
          {
            txid: 'spendtx',
            status: { confirmed: true, block_time: 200 },
            vin: [{ txid: 'receivetx', vout: 1, prevout: { scriptpubkey_address: 'ex1qtarget', valuecommitment: '08receive' } }],
            vout: [{ scriptpubkey_address: 'ex1qchange', valuecommitment: '08change' }]
          }
        ],
        'lq1qqconfidential',
        25_000,
        {
          apiBase: 'https://example.test/api',
          descriptor: 'ct(slip77(00),elwpkh(xpub-demo/0/*))',
          addressIndex: 7,
          fetcher: fetcher as unknown as typeof fetch,
          minCreatedAt: 150_000
        }
      )
    ).resolves.toEqual({
      detected: true,
      confirmed: true,
      receivedSat: 25_000,
      txid: 'receivetx'
    });
    expect(fetcher).toHaveBeenCalledWith('https://example.test/api/tx/receivetx/hex');
    expect(fetcher).toHaveBeenCalledWith('https://example.test/api/tx/spendtx/hex');
  });

  it('ignores old confidential address history before the sale', () => {
    const result = verifyAddressPayment(
      [
        {
          txid: 'oldtx',
          status: { confirmed: true, block_time: 100 },
          vout: [{ scriptpubkey_address: 'ex1qold', valuecommitment: '08old' }]
        }
      ],
      'lq1qqconfidential',
      25_000,
      { minCreatedAt: 150_000 }
    );

    expect(result.detected).toBe(false);
  });
});
