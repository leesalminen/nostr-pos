import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test(
    'matches nostr-tools NIP-44 v2 conversation key and payload vector',
    () async {
      const privateKey =
          '0000000000000000000000000000000000000000000000000000000000000001';
      const publicKey =
          'c6047f9441ed7d6d3045406e95c07cd85a08cfdf5f1e2327ce9f4014832a7726';
      final conversationKey = nip44ConversationKey(
        privateKeyHex: privateKey,
        publicKeyHex: publicKey,
      );

      expect(
        conversationKey
            .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
            .join(),
        '3db97e74972d984ba6fa9bd48912660d9c20824cd6acddbad0821f7f51440534',
      );

      final payload = await nip44Encrypt(
        plaintext: 'hello',
        conversationKey: conversationKey,
        nonce: List<int>.generate(32, (index) => index),
      );

      expect(
        payload,
        'AgABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4finSweGC/m4uzdBHF10CjETOv/gebLidhq1KCyM5DFngv82pIGs2VVYYMs5MSdd2FHf8VDvStCcBzp5QWphMd7uhJ',
      );
      expect(
        await nip44Decrypt(payload: payload, conversationKey: conversationKey),
        'hello',
      );
    },
  );
}
