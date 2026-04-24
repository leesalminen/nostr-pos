import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentAttempt, Sale, TerminalConfig } from './types';

const sales = new Map<string, Sale>();
const attempts = new Map<string, PaymentAttempt>();
const outbox: unknown[] = [];

vi.mock('../db/repositories/ledger', () => ({
  putSale: vi.fn((sale: Sale) => sales.set(sale.id, sale)),
  putAttempt: vi.fn((attempt: PaymentAttempt) => attempts.set(attempt.id, attempt)),
  putOutbox: vi.fn((item: unknown) => outbox.push(item)),
  putRecovery: vi.fn()
}));

vi.mock('../db/repositories/terminal', () => ({
  reserveAddressIndex: vi.fn(async () => 7)
}));

vi.mock('../fx/bull-bitcoin', () => ({
  getBullBitcoinRate: vi.fn(async () => ({ indexPrice: 10000000, precision: 2, createdAt: '2026-04-24T00:00:00.000Z' })),
  fiatToSats: vi.fn(() => 25000)
}));

vi.mock('../liquid/address', () => ({
  deriveLiquidAddress: vi.fn(async () => ({
    address: 'tex1qliquid',
    addressIndex: 7,
    terminalBranch: 17
  })),
  liquidBip21: vi.fn((address: string, amountSat: number) => `liquidnetwork:${address}?amount=${amountSat}`)
}));

describe('sale creation payment rails', () => {
  const config: TerminalConfig = {
    merchantName: 'Merchant',
    posName: 'Counter',
    currency: 'CRC',
    terminalId: 'term1',
    terminalPubkey: 'pub',
    pairingCode: 'ABCD-EFGH',
    activatedAt: 1000,
    maxInvoiceSat: 100000,
    syncServers: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sales.clear();
    attempts.clear();
    outbox.length = 0;
  });

  it('creates Liquid-only charges without requiring a swap provider', async () => {
    const { createSale } = await import('./payment-state');
    const swapProvider = {
      id: 'unavailable',
      getLimits: vi.fn(),
      createReverseSwap: vi.fn(async () => {
        throw new Error('not used');
      }),
      getSwapStatus: vi.fn(),
      verifySwap: vi.fn(),
      supportsClaimCovenants: vi.fn(() => false)
    };

    const { sale, attempt } = await createSale(config, '8500', 'liquid', undefined, { swapProvider });

    expect(sales.get(sale.id)).toBeTruthy();
    expect(attempts.get(attempt.id)).toMatchObject({
      method: 'liquid',
      paymentData: 'liquidnetwork:tex1qliquid?amount=25000',
      liquidPaymentData: 'liquidnetwork:tex1qliquid?amount=25000',
      lightningInvoice: undefined,
      swapId: undefined
    });
    expect(swapProvider.createReverseSwap).not.toHaveBeenCalled();
    expect(outbox).toHaveLength(1);
  });
});
