import 'dart:convert';

import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test('builds POS profile event with protocol tag and stable id', () {
    final event = buildPosProfileEvent(
      merchantPubkey: 'a' * 64,
      posId: 'seguras',
      profile: PosProfile(
        name: 'Counter 1',
        merchantName: 'Seguras Butcher',
        currency: 'CRC',
      ),
    );

    expect(event.kind, NostrPosKinds.posProfile);
    expect(event.hasProtocolTag, isTrue);
    expect(event.idMatches, isTrue);
    expect(
      jsonDecode(event.content),
      containsPair('merchant_name', 'Seguras Butcher'),
    );
  });

  test('builds pairing announcement from terminal key', () {
    final event = buildPairingAnnouncement(
      terminalPubkey:
          '23cf0f49b6f5db3c6ef008a0df8918df95e4436bda46e5b9d67b8b7c9d5f5bb1',
      createdAt: 100,
    );

    expect(event.kind, NostrPosKinds.pairingAnnouncement);
    expect(
      event.tags.any(
        (tag) => tag.length == 2 && tag[0] == 'd' && tag[1] == '4F7G-YJDP',
      ),
      isTrue,
    );
    expect(
      event.tags.any((tag) => tag.isNotEmpty && tag[0] == 'pairing'),
      isFalse,
    );
    expect(
      event.tags.any(
        (tag) => tag.length == 2 && tag[0] == 'expiration' && tag[1] == '400',
      ),
      isTrue,
    );
  });

  test('signs and verifies events with BIP340 Schnorr signatures', () {
    final privateKey =
        '0000000000000000000000000000000000000000000000000000000000000001';
    final publicKey = publicKeyFromPrivateKey(privateKey);
    final event = buildUnsignedEvent(
      pubkey: publicKey,
      kind: NostrPosKinds.paymentStatus,
      tags: [
        ['sale', 'sale1'],
      ],
      content: {'sale_id': 'sale1'},
      createdAt: 1000,
    );

    final signed = signNostrPosEvent(event, privateKey);
    expect(signed.sig, hasLength(128));
    expect(verifyNostrPosEventSignature(signed), isTrue);
  });
}
