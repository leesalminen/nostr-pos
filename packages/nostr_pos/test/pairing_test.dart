import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test('derives Crockford pairing code from first five pubkey bytes', () {
    expect(
      pairingCodeFromPubkey(
        '23cf0f49b6f5db3c6ef008a0df8918df95e4436bda46e5b9d67b8b7c9d5f5bb1',
      ),
      '4F7G-YJDP',
    );
  });

  test('rejects malformed terminal keys', () {
    expect(() => pairingCodeFromPubkey('abc'), throwsArgumentError);
  });
}
