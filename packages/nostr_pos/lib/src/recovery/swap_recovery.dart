import 'dart:convert';

import '../protocol/event.dart';
import '../protocol/kinds.dart';

class SwapRecoverySummary {
  SwapRecoverySummary({
    required this.saleId,
    required this.paymentAttemptId,
    required this.swapId,
    required this.expiresAt,
    required this.encryptedLocalBlob,
  });

  final String saleId;
  final String paymentAttemptId;
  final String swapId;
  final int expiresAt;
  final String encryptedLocalBlob;

  bool get expired =>
      expiresAt <= DateTime.now().millisecondsSinceEpoch ~/ 1000;

  Map<String, Object?> toJson() => {
    'sale_id': saleId,
    'payment_attempt_id': paymentAttemptId,
    'swap_id': swapId,
    'expires_at': expiresAt,
    'expired': expired,
    'encrypted_local_blob': encryptedLocalBlob,
  };
}

List<SwapRecoverySummary> swapRecoveriesFromEvents(List<NostrPosEvent> events) {
  final recoveries = <String, SwapRecoverySummary>{};
  for (final event in events) {
    if (event.kind != NostrPosKinds.swapRecoveryBackup ||
        !event.hasProtocolTag ||
        !event.idMatches)
      continue;
    final content = jsonDecode(event.content) as Map<String, Object?>;
    final swapId = content['swap_id'] as String?;
    if (swapId == null) continue;
    recoveries[swapId] = SwapRecoverySummary(
      saleId: content['sale_id']! as String,
      paymentAttemptId: content['payment_attempt_id']! as String,
      swapId: swapId,
      expiresAt: content['expires_at']! as int,
      encryptedLocalBlob: content['encrypted_local_blob']! as String,
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
