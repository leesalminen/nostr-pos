import 'dart:convert';
import 'dart:io';

import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test('recover-swaps broadcasts prepared claim hex through Esplora', () async {
    final temp = await Directory.systemTemp.createTemp('nostr-pos-cli-');
    addTearDown(() => temp.delete(recursive: true));
    final storePath = '${temp.path}/events.jsonl';
    final event = buildUnsignedEvent(
      pubkey: 'c' * 64,
      kind: NostrPosKinds.swapRecoveryBackup,
      createdAt: 100,
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
        'claim': {
          'claim_tx_hex': 'claimhex',
          'claim_txid': null,
          'replaced_claim_txids': [],
        },
      },
    );
    await File(storePath).writeAsString('${jsonEncode(event.toJson())}\n');

    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final requests = <String>[];
    final serverDone = server.listen((request) async {
      requests.add('${request.method} ${request.uri.path}');
      expect(await utf8.decoder.bind(request).join(), 'claimhex');
      request.response
        ..statusCode = 200
        ..write('claimtxid');
      await request.response.close();
    }).asFuture<void>();
    addTearDown(() async {
      await server.close(force: true);
      await serverDone.catchError((_) {});
    });

    final result = await Process.run('dart', [
      'run',
      'bin/nostr_pos.dart',
      'recover-swaps',
      '--store',
      storePath,
      '--broadcast-prepared',
      '--liquid-api',
      'http://${server.address.host}:${server.port}',
    ], workingDirectory: Directory.current.path);

    expect(result.exitCode, 0, reason: result.stderr as String?);
    final stdoutText = result.stdout as String;
    final output =
        jsonDecode(stdoutText.substring(stdoutText.indexOf('['))) as List;
    expect(output.single, {
      'swap_id': 'swap1',
      'status': 'broadcast',
      'provider_status': 'created',
      'claim_txid': 'claimtxid',
      'reason': null,
    });
    expect(requests, ['POST /tx']);
  });
}
