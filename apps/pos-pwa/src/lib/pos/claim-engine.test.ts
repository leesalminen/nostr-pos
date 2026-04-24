import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentAttempt, Receipt, Sale, SwapRecoveryRecord, TerminalConfig } from './types';

const recoveries = new Map<string, SwapRecoveryRecord>();
const sales = new Map<string, Sale>();
const attempts = new Map<string, PaymentAttempt>();
const receipts = new Map<string, Receipt>();
const outbox: unknown[] = [];

vi.mock('../db/repositories/ledger', () => ({
  recoveryRecords: vi.fn(() => Array.from(recoveries.values())),
  getSale: vi.fn((id: string) => sales.get(id)),
  getAttempt: vi.fn((id: string) => attempts.get(id)),
  getReceiptBySale: vi.fn((saleId: string) => Array.from(receipts.values()).find((receipt) => receipt.saleId === saleId)),
  getRecoveryBySwap: vi.fn((swapId: string) => recoveries.get(swapId)),
  putAttempt: vi.fn((attempt: PaymentAttempt) => attempts.set(attempt.id, attempt)),
  putReceipt: vi.fn((receipt: Receipt) => receipts.set(receipt.id, receipt)),
  putRecovery: vi.fn((record: SwapRecoveryRecord) => recoveries.set(record.swapId, record)),
  putSale: vi.fn((sale: Sale) => sales.set(sale.id, sale)),
  putOutbox: vi.fn((item: unknown) => outbox.push(item))
}));
vi.mock('../db/crypto', () => ({
  decryptJson: vi.fn()
}));
vi.mock('../liquid/esplora', () => ({
  broadcastLiquidTransaction: vi.fn(),
  fetchTransactionHex: vi.fn(),
  fetchTransactionStatus: vi.fn()
}));
vi.mock('../swaps/boltz-claim', () => ({
  buildBoltzLiquidReverseClaim: vi.fn()
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
    authorization: {
      liquid_backends: [{ type: 'esplora', url: 'https://liquid.example/api/' }],
      swap_providers: [{ id: 'boltz', type: 'boltz', api_base: 'https://boltz.example/api' }]
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    recoveries.clear();
    sales.clear();
    attempts.clear();
    receipts.clear();
    outbox.length = 0;
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
    const { broadcastLiquidTransaction } = await import('../liquid/esplora');
    const { broadcastPreparedClaims } = await import('./claim-engine');
    vi.mocked(broadcastLiquidTransaction).mockResolvedValue('txid1');

    await expect(broadcastPreparedClaims(config)).resolves.toEqual([
      { swapId: 'swap1', status: 'broadcast', txid: 'txid1' }
    ]);

    expect(broadcastLiquidTransaction).toHaveBeenCalledWith('https://liquid.example/api/', '02000000', undefined);
    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimed',
      claimTxHex: '02000000',
      claimTxid: 'txid1',
      claimBroadcastAttempts: 1
    });
    expect(recoveries.get('swap2')?.status).toBe('claimable');
  });

  it('settles the local sale when broadcasting a prepared claim', async () => {
    const { broadcastLiquidTransaction } = await import('../liquid/esplora');
    const { broadcastPreparedClaims } = await import('./claim-engine');
    sales.set('sale1', {
      id: 'sale1',
      receiptNumber: 'R-1',
      posRef: 'pos',
      terminalId: 'term1',
      amountFiat: '8500',
      fiatCurrency: 'CRC',
      amountSat: 25000,
      status: 'payment_detected',
      activePaymentAttemptId: 'attempt1',
      createdAt: 0,
      updatedAt: 0
    });
    attempts.set('attempt1', {
      id: 'attempt1',
      saleId: 'sale1',
      method: 'lightning_swap',
      status: 'detected',
      swapId: 'swap1',
      createdAt: 0,
      updatedAt: 0
    });
    vi.mocked(broadcastLiquidTransaction).mockResolvedValue('txid1');

    await expect(broadcastPreparedClaims(config)).resolves.toMatchObject([{ status: 'broadcast' }]);
    expect(sales.get('sale1')?.status).toBe('receipt_ready');
    expect(attempts.get('attempt1')).toMatchObject({ status: 'settled', settlementTxid: 'txid1' });
    expect(receipts.size).toBe(1);
    expect(outbox).toHaveLength(4);
  });

  it('marks a failed prepared claim retryable when broadcast fails', async () => {
    const { broadcastLiquidTransaction } = await import('../liquid/esplora');
    const { broadcastPreparedClaims } = await import('./claim-engine');
    vi.mocked(broadcastLiquidTransaction).mockRejectedValue(new Error('rejected'));

    await expect(broadcastPreparedClaims(config, { now: 500 })).resolves.toMatchObject([
      { swapId: 'swap1', status: 'failed' }
    ]);
    expect(recoveries.get('swap1')).toMatchObject({
      status: 'failed',
      claimTxHex: '02000000',
      claimBroadcastAttempts: 1,
      claimLastTriedAt: 500,
      claimLastError: 'rejected'
    });
  });

  it('retries failed prepared claims', async () => {
    const { broadcastLiquidTransaction } = await import('../liquid/esplora');
    const { broadcastPreparedClaims } = await import('./claim-engine');
    recoveries.set('swap1', { ...recoveries.get('swap1')!, status: 'failed', claimLastError: 'previous failure' });
    vi.mocked(broadcastLiquidTransaction).mockResolvedValue('txid1');

    await expect(broadcastPreparedClaims(config, { now: 600 })).resolves.toEqual([
      { swapId: 'swap1', status: 'broadcast', txid: 'txid1' }
    ]);
    expect(recoveries.get('swap1')).toMatchObject({
      status: 'claimed',
      claimLastTriedAt: 600,
      claimLastError: undefined
    });
  });

  it('auto-resumes only fresh claimable prepared claims', async () => {
    const { broadcastLiquidTransaction } = await import('../liquid/esplora');
    const { resumePreparedClaims } = await import('./claim-engine');
    recoveries.set('swap1', { ...recoveries.get('swap1')!, status: 'failed', claimLastError: 'previous failure' });
    recoveries.set('swap3', {
      saleId: 'sale3',
      paymentAttemptId: 'attempt3',
      swapId: 'swap3',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: ['wss://one'],
      expiresAt: 1000,
      claimTxHex: '03000000',
      status: 'claimable'
    });
    vi.mocked(broadcastLiquidTransaction).mockResolvedValue('txid3');

    await expect(resumePreparedClaims(config, { now: 700 })).resolves.toEqual([
      { swapId: 'swap3', status: 'broadcast', txid: 'txid3' }
    ]);
    expect(broadcastLiquidTransaction).toHaveBeenCalledTimes(1);
    expect(broadcastLiquidTransaction).toHaveBeenCalledWith('https://liquid.example/api/', '03000000', undefined);
    expect(recoveries.get('swap1')).toMatchObject({ status: 'failed', claimLastError: 'previous failure' });
    expect(recoveries.get('swap3')).toMatchObject({ status: 'claimed', claimTxid: 'txid3' });
  });

  it('reports prepared claims as skipped when no backend is configured', async () => {
    const { broadcastPreparedClaims } = await import('./claim-engine');

    await expect(broadcastPreparedClaims({ ...config, authorization: {} })).resolves.toEqual([
      { swapId: 'swap1', status: 'skipped', reason: 'No Liquid backend configured.' }
    ]);
  });

  it('builds a claim from recovery material, persists the claim hex, then broadcasts', async () => {
    const { decryptJson } = await import('../db/crypto');
    const { broadcastLiquidTransaction } = await import('../liquid/esplora');
    const { buildBoltzLiquidReverseClaim } = await import('../swaps/boltz-claim');
    const { claimLiquidReverseSwap } = await import('./claim-engine');
    recoveries.set('swap3', {
      saleId: 'sale3',
      paymentAttemptId: 'attempt3',
      swapId: 'swap3',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: ['wss://one', 'wss://two'],
      expiresAt: 1000,
      status: 'claimable'
    });
    vi.mocked(decryptJson).mockResolvedValue({
      settlement: { address: 'lq1destination' },
      swap: {
        id: 'swap3',
        invoice: 'lnbc1',
        preimage: '11'.repeat(32),
        preimageHash: '22'.repeat(32),
        claimPrivateKey: '33'.repeat(32),
        timeoutBlockHeight: 500,
        claimAddress: 'lq1destination',
        expectedAmountSat: 1000,
        boltzResponse: { swapTree: '{}', refundPublicKey: '02' + '44'.repeat(32), blindingKey: '55'.repeat(32) }
      }
    });
    vi.mocked(buildBoltzLiquidReverseClaim).mockResolvedValue('claimhex');
    vi.mocked(broadcastLiquidTransaction).mockImplementation(async () => {
      expect(recoveries.get('swap3')).toMatchObject({ status: 'claimable', claimTxHex: 'claimhex' });
      return 'claimtxid';
    });

    await expect(claimLiquidReverseSwap(config, { swapId: 'swap3', lockupTxHex: 'lockuphex' })).resolves.toEqual({
      swapId: 'swap3',
      status: 'broadcast',
      txid: 'claimtxid'
    });
    expect(buildBoltzLiquidReverseClaim).toHaveBeenCalledWith({
      apiBase: 'https://boltz.example/api',
      swap: expect.objectContaining({ id: 'swap3' }),
      lockupTxHex: 'lockuphex',
      destinationAddress: 'lq1destination',
      feeSatPerVbyte: undefined,
      fetcher: undefined
    });
    expect(recoveries.get('swap3')).toMatchObject({
      status: 'claimed',
      lockupTxHex: 'lockuphex',
      claimTxHex: 'claimhex',
      claimTxid: 'claimtxid',
      claimBroadcastAttempts: 1,
      claimLastError: undefined
    });
    expect(outbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'payment_backup',
          payload: expect.objectContaining({
            content: expect.objectContaining({
              claim: expect.objectContaining({ claim_tx_hex: 'claimhex', claim_txid: 'claimtxid' })
            })
          })
        })
      ])
    );
  });

  it('fetches the lockup transaction before building a claim when only a txid is available', async () => {
    const { decryptJson } = await import('../db/crypto');
    const { broadcastLiquidTransaction, fetchTransactionHex } = await import('../liquid/esplora');
    const { buildBoltzLiquidReverseClaim } = await import('../swaps/boltz-claim');
    const { claimLiquidReverseSwap } = await import('./claim-engine');
    recoveries.set('swap4', {
      saleId: 'sale4',
      paymentAttemptId: 'attempt4',
      swapId: 'swap4',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: ['wss://one', 'wss://two'],
      expiresAt: 1000,
      status: 'claimable'
    });
    vi.mocked(fetchTransactionHex).mockResolvedValue('lockuphex');
    vi.mocked(decryptJson).mockResolvedValue({
      settlement: { address: 'lq1destination' },
      swap: { id: 'swap4', invoice: 'lnbc1', preimageHash: '22'.repeat(32), timeoutBlockHeight: 500, claimAddress: 'lq1destination', expectedAmountSat: 1000 }
    });
    vi.mocked(buildBoltzLiquidReverseClaim).mockResolvedValue('claimhex');
    vi.mocked(broadcastLiquidTransaction).mockResolvedValue('claimtxid');

    await expect(claimLiquidReverseSwap(config, { swapId: 'swap4', lockupTxid: 'lockuptxid' })).resolves.toMatchObject({
      status: 'broadcast'
    });
    expect(fetchTransactionHex).toHaveBeenCalledWith('https://liquid.example/api/', 'lockuptxid', undefined);
    expect(buildBoltzLiquidReverseClaim).toHaveBeenCalledWith(expect.objectContaining({ lockupTxHex: 'lockuphex' }));
    expect(recoveries.get('swap4')).toMatchObject({ lockupTxHex: 'lockuphex', lockupTxid: 'lockuptxid' });
  });

  it('marks broadcast claims confirmed when the backend confirms the claim tx', async () => {
    const { fetchTransactionStatus } = await import('../liquid/esplora');
    const { reconcileClaimBroadcasts } = await import('./claim-engine');
    recoveries.set('swap5', {
      saleId: 'sale5',
      paymentAttemptId: 'attempt5',
      swapId: 'swap5',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: [],
      expiresAt: 1000,
      claimTxHex: 'claimhex',
      claimTxid: 'claimtxid',
      claimBroadcastAt: 100,
      status: 'claimed'
    });
    vi.mocked(fetchTransactionStatus).mockResolvedValue({ txid: 'claimtxid', confirmed: true, blockHeight: 101 });

    await expect(reconcileClaimBroadcasts(config, { now: 200 })).resolves.toEqual([{ swapId: 'swap5', status: 'confirmed' }]);
    expect(recoveries.get('swap5')).toMatchObject({ claimConfirmedAt: 200, claimNeedsFeeBump: false });
  });

  it('flags stale unconfirmed broadcast claims for fee bump', async () => {
    const { fetchTransactionStatus } = await import('../liquid/esplora');
    const { reconcileClaimBroadcasts } = await import('./claim-engine');
    recoveries.set('swap6', {
      saleId: 'sale6',
      paymentAttemptId: 'attempt6',
      swapId: 'swap6',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: [],
      expiresAt: 1000,
      claimTxHex: 'claimhex',
      claimTxid: 'claimtxid',
      claimBroadcastAt: 100,
      status: 'claimed'
    });
    vi.mocked(fetchTransactionStatus).mockResolvedValue({ txid: 'claimtxid', confirmed: false });

    await expect(reconcileClaimBroadcasts(config, { now: 200, rbfDelayMs: 50 })).resolves.toEqual([
      { swapId: 'swap6', status: 'fee_bump_due' }
    ]);
    expect(recoveries.get('swap6')).toMatchObject({ claimNeedsFeeBump: true });
  });

  it('rebuilds and broadcasts fee-bumped claims while preserving the replaced txid', async () => {
    const { decryptJson } = await import('../db/crypto');
    const { broadcastLiquidTransaction } = await import('../liquid/esplora');
    const { buildBoltzLiquidReverseClaim } = await import('../swaps/boltz-claim');
    const { bumpFeeDueClaims } = await import('./claim-engine');
    recoveries.set('swap7', {
      saleId: 'sale7',
      paymentAttemptId: 'attempt7',
      swapId: 'swap7',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: [],
      expiresAt: 1000,
      lockupTxHex: 'lockuphex',
      claimTxHex: 'oldclaimhex',
      claimTxid: 'oldclaimtxid',
      claimFeeSatPerVbyte: 0.2,
      claimNeedsFeeBump: true,
      status: 'claimed'
    });
    vi.mocked(decryptJson).mockResolvedValue({
      settlement: { address: 'lq1destination' },
      swap: {
        id: 'swap7',
        invoice: 'lnbc1',
        preimageHash: '22'.repeat(32),
        timeoutBlockHeight: 500,
        claimAddress: 'lq1destination',
        expectedAmountSat: 1000
      }
    });
    vi.mocked(buildBoltzLiquidReverseClaim).mockResolvedValue('newclaimhex');
    vi.mocked(broadcastLiquidTransaction).mockImplementation(async () => {
      expect(recoveries.get('swap7')).toMatchObject({
        status: 'claimable',
        claimTxHex: 'newclaimhex',
        claimTxid: 'oldclaimtxid',
        replacedClaimTxids: ['oldclaimtxid'],
        claimRbfCount: 1
      });
      return 'newclaimtxid';
    });

    await expect(bumpFeeDueClaims(config, { now: 500 })).resolves.toEqual([
      { swapId: 'swap7', status: 'broadcast', txid: 'newclaimtxid', feeSatPerVbyte: 0.3 }
    ]);
    expect(buildBoltzLiquidReverseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ lockupTxHex: 'lockuphex', feeSatPerVbyte: 0.3 })
    );
    expect(recoveries.get('swap7')).toMatchObject({
      status: 'claimed',
      claimTxHex: 'newclaimhex',
      claimTxid: 'newclaimtxid',
      replacedClaimTxids: ['oldclaimtxid'],
      claimFeeSatPerVbyte: 0.3,
      claimNeedsFeeBump: false,
      claimBroadcastAttempts: 1,
      claimBroadcastAt: 500
    });
  });

  it('fetches stored lockup txids before fee-bumping claims', async () => {
    const { decryptJson } = await import('../db/crypto');
    const { broadcastLiquidTransaction, fetchTransactionHex } = await import('../liquid/esplora');
    const { buildBoltzLiquidReverseClaim } = await import('../swaps/boltz-claim');
    const { bumpFeeDueClaims } = await import('./claim-engine');
    recoveries.set('swap8', {
      saleId: 'sale8',
      paymentAttemptId: 'attempt8',
      swapId: 'swap8',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: [],
      expiresAt: 1000,
      lockupTxid: 'lockuptxid',
      claimTxid: 'oldclaimtxid',
      claimNeedsFeeBump: true,
      status: 'claimed'
    });
    vi.mocked(fetchTransactionHex).mockResolvedValue('lockuphex');
    vi.mocked(decryptJson).mockResolvedValue({
      swap: {
        id: 'swap8',
        invoice: 'lnbc1',
        preimageHash: '22'.repeat(32),
        timeoutBlockHeight: 500,
        claimAddress: 'lq1destination',
        expectedAmountSat: 1000
      }
    });
    vi.mocked(buildBoltzLiquidReverseClaim).mockResolvedValue('newclaimhex');
    vi.mocked(broadcastLiquidTransaction).mockResolvedValue('newclaimtxid');

    await expect(bumpFeeDueClaims(config, { now: 700 })).resolves.toMatchObject([{ status: 'broadcast' }]);
    expect(fetchTransactionHex).toHaveBeenCalledWith('https://liquid.example/api/', 'lockuptxid', undefined);
    expect(recoveries.get('swap8')).toMatchObject({ lockupTxHex: 'lockuphex' });
  });
});
