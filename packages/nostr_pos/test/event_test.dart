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

  test('builds testnet POS profile and terminal authorization payloads', () {
    final profileEvent = buildPosProfileEvent(
      merchantPubkey: 'a' * 64,
      posId: 'seguras',
      profile: PosProfile(
        name: 'Counter 1',
        merchantName: 'Seguras Butcher',
        currency: 'CRC',
        network: PosNetwork.testnet,
      ),
    );

    expect(
      profileEvent.tags,
      anyElement(equals(['network', 'liquid-testnet'])),
    );
    final profile = jsonDecode(profileEvent.content) as Map<String, Object?>;
    expect(
      (profile['liquid_backends'] as List).first,
      containsPair('url', 'https://liquid.bullbitcoin.com/testnet/api'),
    );
    expect(
      (profile['swap_providers'] as List).first,
      containsPair('id', 'boltz-testnet'),
    );

    final authorization = TerminalAuthorization(
      posRef: posRef(merchantPubkey: 'a' * 64, posId: 'seguras'),
      terminalPubkey: 'b' * 64,
      terminalId: '1' * 32,
      terminalName: 'Counter 1',
      pairingCodeHint: 'ABCD-EFGH',
      ctDescriptor: 'ct(slip77(00),elwpkh(xpub-demo/0/*))',
      descriptorFingerprint: 'demo-fingerprint',
      terminalBranch: 17,
      merchantRecoveryPubkey: 'c' * 64,
      saleBucketSecret: 'd' * 64,
      saleBucketGeneration: 1,
      effectiveFromEpochDay: 19800,
      expiresAt: 1790000000,
      network: PosNetwork.testnet,
    );

    expect(authorization.toJson(), containsPair('network', 'liquid-testnet'));
    expect(
      (authorization.toJson()['swap_providers'] as List).first,
      containsPair('api_base', 'https://api.testnet.boltz.exchange'),
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
      isFalse,
    );
    expect(
      event.tags.any(
        (tag) => tag.length == 2 && tag[0] == 'expiration' && tag[1] == '220',
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
