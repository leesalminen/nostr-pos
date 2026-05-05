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
        'terminal_id': 'term1',
        'expires_at': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
        'encrypted_local_blob': 'ciphertext',
        'claim': {
          'claim_tx_hex': 'claimhex',
          'claim_txid': null,
          'replaced_claim_txids': ['oldclaimtxid'],
        },
      },
    );

    final recoveries = swapRecoveriesFromEvents([event]);
    expect(recoveries.single.swapId, 'swap1');
    expect(recoveries.single.terminalId, 'term1');
    expect(recoveries.single.claimTxHex, 'claimhex');
    expect(recoveries.single.replacedClaimTxids, ['oldclaimtxid']);
    expect(
      recoveryClaimPlan(recoveries).single['action'],
      'broadcast_prepared_claim',
    );
  });

  test('extracts terminal id from private recovery content', () {
    final event = buildUnsignedEvent(
      pubkey: 'c' * 64,
      kind: NostrPosKinds.swapRecoveryBackup,
      tags: [
        ['swap', 'swap1'],
      ],
      content: {
        'sale_id': 'sale1',
        'payment_attempt_id': 'attempt1',
        'swap_id': 'swap1',
        'terminal_id': 'term1',
        'expires_at': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
        'encrypted_local_blob': 'ciphertext',
      },
    );

    final recoveries = swapRecoveriesFromEvents([event]);

    expect(recoveries.single.terminalId, 'term1');
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

  test('builds post-recovery backup events with the legacy claim shape', () {
    final now = DateTime.fromMillisecondsSinceEpoch(1710000000 * 1000);
    final recovery = SwapRecoverySummary(
      saleId: 'sale1',
      paymentAttemptId: 'attempt1',
      swapId: 'swap1',
      expiresAt: 1790000000,
      encryptedLocalBlob: 'ciphertext',
      terminalId: 'term1',
      lockupTxid: 'lockup-txid',
      lockupTxHex: 'lockup-hex',
      claimTxHex: 'claim-hex',
      replacedClaimTxids: ['old-claim'],
    );
    final result = ControllerRecoveryResult(
      swapId: 'swap1',
      status: 'broadcast',
      claimTxid: 'claim-txid',
    );

    final event = buildSwapRecoveryBackupEvent(
      recovery: recovery,
      result: result,
      authorPubkey: 'c' * 64,
      feeSatPerVbyte: 0.15,
      now: now,
    );

    expect(event, isNotNull);
    expect(event!.kind, NostrPosKinds.swapRecoveryBackup);
    expect(event.createdAt, 1710000000);
    expect(event.tags, anyElement(equals(['sale', 'sale1'])));
    expect(event.tags, anyElement(equals(['swap', 'swap1'])));
    expect(
      event.content,
      buildUnsignedEvent(
        pubkey: 'c' * 64,
        kind: NostrPosKinds.swapRecoveryBackup,
        tags: [
          ['sale', 'sale1'],
          ['swap', 'swap1'],
        ],
        createdAt: 1710000000,
        content: {
          'sale_id': 'sale1',
          'payment_attempt_id': 'attempt1',
          'swap_id': 'swap1',
          'terminal_id': 'term1',
          'encrypted_local_blob': 'ciphertext',
          'expires_at': 1790000000,
          'lockup_txid': 'lockup-txid',
          'lockup_tx_hex': 'lockup-hex',
          'claim': {
            'mode': 'standard',
            'claim_tx_hex': 'claim-hex',
            'claim_txid': 'claim-txid',
            'replaced_claim_txids': ['old-claim'],
            'claim_prepared_at': null,
            'claim_broadcast_at': 1710000000,
            'claim_confirmed_at': null,
            'claim_fee_sat_per_vbyte': 0.15,
            'claim_rbf_count': 0,
          },
        },
      ).content,
    );
    final parsed = SwapRecoveryBackup.fromEvent(event);
    expect(parsed.summary.claimTxid, 'claim-txid');
    expect(parsed.claimBroadcastAt, 1710000000);
    expect(parsed.claimFeeSatPerVbyte, 0.15);
  });

  test('recovery result helpers classify publishable states', () {
    final broadcast = ControllerRecoveryResult(
      swapId: 'swap1',
      status: 'broadcast',
    );
    final waiting = ControllerRecoveryResult(
      swapId: 'swap1',
      status: 'waiting',
    );
    final unknown = ControllerRecoveryResult(swapId: 'swap1', status: 'newer');

    expect(broadcast.isSuccess, isTrue);
    expect(broadcast.shouldPublishRecoveryBackup, isTrue);
    expect(waiting.isWaiting, isTrue);
    expect(waiting.shouldPublishRecoveryBackup, isFalse);
    expect(unknown.statusKind, RecoveryStatus.unknown);
    expect(unknown.defaultDebugMessage, contains('newer'));
  });
}
