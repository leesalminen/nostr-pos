import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';

import '../protocol/event.dart';
import '../protocol/kinds.dart';

class SwapRecoverySummary {
  SwapRecoverySummary({
    required this.saleId,
    required this.paymentAttemptId,
    required this.swapId,
    required this.expiresAt,
    required this.encryptedLocalBlob,
    this.terminalId,
  });

  final String saleId;
  final String paymentAttemptId;
  final String swapId;
  final int expiresAt;
  final String encryptedLocalBlob;
  final String? terminalId;

  bool get expired =>
      expiresAt <= DateTime.now().millisecondsSinceEpoch ~/ 1000;

  Map<String, Object?> toJson() => {
    'sale_id': saleId,
    'payment_attempt_id': paymentAttemptId,
    'swap_id': swapId,
    'expires_at': expiresAt,
    'expired': expired,
    'encrypted_local_blob': encryptedLocalBlob,
    'terminal_id': terminalId,
  };
}

class SwapRecoveryMaterial {
  SwapRecoveryMaterial({required this.summary, required this.payload});

  final SwapRecoverySummary summary;
  final Map<String, Object?> payload;

  Map<String, Object?>? get swap {
    final value = payload['swap'];
    return value is Map ? value.cast<String, Object?>() : null;
  }

  String? get settlementAddress {
    final value = payload['settlement'];
    if (value is! Map) return null;
    return value.cast<String, Object?>()['address'] as String?;
  }

  Map<String, Object?> toJson() => {
    ...summary.toJson(),
    'settlement_address': settlementAddress,
    'swap': swap,
  };
}

List<SwapRecoverySummary> swapRecoveriesFromEvents(List<NostrPosEvent> events) {
  final recoveries = <String, SwapRecoverySummary>{};
  for (final event in events) {
    if (event.kind != NostrPosKinds.swapRecoveryBackup ||
        !event.hasProtocolTag ||
        !event.idMatches) {
      continue;
    }
    final content = jsonDecode(event.content) as Map<String, Object?>;
    final swapId = content['swap_id'] as String?;
    if (swapId == null) continue;
    final terminalId = event.tags
        .where((tag) => tag.length >= 2 && tag[0] == 'terminal')
        .map((tag) => tag[1])
        .cast<String?>()
        .firstOrNull;
    recoveries[swapId] = SwapRecoverySummary(
      saleId: content['sale_id']! as String,
      paymentAttemptId: content['payment_attempt_id']! as String,
      swapId: swapId,
      expiresAt: content['expires_at']! as int,
      encryptedLocalBlob: content['encrypted_local_blob']! as String,
      terminalId: terminalId,
    );
  }
  return recoveries.values.toList()
    ..sort((a, b) => a.expiresAt.compareTo(b.expiresAt));
}

List<Map<String, Object?>> recoveryClaimPlan(
  List<SwapRecoverySummary> recoveries,
) {
  return recoveries
      .map(
        (recovery) => {
          'swap_id': recovery.swapId,
          'sale_id': recovery.saleId,
          'action': recovery.expired
              ? 'audit_expired'
              : 'poll_provider_then_claim',
          'has_encrypted_material': recovery.encryptedLocalBlob.isNotEmpty,
        },
      )
      .toList();
}

Future<Map<String, Object?>> decryptTerminalRecoveryBlob({
  required String encryptedLocalBlob,
  required String terminalId,
}) async {
  final raw = base64Decode(encryptedLocalBlob);
  if (raw.length <= 12 + 16) {
    throw const FormatException('Recovery blob is too short.');
  }
  final secretKey = SecretKey(
    sha256.convert(utf8.encode('nostr-pos:$terminalId')).bytes,
  );
  final secretBox = SecretBox.fromConcatenation(
    raw,
    nonceLength: 12,
    macLength: 16,
  );
  final decrypted = await AesGcm.with256bits().decrypt(
    secretBox,
    secretKey: secretKey,
  );
  final payload = jsonDecode(utf8.decode(decrypted));
  if (payload is! Map) {
    throw const FormatException('Recovery blob did not decode to an object.');
  }
  return payload.cast<String, Object?>();
}

Future<SwapRecoveryMaterial> decryptSwapRecovery(
  SwapRecoverySummary recovery, {
  String? terminalId,
}) async {
  final recoveryTerminalId = terminalId ?? recovery.terminalId;
  if (recoveryTerminalId == null || recoveryTerminalId.isEmpty) {
    throw StateError('Recovery record is missing a terminal id.');
  }
  return SwapRecoveryMaterial(
    summary: recovery,
    payload: await decryptTerminalRecoveryBlob(
      encryptedLocalBlob: recovery.encryptedLocalBlob,
      terminalId: recoveryTerminalId,
    ),
  );
}
