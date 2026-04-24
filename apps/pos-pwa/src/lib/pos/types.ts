export type PaymentMethod = 'liquid' | 'lightning_swap' | 'bolt_card';
export type SaleStatus =
  | 'created'
  | 'payment_preparing'
  | 'payment_ready'
  | 'payment_detected'
  | 'settling'
  | 'settled'
  | 'receipt_ready'
  | 'expired'
  | 'failed'
  | 'needs_recovery'
  | 'cancelled';

export type PaymentStatus =
  | 'created'
  | 'waiting'
  | 'detected'
  | 'settling'
  | 'settled'
  | 'expired'
  | 'failed'
  | 'needs_recovery';

export type Sale = {
  id: string;
  receiptNumber: string;
  posRef: string;
  terminalId: string;
  amountFiat: string;
  fiatCurrency: string;
  amountSat: number;
  note?: string;
  discountFiat?: string;
  status: SaleStatus;
  activePaymentAttemptId?: string;
  createdAt: number;
  updatedAt: number;
};

export type PaymentAttempt = {
  id: string;
  saleId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  paymentData?: string;
  settlementTxid?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
};

export type Receipt = {
  id: string;
  saleId: string;
  createdAt: number;
  printedAt?: number;
};

export type SwapRecoveryRecord = {
  saleId: string;
  paymentAttemptId: string;
  swapId: string;
  encryptedLocalBlob: string;
  localSavedAt: number;
  relaySavedAt?: number;
  okFrom: string[];
  expiresAt: number;
  claimTxHex?: string;
  claimTxid?: string;
  status: 'pending' | 'claimable' | 'claimed' | 'failed' | 'expired';
};

export type TerminalConfig = {
  merchantName: string;
  posName: string;
  currency: string;
  terminalId: string;
  terminalPubkey: string;
  terminalPrivkeyEnc?: string;
  pairingCode: string;
  activatedAt?: number;
  authorization?: unknown;
  maxInvoiceSat: number;
  syncServers: string[];
};

export type TransactionRow = {
  sale: Sale;
  attempt?: PaymentAttempt;
  receipt?: Receipt;
};
