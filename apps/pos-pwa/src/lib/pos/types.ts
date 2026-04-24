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
  fxRate?: {
    indexPrice: number;
    precision: number;
    createdAt?: string;
  };
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
  lightningInvoice?: string;
  liquidPaymentData?: string;
  liquidAddress?: string;
  addressIndex?: number;
  terminalBranch?: number;
  swapId?: string;
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
  lockupTxid?: string;
  lockupTxHex?: string;
  claimTxHex?: string;
  claimTxid?: string;
  replacedClaimTxids?: string[];
  claimPreparedAt?: number;
  claimLastTriedAt?: number;
  claimBroadcastAttempts?: number;
  claimLastError?: string;
  claimFeeSatPerVbyte?: number;
  claimRbfCount?: number;
  claimBroadcastAt?: number;
  claimConfirmedAt?: number;
  claimNeedsFeeBump?: boolean;
  status: 'pending' | 'claimable' | 'claimed' | 'failed' | 'expired';
};

export type LiquidBackend = {
  type: 'esplora';
  url: string;
};

export type TerminalAuthorization = {
  ct_descriptor?: string;
  descriptor_fingerprint?: string;
  liquid_backends?: LiquidBackend[];
  merchant_recovery_pubkey?: string;
  swap_providers?: {
    id: string;
    type: 'boltz';
    api_base: string;
    ws_url?: string;
    supports_covenants?: boolean;
  }[];
  settlement?: {
    terminal_branch?: number;
  };
  [key: string]: unknown;
};

export type PosProfileConfig = {
  merchantPubkey: string;
  posId: string;
  eventId: string;
  loadedAt: number;
  relays: string[];
};

export type AdminPinConfig = {
  salt: string;
  verifier: string;
  iterations: number;
  setAt: number;
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
  revokedAt?: number;
  revocationReason?: string;
  authorization?: TerminalAuthorization;
  posProfile?: PosProfileConfig;
  adminPin?: AdminPinConfig;
  maxInvoiceSat: number;
  syncServers: string[];
};

export type TransactionRow = {
  sale: Sale;
  attempt?: PaymentAttempt;
  receipt?: Receipt;
};

export type OutboxItem = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: number;
  okFrom: string[];
  attempts?: number;
  lastTriedAt?: number;
  lastError?: string;
};
