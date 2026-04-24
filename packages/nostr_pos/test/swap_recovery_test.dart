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
        ['terminal', 'term1'],
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
    expect(recoveries.single.terminalId, 'term1');
    expect(
      recoveryClaimPlan(recoveries).single['action'],
      'poll_provider_then_claim',
    );
  });

  test('decrypts terminal WebCrypto recovery blobs', () async {
    const encryptedLocalBlob =
        'AAECAwQFBgcICQoL4Exd881egI0TK1AdVDJpUAw0fjZZm+yZYKCzY4Er4Z9lql4PqhEBIjR5NJqTXbN8dpoYgM/LLP6D0b0ZbyZp7JUP9r/MAvh1F+l3/2G8fTbpzX27BJBnjQH89NqKpbL2pZH/yQ6fboY=';

    final payload = await decryptTerminalRecoveryBlob(
      encryptedLocalBlob: encryptedLocalBlob,
      terminalId: 'term1',
    );

    expect((payload['settlement']! as Map)['address'], 'lq1destination');
    expect((payload['swap']! as Map)['id'], 'swap1');
  });

  test('decrypts a recovery summary using the terminal tag', () async {
    const encryptedLocalBlob =
        'AAECAwQFBgcICQoL4Exd881egI0TK1AdVDJpUAw0fjZZm+yZYKCzY4Er4Z9lql4PqhEBIjR5NJqTXbN8dpoYgM/LLP6D0b0ZbyZp7JUP9r/MAvh1F+l3/2G8fTbpzX27BJBnjQH89NqKpbL2pZH/yQ6fboY=';
    final material = await decryptSwapRecovery(
      SwapRecoverySummary(
        saleId: 'sale1',
        paymentAttemptId: 'attempt1',
        swapId: 'swap1',
        expiresAt: DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
        encryptedLocalBlob: encryptedLocalBlob,
        terminalId: 'term1',
      ),
    );

    expect(material.settlementAddress, 'lq1destination');
    expect(material.swap?['claimPrivateKey'], '33');
  });
}
