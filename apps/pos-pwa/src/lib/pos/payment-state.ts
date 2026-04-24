import confetti from 'canvas-confetti';
import type { PaymentAttempt, PaymentMethod, Receipt, Sale, SaleStatus, TerminalConfig } from './types';
import { encryptJson } from '../db/crypto';
import { putAttempt, putOutbox, putRecovery, putSale } from '../db/repositories/ledger';
import { reserveAddressIndex } from '../db/repositories/terminal';
import { getBullBitcoinRate, fiatToSats } from '../fx/bull-bitcoin';
import { deriveLiquidAddress, liquidBip21 } from '../liquid/address';
import { BoltzReverseSwapProvider } from '../swaps/boltz';
import { MockBoltzReverseSwapProvider } from '../swaps/mock-boltz';
import type { SwapProvider } from '../swaps/provider';
import { ulid } from '../util/ulid';
import { paymentStatusEvent, saleCreatedEvent, swapRecoveryEvent } from '../nostr/events';
import { merchantRecoveryPubkey, publishOutboxItem, type OutboxPublishReport } from '../nostr/outbox';
import { settleAttempt } from './settlement';
import type { OutboxItem, SwapRecoveryRecord } from './types';

export type CreateSaleOptions = {
  minRecoveryOk?: number;
  publishRecovery?: typeof publishOutboxItem;
  swapProvider?: SwapProvider;
};

export function statusAfterDetection(method: PaymentMethod): SaleStatus {
  return method === 'liquid' ? 'settled' : 'settling';
}

export function paymentPayload(method: PaymentMethod, amountSat: number, saleId: string, liquidAddress?: string): string {
  if (method === 'liquid') return liquidBip21(liquidAddress ?? `tex1q${saleId.toLowerCase()}`, amountSat);
  if (method === 'bolt_card') return `lnbc${amountSat}n1p${saleId.toLowerCase()}boltcard`;
  return `lnbc${amountSat}n1p${saleId.toLowerCase()}lightning`;
}

export function recoveryDurabilityMet(report: Pick<OutboxPublishReport, 'results'>, minOk = 2): boolean {
  return report.results.filter((result) => result.ok).length >= minOk;
}

export function posRefForConfig(config: TerminalConfig): string {
  return config.posProfile ? `30380:${config.posProfile.merchantPubkey}:${config.posProfile.posId}` : 'pilot-seguras-butcher';
}

export function assertTerminalCanCharge(config: TerminalConfig, now = Date.now()): void {
  if (!config.activatedAt) throw new Error('This terminal needs owner approval before taking payments.');
  if (config.revokedAt) throw new Error('This terminal was removed by the owner.');
  const expiresAt = config.authorization && typeof config.authorization.expires_at === 'number'
    ? config.authorization.expires_at
    : undefined;
  if (expiresAt && expiresAt * 1000 <= now) {
    throw new Error('Owner approval expired. Reconnect this terminal.');
  }
}

export function swapProviderForConfig(config: TerminalConfig): SwapProvider {
  const provider = config.authorization?.swap_providers?.find((candidate) => candidate.type === 'boltz' && candidate.api_base);
  if (provider && import.meta.env.PROD) return new BoltzReverseSwapProvider({ apiBase: provider.api_base });
  return new MockBoltzReverseSwapProvider();
}

export async function createSale(
  config: TerminalConfig,
  fiatAmount: string,
  method: PaymentMethod,
  note?: string,
  options: CreateSaleOptions = {}
) {
  assertTerminalCanCharge(config);
  const rate = await getBullBitcoinRate(config.currency);
  const amountSat = fiatToSats(Number(fiatAmount), rate);
  if (amountSat > config.maxInvoiceSat) {
    throw new Error('Amount is above this terminal limit.');
  }

  const now = Date.now();
  const addressIndex = await reserveAddressIndex();
  const liquid = await deriveLiquidAddress(config, addressIndex);
  const swapProvider = options.swapProvider ?? swapProviderForConfig(config);
  const swap = await swapProvider.createReverseSwap({
    saleId: ulid(now + 2),
    invoiceSat: amountSat,
    claimAddress: liquid.address
  });
  const verification = swapProvider.verifySwap(swap, {
    saleId: swap.id.replace(/^swap_/, ''),
    invoiceSat: amountSat,
    claimAddress: liquid.address
  });
  if (!verification.ok) {
    throw new Error('Could not safely prepare Lightning payment. Try again.');
  }
  const sale: Sale = {
    id: ulid(now),
    receiptNumber: `R-${String(now).slice(-8)}`,
    posRef: posRefForConfig(config),
    terminalId: config.terminalId,
    amountFiat: fiatAmount,
    fiatCurrency: config.currency,
    amountSat,
    note,
    fxRate: {
      indexPrice: rate.indexPrice,
      precision: rate.precision,
      createdAt: rate.createdAt
    },
    status: 'payment_preparing',
    createdAt: now,
    updatedAt: now
  };

  const attempt: PaymentAttempt = {
    id: ulid(now + 1),
    saleId: sale.id,
    method,
    status: 'created',
    paymentData: method === 'liquid' ? liquidBip21(liquid.address, amountSat) : swap.invoice,
    lightningInvoice: swap.invoice,
    liquidPaymentData: liquidBip21(liquid.address, amountSat),
    liquidAddress: liquid.address,
    addressIndex: liquid.addressIndex,
    terminalBranch: liquid.terminalBranch,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 15 * 60_000
  };
  sale.activePaymentAttemptId = attempt.id;

  await putSale(sale);
  await putAttempt(attempt);
  await putOutbox({
    id: `sale_${sale.id}`,
    type: 'sale_created',
    payload: saleCreatedEvent(sale),
    createdAt: now,
    okFrom: []
  });

  if (method !== 'liquid') {
    const minRecoveryOk = options.minRecoveryOk ?? 2;
    if (config.syncServers.length < minRecoveryOk) {
      throw new Error('Could not safely prepare Lightning payment. Try again.');
    }
    const swapId = swap.id;
    const recoveryPayload = {
      protocol: 'nostr-pos',
      version: 2,
      type: 'swap_recovery',
      sale_id: sale.id,
      payment_attempt_id: attempt.id,
      swap_id: swapId,
      amount: {
        invoice_sat: amountSat,
        settlement_amount_sat: swap.expectedAmountSat,
        fiat_currency: config.currency,
        fiat_amount: fiatAmount
      },
      settlement: {
        terminal_branch: liquid.terminalBranch,
        address_index: liquid.addressIndex,
        address: liquid.address
      },
      swap,
      claim: {
        mode: 'standard',
        preimage_revealed: false,
        claim_tx_hex: null,
        claim_txid: null
      }
    };
    const encryptedLocalBlob = await encryptJson(recoveryPayload, config.terminalId);
    const recoveryRecord: SwapRecoveryRecord = {
      saleId: sale.id,
      paymentAttemptId: attempt.id,
      swapId,
      encryptedLocalBlob,
      localSavedAt: Date.now(),
      okFrom: [],
      expiresAt: attempt.expiresAt!,
      status: 'pending'
    };
    await putRecovery(recoveryRecord);
    const recoveryOutboxItem: OutboxItem = {
      id: `recovery_${swapId}`,
      type: 'payment_backup',
      payload: swapRecoveryEvent({
        saleId: sale.id,
        paymentAttemptId: attempt.id,
        swapId,
        terminalId: config.terminalId,
        encryptedLocalBlob,
        expiresAt: attempt.expiresAt!,
        recoveryPubkey: merchantRecoveryPubkey(config)
      }),
      createdAt: Date.now(),
      okFrom: []
    };
    await putOutbox(recoveryOutboxItem);
    const report = await (options.publishRecovery ?? publishOutboxItem)(config, recoveryOutboxItem);
    const okFrom = Array.from(new Set(report.results.filter((result) => result.ok).map((result) => result.relay)));
    await putRecovery({
      ...recoveryRecord,
      okFrom,
      relaySavedAt: recoveryDurabilityMet(report, minRecoveryOk) ? Date.now() : undefined
    });
    if (!recoveryDurabilityMet(report, minRecoveryOk)) {
      await putSale({ ...sale, status: 'failed', updatedAt: Date.now() });
      await putAttempt({ ...attempt, status: 'failed', updatedAt: Date.now() });
      throw new Error('Could not safely prepare Lightning payment. Try again.');
    }
  }

  return { sale, attempt, rate };
}

export async function markReady(sale: Sale, attempt: PaymentAttempt): Promise<void> {
  const now = Date.now();
  await putSale({ ...sale, status: 'payment_ready', updatedAt: now });
  await putAttempt({ ...attempt, status: 'waiting', updatedAt: now });
  await putOutbox({
    id: `status_${attempt.id}_${now}`,
    type: 'payment_status',
    payload: paymentStatusEvent({ ...sale, status: 'payment_ready', updatedAt: now }, { ...attempt, status: 'waiting', updatedAt: now }),
    createdAt: now,
    okFrom: []
  });
}

export async function simulateSettlement(sale: Sale, attempt: PaymentAttempt): Promise<Receipt> {
  const detectedAt = Date.now();
  await putSale({ ...sale, status: statusAfterDetection(attempt.method), updatedAt: detectedAt });
  await putAttempt({ ...attempt, status: 'detected', updatedAt: detectedAt });

  await new Promise((resolve) => setTimeout(resolve, attempt.method === 'liquid' ? 500 : 1400));
  const settledAt = Date.now();
  const txid = crypto.randomUUID().replaceAll('-', '');
  const receipt = await settleAttempt({ sale, attempt, txid, settledAt });

  navigator.vibrate?.(80);
  void confetti({ particleCount: 90, spread: 70, origin: { y: 0.78 } });
  return receipt;
}
