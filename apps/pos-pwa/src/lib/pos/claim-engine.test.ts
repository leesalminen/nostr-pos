import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SwapRecoveryRecord, TerminalConfig } from './types';

const recoveries = new Map<string, SwapRecoveryRecord>();

vi.mock('../db/repositories/ledger', () => ({
  recoveryRecords: vi.fn(() => Array.from(recoveries.values())),
  getRecoveryBySwap: vi.fn((swapId: string) => recoveries.get(swapId)),
  putRecovery: vi.fn((record: SwapRecoveryRecord) => recoveries.set(record.swapId, record))
}));

describe('prepared claim broadcaster', () => {
  const config: TerminalConfig = {
    merchantName: 'Merchant',
    posName: 'Counter',
    currency: 'CRC',
    terminalId: 'term1',
    terminalPubkey: 'pubkey1',
    pairingCode: '4F7G-YJDP',
    activatedAt: 1000,
    maxInvoiceSat: 100000,
    syncServers: ['wss://one'],
    authorization: { liquid_backends: [{ type: 'esplora', url: 'https://liquid.example/api/' }] }
  };

  beforeEach(() => {
    recoveries.clear();
    recoveries.set('swap1', {
      saleId: 'sale1',
      paymentAttemptId: 'attempt1',
      swapId: 'swap1',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: ['wss://one', 'wss://two'],
      expiresAt: 1000,
      claimTxHex: '02000000',
      status: 'claimable'
    });
    recoveries.set('swap2', {
      saleId: 'sale2',
      paymentAttemptId: 'attempt2',
      swapId: 'swap2',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: [],
      expiresAt: 1000,
      status: 'claimable'
    });
  });

  it('broadcasts only records with a prepared claim transaction and marks them claimed', async () => {
    const { broadcastPreparedClaims } = await import('./claim-engine');
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => 'txid1'
    }));

    await expect(broadcastPreparedClaims(config, { fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual([
      { swapId: 'swap1', status: 'broadcast', txid: 'txid1' }
    ]);

    expect(fetcher).toHaveBeenCalledWith('https://liquid.example/api/tx', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '02000000'
    });
    expect(recoveries.get('swap1')).toMatchObject({ status: 'claimed', claimTxHex: '02000000', claimTxid: 'txid1' });
    expect(recoveries.get('swap2')?.status).toBe('claimable');
  });

  it('leaves a prepared claim retryable when broadcast fails', async () => {
    const { broadcastPreparedClaims } = await import('./claim-engine');
    const fetcher = vi.fn(async () => ({ ok: false, text: async () => 'rejected' }));

    await expect(broadcastPreparedClaims(config, { fetcher: fetcher as unknown as typeof fetch })).resolves.toMatchObject([
      { swapId: 'swap1', status: 'failed' }
    ]);
    expect(recoveries.get('swap1')).toMatchObject({ status: 'claimable', claimTxHex: '02000000' });
  });

  it('reports prepared claims as skipped when no backend is configured', async () => {
    const { broadcastPreparedClaims } = await import('./claim-engine');

    await expect(broadcastPreparedClaims({ ...config, authorization: {} })).resolves.toEqual([
      { swapId: 'swap1', status: 'skipped', reason: 'No Liquid backend configured.' }
    ]);
  });
});
