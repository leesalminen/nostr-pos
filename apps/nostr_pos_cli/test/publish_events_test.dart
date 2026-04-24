import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test(
    'publish-events sends newest matching kind first when limited',
    () async {
      final temp = await Directory.systemTemp.createTemp('nostr-pos-cli-');
      addTearDown(() => temp.delete(recursive: true));
      final storePath = '${temp.path}/events.jsonl';
      final oldEvent = buildUnsignedEvent(
        pubkey: 'a' * 64,
        kind: NostrPosKinds.terminalAuthorization,
        tags: [
          ['p', 'old-terminal'],
        ],
        content: {'terminal_pubkey': 'old-terminal'},
        createdAt: 100,
      );
      final newEvent = buildUnsignedEvent(
        pubkey: 'a' * 64,
        kind: NostrPosKinds.terminalAuthorization,
        tags: [
          ['p', 'new-terminal'],
        ],
        content: {'terminal_pubkey': 'new-terminal'},
        createdAt: 200,
      );
      await File(storePath).writeAsString(
        '${jsonEncode(oldEvent.toJson())}\n${jsonEncode(newEvent.toJson())}\n',
      );

      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final publishedIds = <String>[];
      unawaited(
        server.forEach((request) async {
          final socket = await WebSocketTransformer.upgrade(request);
          await for (final message in socket) {
            final decoded = jsonDecode(message as String) as List<Object?>;
            if (decoded.isEmpty || decoded[0] != 'EVENT') continue;
            final event = NostrPosEvent.fromJson(
              (decoded[1] as Map).cast<String, Object?>(),
            );
            publishedIds.add(event.id);
            socket.add(jsonEncode(['OK', event.id, true, 'stored']));
          }
        }),
      );
      addTearDown(() => server.close(force: true));

      final result = await Process.run('dart', [
        'run',
        'bin/nostr_pos.dart',
        'publish-events',
        '--store',
        storePath,
        '--relays',
        'ws://${server.address.host}:${server.port}',
        '--kind',
        '${NostrPosKinds.terminalAuthorization}',
        '--limit',
        '1',
      ], workingDirectory: Directory.current.path);

      expect(result.exitCode, 0, reason: result.stderr as String?);
      final stdoutText = result.stdout as String;
      final output =
          jsonDecode(stdoutText.substring(stdoutText.indexOf('['))) as List;
      expect(output.single['event_id'], newEvent.id);
      expect(publishedIds, [newEvent.id]);
    },
  );
}
