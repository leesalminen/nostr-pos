import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentAttempt, Receipt, Sale, SwapRecoveryRecord, TerminalConfig } from './types';

const sales = new Map<string, Sale>();
const attempts = new Map<string, PaymentAttempt>();
const receipts = new Map<string, Receipt>();
const recoveries = new Map<string, SwapRecoveryRecord>();
const outbox: unknown[] = [];
let config: TerminalConfig | undefined;

vi.mock('../db/repositories/ledger', () => ({
  openPaymentAttempts: vi.fn(() => Array.from(attempts.values())),
  getSale: vi.fn((id: string) => sales.get(id)),
  getAttempt: vi.fn((id: string) => attempts.get(id)),
  getReceiptBySale: vi.fn((saleId: string) => Array.from(receipts.values()).find((receipt) => receipt.saleId === saleId)),
  getRecoveryBySwap: vi.fn((swapId: string) => recoveries.get(swapId)),
  putAttempt: vi.fn((attempt: PaymentAttempt) => attempts.set(attempt.id, attempt)),
  putRecovery: vi.fn((record: SwapRecoveryRecord) => recoveries.set(record.swapId, record)),
  putReceipt: vi.fn((receipt: Receipt) => receipts.set(receipt.id, receipt)),
  putSale: vi.fn((sale: Sale) => sales.set(sale.id, sale)),
  putOutbox: vi.fn((item: unknown) => outbox.push(item))
}));

vi.mock('../db/repositories/terminal', () => ({
  getTerminalConfig: vi.fn(() => config)
}));

vi.mock('./claim-engine', () => ({
  claimLiquidReverseSwap: vi.fn(async () => ({ swapId: 'swap', status: 'skipped', reason: 'not ready' }))
}));

describe('startup reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sales.clear();
    attempts.clear();
    receipts.clear();
    recoveries.clear();
    outbox.length = 0;
    config = undefined;
  });

  it('expires stale waiting attempts', async () => {
    const { reconcileOpenPayments } = await import('./reconciler');
    sales.set('sale1', {
      id: 'sale1',
      receiptNumber: 'R-1',
      posRef: 'pos',
      terminalId: 'term1',
      amountFiat: '8500',
      fiatCurrency: 'CRC',
      amountSat: 25000,
      status: 'payment_ready',
      createdAt: 0,
      updatedAt: 0
    });
    attempts.set('attempt1', {
      id: 'attempt1',
      saleId: 'sale1',
      method: 'lightning_swap',
      status: 'waiting',
      createdAt: 0,
      updatedAt: 0,
      expiresAt: 10
    });

    await expect(reconcileOpenPayments(11)).resolves.toBe(1);
    expect(attempts.get('attempt1')?.status).toBe('expired');
    expect(sales.get('sale1')?.status).toBe('expired');
    expect(outbox).toHaveLength(1);
  });

  it('settles Liquid attempts detected by the configured backend', async () => {
    const { reconcileOpenPayments } = await import('./reconciler');
    config = {
      merchantName: 'Merchant',
      posName: 'Counter',
      currency: 'CRC',
      terminalId: 'term1',
      terminalPubkey: 'pub',
      pairingCode: 'ABCD-EFGH',
      maxInvoiceSat: 100000,
      syncServers: [],
      authorization: {
        liquid_backends: [{ type: 'esplora', url: 'https://liquid.example/api' }]
      }
    };
    sales.set('sale2', {
      id: 'sale2',
      receiptNumber: 'R-2',
      posRef: 'pos',
      terminalId: 'term1',
      amountFiat: '8500',
      fiatCurrency: 'CRC',
      amountSat: 25000,
      status: 'payment_ready',
      createdAt: 0,
      updatedAt: 0
    });
    attempts.set('attempt2', {
      id: 'attempt2',
      saleId: 'sale2',
      method: 'liquid',
      status: 'waiting',
      liquidAddress: 'tex1qpaid',
      createdAt: 0,
      updatedAt: 0,
      expiresAt: 100
    });

    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            txid: 'tx123',
            status: { confirmed: false },
            vout: [{ scriptpubkey_address: 'tex1qpaid', value: 25000 }]
          }
        ]),
        { status: 200 }
      )
    );

    await expect(reconcileOpenPayments({ now: 12, fetcher })).resolves.toBe(1);
    expect(fetcher).toHaveBeenCalledWith('https://liquid.example/api/address/tex1qpaid/txs');
    expect(attempts.get('attempt2')?.status).toBe('settled');
    expect(attempts.get('attempt2')?.settlementTxid).toBe('tx123');
    expect(sales.get('sale2')?.status).toBe('receipt_ready');
    expect(Array.from(receipts.values())).toHaveLength(1);
    expect(outbox).toHaveLength(2);
  });

  it('settles keypad charges paid through the Liquid tab', async () => {
    const { reconcileOpenPayments } = await import('./reconciler');
    config = {
      merchantName: 'Merchant',
      posName: 'Counter',
      currency: 'CRC',
      terminalId: 'term1',
      terminalPubkey: 'pub',
      pairingCode: 'ABCD-EFGH',
      maxInvoiceSat: 100000,
      syncServers: [],
      authorization: {
        liquid_backends: [{ type: 'esplora', url: 'https://liquid.example/api' }]
      }
    };
    sales.set('sale-liquid-tab', {
      id: 'sale-liquid-tab',
      receiptNumber: 'R-L',
      posRef: 'pos',
      terminalId: 'term1',
      amountFiat: '8500',
      fiatCurrency: 'CRC',
      amountSat: 25000,
      status: 'payment_ready',
      createdAt: 0,
      updatedAt: 0
    });
    attempts.set('attempt-liquid-tab', {
      id: 'attempt-liquid-tab',
      saleId: 'sale-liquid-tab',
      method: 'lightning_swap',
      status: 'waiting',
      liquidAddress: 'tex1qtabpaid',
      swapId: 'swap-liquid-tab',
      createdAt: 0,
      updatedAt: 0,
      expiresAt: 100
    });
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            txid: 'liquidtxid',
            status: { confirmed: false },
            vout: [{ scriptpubkey_address: 'tex1qtabpaid', value: 25000 }]
          }
        ]),
        { status: 200 }
      )
    );

    await expect(reconcileOpenPayments({ now: 12, fetcher })).resolves.toBe(1);
    expect(attempts.get('attempt-liquid-tab')).toMatchObject({
      method: 'liquid',
      status: 'settled',
      settlementTxid: 'liquidtxid'
    });
    expect(sales.get('sale-liquid-tab')?.status).toBe('receipt_ready');
    expect(outbox).toHaveLength(2);
  });

  it('settles confidential Liquid address hits without visible output amounts', async () => {
    const { reconcileOpenPayments } = await import('./reconciler');
    config = {
      merchantName: 'Merchant',
      posName: 'Counter',
      currency: 'CRC',
      terminalId: 'term1',
      terminalPubkey: 'pub',
      pairingCode: 'ABCD-EFGH',
      maxInvoiceSat: 100000,
      syncServers: [],
      authorization: {
        liquid_backends: [{ type: 'esplora', url: 'https://liquid.example/api' }]
      }
    };
    sales.set('sale-confidential', {
      id: 'sale-confidential',
      receiptNumber: 'R-C',
      posRef: 'pos',
      terminalId: 'term1',
      amountFiat: '8500',
      fiatCurrency: 'CRC',
      amountSat: 25000,
      status: 'payment_ready',
      createdAt: 200_000,
      updatedAt: 200_000
    });
    attempts.set('attempt-confidential', {
      id: 'attempt-confidential',
      saleId: 'sale-confidential',
      method: 'liquid',
      status: 'waiting',
      liquidAddress: 'lq1qqconfidential',
      createdAt: 200_000,
      updatedAt: 200_000,
      expiresAt: 300_000
    });
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            txid: 'oldtx',
            status: { confirmed: true, block_time: 100 },
            vout: [{ scriptpubkey_address: 'ex1qold', valuecommitment: '08old' }]
          },
          {
            txid: 'confidentialtx',
            status: { confirmed: true, block_time: 210 },
            vout: [{ scriptpubkey_address: 'ex1qreceiver', valuecommitment: '08commitment' }]
          }
        ]),
        { status: 200 }
      )
    );

    await expect(reconcileOpenPayments({ now: 220_000, fetcher })).resolves.toBe(1);
    expect(attempts.get('attempt-confidential')).toMatchObject({
      method: 'liquid',
      status: 'settled',
      settlementTxid: 'confidentialtx'
    });
    expect(sales.get('sale-confidential')?.status).toBe('receipt_ready');
  });

  it('marks Lightning swaps detected by the provider after refresh', async () => {
    const { reconcileOpenPayments } = await import('./reconciler');
    config = {
      merchantName: 'Merchant',
      posName: 'Counter',
      currency: 'CRC',
      terminalId: 'term1',
      terminalPubkey: 'pub',
      pairingCode: 'ABCD-EFGH',
      maxInvoiceSat: 100000,
      syncServers: []
    };
    sales.set('sale4', {
      id: 'sale4',
      receiptNumber: 'R-4',
      posRef: 'pos',
      terminalId: 'term1',
      amountFiat: '8500',
      fiatCurrency: 'CRC',
      amountSat: 25000,
      status: 'payment_ready',
      createdAt: 0,
      updatedAt: 0
    });
    attempts.set('attempt4', {
      id: 'attempt4',
      saleId: 'sale4',
      method: 'lightning_swap',
      status: 'waiting',
      swapId: 'swap4',
      createdAt: 0,
      updatedAt: 0,
      expiresAt: 100
    });
    recoveries.set('swap4', {
      saleId: 'sale4',
      paymentAttemptId: 'attempt4',
      swapId: 'swap4',
      encryptedLocalBlob: 'ciphertext',
      localSavedAt: 0,
      okFrom: ['wss://one', 'wss://two'],
      expiresAt: 100,
      status: 'pending'
    });

    await expect(
      reconcileOpenPayments({
        now: 12,
        swapProvider: {
          id: 'test',
          getLimits: async () => ({ minSat: 1000, maxSat: 100000 }),
          createReverseSwap: async () => {
            throw new Error('not used');
          },
          getSwapStatus: async () => 'transaction.mempool',
          verifySwap: () => ({ ok: true }),
          supportsClaimCovenants: () => false
        }
      })
    ).resolves.toBe(1);
    expect(attempts.get('attempt4')?.status).toBe('detected');
    expect(recoveries.get('swap4')?.status).toBe('claimable');
    expect(sales.get('sale4')?.status).toBe('payment_detected');
    expect(outbox).toHaveLength(1);
  });

  it('claims Lightning swaps from detailed provider polling after refresh', async () => {
    const { claimLiquidReverseSwap } = await import('./claim-engine');
    const { reconcileOpenPayments } = await import('./reconciler');
    vi.mocked(claimLiquidReverseSwap).mockResolvedValue({ swapId: 'swap5', status: 'broadcast', txid: 'claimtxid' });
    config = {
      merchantName: 'Merchant',
      posName: 'Counter',
      currency: 'CRC',
      terminalId: 'term1',
      terminalPubkey: 'pub',
      pairingCode: 'ABCD-EFGH',
      maxInvoiceSat: 100000,
      syncServers: [],
      authorization: {
        liquid_backends: [{ type: 'esplora', url: 'https://liquid.example/api' }]
      }
    };
    sales.set('sale5', {
      id: 'sale5',
      receiptNumber: 'R-5',
      posRef: 'pos',
      terminalId: 'term1',
      amountFiat: '8500',
      fiatCurrency: 'CRC',
      amountSat: 25000,
      status: 'payment_ready',
      createdAt: 0,
      updatedAt: 0
    });
    attempts.set('attempt5', {
      id: 'attempt5',
      saleId: 'sale5',
      method: 'lightning_swap',
      status: 'waiting',
      swapId: 'swap5',
      createdAt: 0,
      updatedAt: 0,
      expiresAt: 100
    });

    await expect(
      reconcileOpenPayments({
        now: 12,
        swapProvider: {
          id: 'test',
          getLimits: async () => ({ minSat: 1000, maxSat: 100000 }),
          createReverseSwap: async () => {
            throw new Error('not used');
          },
          getSwapStatus: async () => 'created',
          getSwapStatusDetails: async () => ({ status: 'transaction.confirmed', txid: 'lockuptxid', transactionHex: 'lockuphex' }),
          verifySwap: () => ({ ok: true }),
          supportsClaimCovenants: () => false
        }
      })
    ).resolves.toBe(1);
    expect(claimLiquidReverseSwap).toHaveBeenCalledWith(config, {
      swapId: 'swap5',
      lockupTxHex: 'lockuphex',
      lockupTxid: 'lockuptxid',
      fetcher: undefined
    });
    expect(attempts.get('attempt5')).toMatchObject({ status: 'settled', settlementTxid: 'claimtxid' });
    expect(sales.get('sale5')?.status).toBe('receipt_ready');
    expect(Array.from(receipts.values())).toHaveLength(1);
  });

  it('resumes an existing sale without creating a new attempt', async () => {
    const { resumeSale } = await import('./reconciler');
    sales.set('sale3', {
      id: 'sale3',
      receiptNumber: 'R-3',
      posRef: 'pos',
      terminalId: 'term1',
      amountFiat: '8500',
      fiatCurrency: 'CRC',
      amountSat: 25000,
      status: 'payment_ready',
      activePaymentAttemptId: 'attempt3',
      createdAt: 0,
      updatedAt: 0
    });
    attempts.set('attempt3', {
      id: 'attempt3',
      saleId: 'sale3',
      method: 'lightning_swap',
      status: 'waiting',
      paymentData: 'lnbc25000n1demo',
      createdAt: 0,
      updatedAt: 0
    });

    await expect(resumeSale('sale3')).resolves.toEqual({
      sale: sales.get('sale3'),
      attempt: attempts.get('attempt3')
    });
  });
});
