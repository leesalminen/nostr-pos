import type { PaymentAttempt, Sale } from '../pos/types';

export const KINDS = {
  terminalAuthorization: 30381,
  terminalRevocation: 30382,
  pairingAnnouncement: 30383,
  saleCreated: 9380,
  swapRecovery: 9381,
  paymentStatus: 9382,
  receipt: 9383
} as const;

export type LocalProtocolEvent = {
  kind: number;
  tags: string[][];
  content: Record<string, unknown>;
};

export function pairingAnnouncementEvent(input: {
  terminalPubkey: string;
  pairingCode: string;
  createdAt: number;
}): LocalProtocolEvent {
  return {
    kind: KINDS.pairingAnnouncement,
    tags: [
      ['proto', 'nostr-pos', '0.2'],
      ['d', input.pairingCode],
      ['pairing', input.pairingCode],
      ['p', input.terminalPubkey],
      ['expiration', String(Math.floor(input.createdAt / 1000) + 300)]
    ],
    content: {
      pairing_code: input.pairingCode,
      terminal_pubkey: input.terminalPubkey,
      created_at: Math.floor(input.createdAt / 1000)
    }
  };
}

export function saleCreatedEvent(sale: Sale): LocalProtocolEvent {
  return {
    kind: KINDS.saleCreated,
    tags: [
      ['proto', 'nostr-pos', '0.2'],
      ['sale', sale.id],
      ['terminal', sale.terminalId]
    ],
    content: {
      sale_id: sale.id,
      created_at: Math.floor(sale.createdAt / 1000),
      amount: {
        fiat_currency: sale.fiatCurrency,
        fiat_amount: sale.amountFiat,
        sat_amount: sale.amountSat
      },
      note: sale.note ?? null,
      discount_fiat: sale.discountFiat ?? null,
      status: 'created'
    }
  };
}

export function paymentStatusEvent(sale: Sale, attempt: PaymentAttempt): LocalProtocolEvent {
  return {
    kind: KINDS.paymentStatus,
    tags: [
      ['proto', 'nostr-pos', '0.2'],
      ['sale', sale.id],
      ['terminal', sale.terminalId],
      ['status', attempt.status]
    ],
    content: {
      sale_id: sale.id,
      status: attempt.status,
      method: attempt.method,
      updated_at: Math.floor(attempt.updatedAt / 1000),
      payment: {
        settlement_txid: attempt.settlementTxid ?? null,
        liquid_address: attempt.liquidAddress ?? null,
        address_index: attempt.addressIndex ?? null,
        terminal_branch: attempt.terminalBranch ?? null
      }
    }
  };
}

export function receiptEvent(sale: Sale, attempt: PaymentAttempt): LocalProtocolEvent {
  return {
    kind: KINDS.receipt,
    tags: [
      ['proto', 'nostr-pos', '0.2'],
      ['sale', sale.id],
      ['terminal', sale.terminalId]
    ],
    content: {
      receipt_id: sale.receiptNumber,
      sale_id: sale.id,
      created_at: Math.floor(Date.now() / 1000),
      amount: {
        fiat_currency: sale.fiatCurrency,
        fiat_amount: sale.amountFiat,
        sat_amount: sale.amountSat
      },
      method: attempt.method,
      status: attempt.status,
      settlement_txid: attempt.settlementTxid ?? null,
      note: sale.note ?? null,
      discount_fiat: sale.discountFiat ?? null
    }
  };
}

export function swapRecoveryEvent(input: {
  saleId: string;
  paymentAttemptId: string;
  swapId: string;
  terminalId: string;
  encryptedLocalBlob: string;
  expiresAt: number;
  recoveryPubkey?: string;
}): LocalProtocolEvent {
  const tags = [
    ['proto', 'nostr-pos', '0.2'],
    ['sale', input.saleId],
    ['terminal', input.terminalId],
    ['swap', input.swapId]
  ];
  if (input.recoveryPubkey) tags.push(['p', input.recoveryPubkey]);
  return {
    kind: KINDS.swapRecovery,
    tags,
    content: {
      sale_id: input.saleId,
      payment_attempt_id: input.paymentAttemptId,
      swap_id: input.swapId,
      encrypted_local_blob: input.encryptedLocalBlob,
      expires_at: Math.floor(input.expiresAt / 1000)
    }
  };
}
