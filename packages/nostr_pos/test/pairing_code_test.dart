import 'dart:math';

import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test('extracts pairing codes produced from terminal pubkeys', () {
    final random = Random(7);
    for (var i = 0; i < 1000; i += 1) {
      final pubkey = List<int>.generate(
        32,
        (_) => random.nextInt(256),
      ).map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
      final code = pairingCodeFromPubkey(pubkey);

      expect(extractPairingCode('scan:$code?foo=bar'), code);
      expect(isPairingCode(code.toLowerCase()), isTrue);
    }
  });

  test('rejects malformed pairing codes', () {
    expect(extractPairingCode('no code here'), isNull);
    expect(isPairingCode('0000-000'), isFalse);
    expect(isPairingCode('0000-000I'), isFalse);
    expect(isPairingCode('0000-000O'), isFalse);
  });
}
