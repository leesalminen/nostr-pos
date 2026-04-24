import type { SwapRecoveryRecord, TransactionRow } from './types';

export function transactionsCsv(rows: TransactionRow[]): string {
  const header = [
    'receipt_number',
    'date',
    'sale_id',
    'terminal_id',
    'amount_fiat',
    'currency',
    'amount_sats',
    'method',
    'status',
    'settlement_txid',
    'discount',
    'note',
    'printed_at'
  ];
  const lines = rows.map(({ sale, attempt, receipt }) =>
    [
      sale.receiptNumber,
      new Date(sale.createdAt).toISOString(),
      sale.id,
      sale.terminalId,
      sale.amountFiat,
      sale.fiatCurrency,
      sale.amountSat,
      attempt?.method ?? '',
      sale.status,
      attempt?.settlementTxid ?? '',
      sale.discountFiat ?? '',
      sale.note ?? '',
      receipt?.printedAt ? new Date(receipt.printedAt).toISOString() : ''
    ]
      .map(csvCell)
      .join(',')
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}

function csvCell(value: unknown): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function recoveryBackupsJson(records: SwapRecoveryRecord[], exportedAt = new Date()): string {
  return JSON.stringify(
    {
      version: 1,
      exported_at: exportedAt.toISOString(),
      record_count: records.length,
      records: records.map((record) => ({
        sale_id: record.saleId,
        payment_attempt_id: record.paymentAttemptId,
        swap_id: record.swapId,
        encrypted_local_blob: record.encryptedLocalBlob,
        local_saved_at: new Date(record.localSavedAt).toISOString(),
        relay_saved_at: record.relaySavedAt ? new Date(record.relaySavedAt).toISOString() : null,
        ok_from: record.okFrom,
        expires_at: new Date(record.expiresAt).toISOString(),
        claim_tx_hex: record.claimTxHex ?? null,
        claim_txid: record.claimTxid ?? null,
        status: record.status
      }))
    },
    null,
    2
  );
}
