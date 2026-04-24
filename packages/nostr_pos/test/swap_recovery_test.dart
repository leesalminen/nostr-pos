import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test('extracts recovery summaries and claim plan from recovery events', () {
    final event = buildUnsignedEvent(
      pubkey: 'c' * 64,
      kind: NostrPosKinds.swapRecoveryBackup,
      tags: [
        ['sale', 'sale1'],
        ['swap', 'swap1'],
      ],
      content: {
        'sale_id': 'sale1',
        'payment_attempt_id': 'attempt1',
        'swap_id': 'swap1',
        'expires_at': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
        'encrypted_local_blob': 'ciphertext',
      },
    );

    final recoveries = swapRecoveriesFromEvents([event]);
    expect(recoveries.single.swapId, 'swap1');
    expect(
      recoveryClaimPlan(recoveries).single['action'],
      'poll_provider_then_claim',
    );
  });
}
