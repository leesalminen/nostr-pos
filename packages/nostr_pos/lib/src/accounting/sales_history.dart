import 'dart:convert';

import '../protocol/event.dart';
import '../protocol/kinds.dart';

class SaleSummary {
  SaleSummary({
    required this.saleId,
    required this.createdAt,
    required this.fiatCurrency,
    required this.fiatAmount,
    required this.satAmount,
    required this.status,
    this.method,
    this.settlementTxid,
    this.receiptId,
    this.note,
  });

  final String saleId;
  final int createdAt;
  final String fiatCurrency;
  final String fiatAmount;
  final int satAmount;
  final String status;
  final String? method;
  final String? settlementTxid;
  final String? receiptId;
  final String? note;

  Map<String, Object?> toJson() => {
    'sale_id': saleId,
    'created_at': createdAt,
    'fiat_currency': fiatCurrency,
    'fiat_amount': fiatAmount,
    'sat_amount': satAmount,
    'status': status,
    'method': method,
    'settlement_txid': settlementTxid,
    'receipt_id': receiptId,
    'note': note,
  };
}

List<SaleSummary> salesHistoryFromEvents(List<NostrPosEvent> events) {
  final created = <String, Map<String, Object?>>{};
  final latestStatus = <String, Map<String, Object?>>{};
  final receipts = <String, Map<String, Object?>>{};

  for (final event in events) {
    if (!event.idMatches || !event.hasProtocolTag) continue;
    final content = jsonDecode(event.content) as Map<String, Object?>;
    final saleId = content['sale_id'] as String?;
    if (saleId == null) continue;
    switch (event.kind) {
      case NostrPosKinds.saleCreated:
        created[saleId] = content;
      case NostrPosKinds.paymentStatus:
        final current = latestStatus[saleId];
        if (current == null ||
            (content['updated_at'] as int? ?? 0) >=
                (current['updated_at'] as int? ?? 0)) {
          latestStatus[saleId] = content;
        }
      case NostrPosKinds.receipt:
        receipts[saleId] = content;
    }
  }

  final summaries = created.entries.map((entry) {
    final saleId = entry.key;
    final sale = entry.value;
    final amount = sale['amount']! as Map<String, Object?>;
    final status = latestStatus[saleId];
    final receipt = receipts[saleId];
    final payment = status?['payment'] as Map<String, Object?>?;
    return SaleSummary(
      saleId: saleId,
      createdAt: sale['created_at']! as int,
      fiatCurrency: amount['fiat_currency']! as String,
      fiatAmount: amount['fiat_amount']! as String,
      satAmount: amount['sat_amount']! as int,
      status: (status?['status'] as String?) ?? (sale['status']! as String),
      method: status?['method'] as String?,
      settlementTxid: payment?['settlement_txid'] as String?,
      receiptId: receipt?['receipt_id'] as String?,
      note: sale['note'] as String?,
    );
  }).toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return summaries;
}

String salesHistoryCsv(List<SaleSummary> rows) {
  final buffer = StringBuffer()
    ..writeln(
      'sale_id,created_at,fiat_currency,fiat_amount,sat_amount,status,method,settlement_txid,receipt_id,note',
    );
  for (final row in rows) {
    buffer.writeln(
      [
        row.saleId,
        row.createdAt,
        row.fiatCurrency,
        row.fiatAmount,
        row.satAmount,
        row.status,
        row.method ?? '',
        row.settlementTxid ?? '',
        row.receiptId ?? '',
        row.note ?? '',
      ].map(_csvCell).join(','),
    );
  }
  return buffer.toString();
}

String _csvCell(Object value) {
  final text = value.toString();
  if (!text.contains(RegExp(r'[,"\n]'))) return text;
  return '"${text.replaceAll('"', '""')}"';
}
