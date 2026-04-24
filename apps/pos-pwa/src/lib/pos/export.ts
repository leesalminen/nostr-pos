import type { TransactionRow } from './types';

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
    'note'
  ];
  const lines = rows.map(({ sale, attempt }) =>
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
      sale.note ?? ''
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
