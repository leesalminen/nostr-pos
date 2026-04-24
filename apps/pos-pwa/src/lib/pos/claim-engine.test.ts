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
  fetchTransactionHex: vi.fn()
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
    expect(recoveries.get('swap1')).toMatchObject({ status: 'claimed', claimTxHex: '02000000', claimTxid: 'txid1' });
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
    expect(outbox).toHaveLength(2);
  });

  it('leaves a prepared claim retryable when broadcast fails', async () => {
    const { broadcastLiquidTransaction } = await import('../liquid/esplora');
    const { broadcastPreparedClaims } = await import('./claim-engine');
    vi.mocked(broadcastLiquidTransaction).mockRejectedValue(new Error('rejected'));

    await expect(broadcastPreparedClaims(config)).resolves.toMatchObject([
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
      fetcher: undefined
    });
    expect(recoveries.get('swap3')).toMatchObject({ status: 'claimed', claimTxHex: 'claimhex', claimTxid: 'claimtxid' });
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
  });
});
