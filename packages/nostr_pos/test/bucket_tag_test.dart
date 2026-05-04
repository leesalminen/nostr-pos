import 'dart:math';

import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test('daily bucket tags are deterministic and generation-separated', () {
    final secret = hexToBytes('01' * 32);
    final day = epochDayFromUnix(1711929590);
    final first = dailyBucketTag(
      secret: secret,
      generation: 1,
      epochDayUtc: day,
    );
    final again = dailyBucketTag(
      secret: secret,
      generation: 1,
      epochDayUtc: day,
    );
    final rotated = dailyBucketTag(
      secret: secret,
      generation: 2,
      epochDayUtc: day,
    );
    final attacker = dailyBucketTag(
      secret: hexToBytes('02' * 32),
      generation: 1,
      epochDayUtc: day,
    );

    expect(first, again);
    expect(first, isNot(rotated));
    expect(first, isNot(attacker));
    expect(first, hasLength(64));
  });

  test('bucket window returns day minus one, day, day plus one', () {
    final secret = hexToBytes('03' * 32);
    final buckets = bucketWindow(
      secret: secret,
      generation: 1,
      epochDayUtc: 42,
    );

    expect(buckets, [
      dailyBucketTag(secret: secret, generation: 1, epochDayUtc: 41),
      dailyBucketTag(secret: secret, generation: 1, epochDayUtc: 42),
      dailyBucketTag(secret: secret, generation: 1, epochDayUtc: 43),
    ]);
  });

  test(
    'sale-stream builder buckets from content time and jitters envelope',
    () {
      final contentTime =
          DateTime.utc(2024, 4, 1, 23, 59, 50).millisecondsSinceEpoch ~/ 1000;
      final event = buildBucketedSaleStreamEvent(
        terminalPubkey: 'a' * 64,
        kind: NostrPosKinds.saleCreated,
        saleBucketSecret: '04' * 32,
        saleBucketGeneration: 1,
        contentCreatedAt: contentTime,
        spreadSeconds: 0,
        content: {'sale_id': 'sale1', 'created_at': contentTime},
      );

      expect(event.createdAt, contentTime);
    expect(
      event.tags,
      anyElement(
        equals([
          'x',
          dailyBucketTag(
            secret: hexToBytes('04' * 32),
            generation: 1,
            epochDayUtc: epochDayFromUnix(contentTime),
          ),
        ]),
      ),
    );
    },
  );

  test('jitter stays inside the configured spread and never goes negative', () {
    for (var i = 0; i < 100; i += 1) {
      final value = jitteredCreatedAt(
        baseCreatedAt: 10,
        spreadSeconds: 300,
        random: Random(i),
      );
      expect(value, inInclusiveRange(0, 310));
    }
  });
}
