import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentAttempt, Sale, TerminalConfig } from './types';
import type { SwapProvider } from '../swaps/provider';

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

    const { sale, attempt } = await createSale(config, '8500', 'liquid');

    expect(sales.get(sale.id)).toBeTruthy();
    expect(attempts.get(attempt.id)).toMatchObject({
      method: 'liquid',
      paymentData: 'liquidnetwork:tex1qliquid?amount=25000',
      liquidPaymentData: 'liquidnetwork:tex1qliquid?amount=25000',
      lightningInvoice: undefined,
      swapId: undefined
    });
    expect(outbox).toHaveLength(1);
  });

  it('surfaces recovery durability failures before showing Lightning invoices', async () => {
    const { createSale } = await import('./payment-state');
    const swapProvider: SwapProvider = {
      id: 'boltz',
      getLimits: vi.fn(),
      createReverseSwap: vi.fn(async () => ({
        id: 'swap1',
        invoice: 'lnbc10u1p57hfy0pp5demo',
        preimage: '11'.repeat(32),
        preimageHash: '22'.repeat(32),
        claimPrivateKey: '33'.repeat(32),
        claimPublicKey: `02${'44'.repeat(32)}`,
        timeoutBlockHeight: 100,
        claimAddress: 'tex1qliquid',
        expectedAmountSat: 24_500
      })),
      getSwapStatus: vi.fn(),
      verifySwap: vi.fn(() => ({ ok: true })),
      supportsClaimCovenants: vi.fn(() => false)
    };

    await expect(
      createSale(
        { ...config, syncServers: ['wss://one', 'wss://two'] },
        '8500',
        'lightning_swap',
        undefined,
        {
          swapProvider,
          publishRecovery: vi.fn(async () => ({
            id: 'recovery_swap1',
            attempted: true,
            okCount: 1,
            results: [
              { relay: 'wss://one', ok: true },
              { relay: 'wss://two', ok: false, message: 'timeout' }
            ]
          }))
        }
      )
    ).rejects.toThrow('recovery backup reached 1/2 relays');

    expect(Array.from(sales.values()).at(-1)).toMatchObject({ status: 'failed' });
    expect(Array.from(attempts.values()).at(-1)).toMatchObject({ status: 'failed' });
  });
});
