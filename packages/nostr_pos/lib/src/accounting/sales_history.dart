import 'dart:convert';

import '../protocol/event.dart';
import '../protocol/kinds.dart';
import '../protocol/nip44.dart';
import '../protocol/payment_methods.dart';

enum SaleStatus { waiting, settled, expired, refunded, created, unknown }

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

  String get statusRaw => status;
  String? get methodRaw => method;

  SaleStatus get statusKind {
    return switch (status) {
      'waiting' => SaleStatus.waiting,
      'settled' => SaleStatus.settled,
      'expired' => SaleStatus.expired,
      'refunded' => SaleStatus.refunded,
      'created' => SaleStatus.created,
      _ => SaleStatus.unknown,
    };
  }

  PosPaymentMethod? get methodKind => PosPaymentMethod.parse(method);

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

class _DecodedAccountingEvent {
  _DecodedAccountingEvent({
    required this.kind,
    required this.content,
    required this.createdAt,
  });

  final int kind;
  final Map<String, Object?> content;
  final int createdAt;
}

List<SaleSummary> salesHistoryFromEvents(List<NostrPosEvent> events) {
  return _salesHistoryFromDecoded(
    events
        .map(_decodePlainAccountingEvent)
        .whereType<_DecodedAccountingEvent>(),
  );
}

Future<List<SaleSummary>> salesHistoryFromEventsForMerchant(
  List<NostrPosEvent> events, {
  required String merchantRecoveryPrivkey,
  Set<String>? authorizedTerminalPubkeys,
}) async {
  final decoded = <_DecodedAccountingEvent>[];
  for (final event in events) {
    if (authorizedTerminalPubkeys != null &&
        event.kind != NostrPosKinds.swapRecoveryBackup &&
        !authorizedTerminalPubkeys.contains(event.pubkey)) {
      continue;
    }
    final content = await _decodeMerchantAccountingEvent(
      event,
      merchantRecoveryPrivkey: merchantRecoveryPrivkey,
    );
    if (content != null) decoded.add(content);
  }
  return _salesHistoryFromDecoded(decoded);
}

List<SaleSummary> _salesHistoryFromDecoded(
  Iterable<_DecodedAccountingEvent> events,
) {
  final created = <String, Map<String, Object?>>{};
  final latestStatus = <String, Map<String, Object?>>{};
  final receipts = <String, Map<String, Object?>>{};
  final recovered = <String, Map<String, Object?>>{};

  for (final event in events) {
    final content = event.content;
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
      case NostrPosKinds.swapRecoveryBackup:
        final claim = content['claim'] is Map
            ? (content['claim'] as Map).cast<String, Object?>()
            : const <String, Object?>{};
        final claimTxid = claim['claim_txid'] as String?;
        if (claimTxid == null || claimTxid.isEmpty) continue;
        final current = recovered[saleId];
        final updatedAt =
            (claim['claim_broadcast_at'] as int?) ??
            (claim['claim_confirmed_at'] as int?) ??
            event.createdAt;
        if (current == null ||
            updatedAt >= (current['updated_at'] as int? ?? 0)) {
          recovered[saleId] = {
            'sale_id': saleId,
            'status': 'settled',
            'method': 'lightning_swap',
            'updated_at': updatedAt,
            'payment': {
              'boltz_swap_id': content['swap_id'],
              'settlement_txid': claimTxid,
              'recovered': true,
            },
          };
        }
    }
  }

  for (final entry in recovered.entries) {
    final current = latestStatus[entry.key];
    if (current == null ||
        (entry.value['updated_at'] as int? ?? 0) >=
            (current['updated_at'] as int? ?? 0)) {
      latestStatus[entry.key] = entry.value;
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

_DecodedAccountingEvent? _decodePlainAccountingEvent(NostrPosEvent event) {
  if (event.kind == NostrPosKinds.swapRecoveryBackup) {
    return _decodeRecoveryEvent(event);
  }
  if (!_isAccountingEnvelope(event)) return null;
  final content = _decodeJsonObject(event.content);
  if (content == null) return null;
  return _DecodedAccountingEvent(
    kind: event.kind,
    content: content,
    createdAt: event.createdAt,
  );
}

Future<_DecodedAccountingEvent?> _decodeMerchantAccountingEvent(
  NostrPosEvent event, {
  required String merchantRecoveryPrivkey,
}) async {
  if (event.kind == NostrPosKinds.swapRecoveryBackup) {
    return _decodeRecoveryEvent(event);
  }
  if (!_isAccountingEnvelope(event)) return null;
  final plain = _decodeJsonObject(event.content);
  if (plain != null) {
    return _DecodedAccountingEvent(
      kind: event.kind,
      content: plain,
      createdAt: event.createdAt,
    );
  }

  try {
    final decrypted = await nip44DecryptFromPubkey(
      payload: event.content,
      privateKeyHex: merchantRecoveryPrivkey,
      publicKeyHex: event.pubkey,
    );
    final content = _decodeJsonObject(decrypted);
    if (content == null) return null;
    return _DecodedAccountingEvent(
      kind: event.kind,
      content: content,
      createdAt: event.createdAt,
    );
  } catch (_) {
    return null;
  }
}

_DecodedAccountingEvent? _decodeRecoveryEvent(NostrPosEvent event) {
  if (!event.idMatches || !event.hasProtocolTag) return null;
  final content = _decodeJsonObject(event.content);
  if (content == null) return null;
  if (content['sale_id'] is! String || content['swap_id'] is! String) {
    return null;
  }
  return _DecodedAccountingEvent(
    kind: event.kind,
    content: content,
    createdAt: event.createdAt,
  );
}

bool _isAccountingEnvelope(NostrPosEvent event) {
  return event.idMatches &&
      event.hasProtocolTag &&
      event.tags.any((tag) => tag.length >= 2 && tag[0] == 'x') &&
      !event.tags.any(
        (tag) => tag.isNotEmpty && (tag[0] == 'a' || tag[0] == 'p'),
      ) &&
      (event.kind == NostrPosKinds.saleCreated ||
          event.kind == NostrPosKinds.paymentStatus ||
          event.kind == NostrPosKinds.receipt);
}

Map<String, Object?>? _decodeJsonObject(String value) {
  try {
    final decoded = jsonDecode(value);
    if (decoded is! Map) return null;
    return decoded.cast<String, Object?>();
  } catch (_) {
    return null;
  }
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
