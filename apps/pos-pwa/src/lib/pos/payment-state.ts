import confetti from 'canvas-confetti';
import type { PaymentAttempt, PaymentMethod, Receipt, Sale, SaleStatus, TerminalConfig } from './types';
import { encryptJson } from '../db/crypto';
import { putAttempt, putOutbox, putReceipt, putRecovery, putSale } from '../db/repositories/ledger';
import { reserveAddressIndex } from '../db/repositories/terminal';
import { getBullBitcoinRate, fiatToSats } from '../fx/bull-bitcoin';
import { deriveLiquidAddress, liquidBip21 } from '../liquid/address';
import { MockBoltzReverseSwapProvider } from '../swaps/mock-boltz';
import { ulid } from '../util/ulid';
import { paymentStatusEvent, receiptEvent, saleCreatedEvent } from '../nostr/events';

export function statusAfterDetection(method: PaymentMethod): SaleStatus {
  return method === 'liquid' ? 'settled' : 'settling';
}

export function paymentPayload(method: PaymentMethod, amountSat: number, saleId: string, liquidAddress?: string): string {
  if (method === 'liquid') return liquidBip21(liquidAddress ?? `tex1q${saleId.toLowerCase()}`, amountSat);
  if (method === 'bolt_card') return `lnbc${amountSat}n1p${saleId.toLowerCase()}boltcard`;
  return `lnbc${amountSat}n1p${saleId.toLowerCase()}lightning`;
}

export async function createSale(config: TerminalConfig, fiatAmount: string, method: PaymentMethod, note?: string) {
  const rate = await getBullBitcoinRate(config.currency);
  const amountSat = fiatToSats(Number(fiatAmount), rate);
  if (amountSat > config.maxInvoiceSat) {
    throw new Error('Amount is above this terminal limit.');
  }

  const now = Date.now();
  const addressIndex = await reserveAddressIndex();
  const liquid = deriveLiquidAddress(config, addressIndex);
  const swapProvider = new MockBoltzReverseSwapProvider();
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
    posRef: 'pilot-seguras-butcher',
    terminalId: config.terminalId,
    amountFiat: fiatAmount,
    fiatCurrency: config.currency,
    amountSat,
    note,
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
    const okFrom = config.syncServers.slice(0, 2);
    if (okFrom.length < 2) {
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
    await putRecovery({
      saleId: sale.id,
      paymentAttemptId: attempt.id,
      swapId,
      encryptedLocalBlob,
      localSavedAt: Date.now(),
      relaySavedAt: Date.now(),
      okFrom,
      expiresAt: attempt.expiresAt!,
      status: 'pending'
    });
    await putOutbox({
      id: `recovery_${swapId}`,
      type: 'payment_backup',
      payload: { saleId: sale.id, swapId },
      createdAt: Date.now(),
      okFrom
    });
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
  const finalSale = { ...sale, status: 'receipt_ready' as const, updatedAt: settledAt };
  const finalAttempt = { ...attempt, status: 'settled' as const, settlementTxid: txid, updatedAt: settledAt };
  await putSale(finalSale);
  await putAttempt(finalAttempt);
  const receipt = { id: ulid(settledAt), saleId: sale.id, createdAt: settledAt };
  await putReceipt(receipt);
  await putOutbox({
    id: `status_${attempt.id}_${settledAt}`,
    type: 'payment_status',
    payload: paymentStatusEvent(finalSale, finalAttempt),
    createdAt: settledAt,
    okFrom: []
  });
  await putOutbox({
    id: `receipt_${sale.id}`,
    type: 'receipt',
    payload: receiptEvent(finalSale, finalAttempt),
    createdAt: settledAt,
    okFrom: []
  });

  navigator.vibrate?.(80);
  void confetti({ particleCount: 90, spread: 70, origin: { y: 0.78 } });
  return receipt;
}
