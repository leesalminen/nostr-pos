import 'dart:convert';
import 'dart:io';

import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test(
    'record-sale keeps sale ids and statuses out of relay-visible tags',
    () async {
      final temp = await Directory.systemTemp.createTemp('nostr-pos-cli-');
      addTearDown(() => temp.delete(recursive: true));
      final storePath = '${temp.path}/events.jsonl';

      final result = await Process.run('dart', [
        'run',
        'bin/nostr_pos.dart',
        'record-sale',
        '--store',
        storePath,
        '--sale-id',
        'sale-demo',
        '--status',
        'settled',
      ], workingDirectory: Directory.current.path);

      expect(result.exitCode, 0, reason: result.stderr as String?);
      final stdoutText = result.stdout as String;
      final events =
          (jsonDecode(stdoutText.substring(stdoutText.indexOf('['))) as List)
              .map(
                (json) => NostrPosEvent.fromJson(
                  (json as Map).cast<String, Object?>(),
                ),
              )
              .toList();

      expect(events.map((event) => event.kind), [
        NostrPosKinds.saleCreated,
        NostrPosKinds.paymentStatus,
        NostrPosKinds.receipt,
      ]);
      for (final event in events) {
        expect(
          event.tags.any(
            (tag) =>
                tag.length >= 2 && tag[0] == 'sale' && tag[1] == 'sale-demo',
          ),
          isFalse,
        );
        expect(
          event.tags.any((tag) => tag.length >= 2 && tag[0] == 'status'),
          isFalse,
        );
      }
      expect(events[0].content, contains('"sale_id":"sale-demo"'));
      expect(events[1].content, contains('"status":"settled"'));
    },
  );
}
