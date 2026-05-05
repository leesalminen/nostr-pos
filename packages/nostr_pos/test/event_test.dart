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
    expect(PosProfile.fromEvent(event).merchantName, 'Seguras Butcher');
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
      merchantName: 'Seguras Butcher',
      currency: 'CRC',
    );

    expect(authorization.toJson(), containsPair('network', 'liquid-testnet'));
    expect(
      authorization.toJson(),
      containsPair('merchant_name', 'Seguras Butcher'),
    );
    expect(authorization.toJson(), containsPair('currency', 'CRC'));
    expect(
      (authorization.toJson()['swap_providers'] as List).first,
      containsPair('api_base', 'https://api.testnet.boltz.exchange'),
    );
    expect(
      (authorization.toJson()['swap_providers'] as List).first,
      containsPair('supports_covenants', false),
    );
  });

  test('profile and terminal payloads accept deployment overrides', () {
    const services = PosServiceConfig(
      boltzApiBase: 'https://boltz.example',
      boltzWebSocketUrl: 'wss://boltz.example/v2/ws',
      liquidEsploraApiBase: 'https://esplora.example',
      fiatProvider: FiatProviderConfig(
        type: 'example_fx',
        url: 'https://fx.example',
        mode: 'merchant',
      ),
    );
    const methods = PosPaymentMethods(
      liquid: true,
      lightningSwap: false,
      boltCard: false,
    );
    final profileEvent = buildPosProfileEvent(
      merchantPubkey: 'a' * 64,
      posId: 'seguras',
      profile: PosProfile(
        name: 'Counter 1',
        merchantName: 'Seguras Butcher',
        currency: 'CRC',
        serviceConfig: services,
        paymentMethods: methods,
      ),
    );
    final profile = jsonDecode(profileEvent.content) as Map<String, Object?>;

    expect(profileEvent.tags, anyElement(equals(['method', 'liquid'])));
    expect(
      profileEvent.tags,
      isNot(anyElement(equals(['method', 'lightning_via_swap']))),
    );
    expect(
      profileEvent.tags,
      isNot(anyElement(equals(['method', 'bolt_card']))),
    );
    expect(profile['methods'] as List, hasLength(1));
    expect(
      (profile['swap_providers'] as List).first,
      containsPair('api_base', 'https://boltz.example'),
    );
    expect(profile['fiat_provider'], containsPair('type', 'example_fx'));
    final parsedProfile = PosProfile.fromEvent(profileEvent);
    expect(parsedProfile.serviceConfig.boltzApiBase, 'https://boltz.example');
    expect(parsedProfile.fiatProvider.type, 'example_fx');

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
      serviceConfig: services,
      paymentMethods: methods,
      limits: const PosTerminalLimits(
        maxInvoiceSat: 5000,
        dailyVolumeSat: 100000,
        lookahead: 42,
        supportsCovenants: true,
      ),
    );
    final payload = authorization.toJson();

    expect(payload['settlement'], containsPair('lookahead', 42));
    expect(payload['limits'], containsPair('allow_lightning', false));
    expect(
      (payload['swap_providers'] as List).first,
      containsPair('supports_covenants', true),
    );
    final parsedAuthorization = TerminalAuthorization.fromContent(payload);
    expect(
      parsedAuthorization.serviceConfig.boltzApiBase,
      'https://boltz.example',
    );
    expect(parsedAuthorization.limits.supportsCovenants, isTrue);
  });

  test('terminal authorization material has stable protocol defaults', () {
    final now = DateTime.fromMillisecondsSinceEpoch(1710000000 * 1000);
    final material = TerminalAuthorizationMaterial.create(now: now);

    expect(material.terminalId, hasLength(32));
    expect(material.saleBucketSecret, hasLength(64));
    expect(material.saleBucketGeneration, 1);
    expect(material.effectiveFromEpochDay, epochDayFromUnix(1710000000));
    expect(
      material.expiresAt,
      now.add(const Duration(days: 365)).millisecondsSinceEpoch ~/ 1000,
    );
  });

  test('exports NIP-06 derivation path constants', () {
    expect(nostrPosMerchantDerivationPath, "m/44'/1237'/0'/0/0");
    expect(nostrPosRecoveryDerivationPath, "m/44'/1237'/1'/0/0");
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

  test('pairing announcement accepts a TTL override', () {
    final event = buildPairingAnnouncement(
      terminalPubkey:
          '23cf0f49b6f5db3c6ef008a0df8918df95e4436bda46e5b9d67b8b7c9d5f5bb1',
      createdAt: 100,
      ttl: const Duration(seconds: 45),
    );

    expect(event.tags, anyElement(equals(['expiration', '145'])));
  });

  test(
    'signed terminal authorization decrypts to the unsigned payload',
    () async {
      final merchantPrivkey =
          '0000000000000000000000000000000000000000000000000000000000000001';
      final terminalPrivkey =
          '0000000000000000000000000000000000000000000000000000000000000002';
      final merchantPubkey = publicKeyFromPrivateKey(merchantPrivkey);
      final terminalPubkey = publicKeyFromPrivateKey(terminalPrivkey);
      final authorization = TerminalAuthorization(
        posRef: posRef(merchantPubkey: merchantPubkey, posId: 'seguras'),
        terminalPubkey: terminalPubkey,
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
      );
      final unsigned = buildTerminalAuthorizationEvent(
        merchantPubkey: merchantPubkey,
        posId: 'seguras',
        authorization: authorization,
      );

      final signed = await buildSignedTerminalAuthorizationEvent(
        authorization: authorization,
        merchantPubkey: merchantPubkey,
        posId: 'seguras',
        merchantPrivkey: merchantPrivkey,
        terminalPubkey: terminalPubkey,
      );
      final decrypted = await nip44DecryptFromPubkey(
        payload: signed.content,
        privateKeyHex: terminalPrivkey,
        publicKeyHex: merchantPubkey,
      );

      expect(signed.kind, NostrPosKinds.terminalAuthorization);
      expect(verifyNostrPosEventSignature(signed), isTrue);
      expect(decrypted, unsigned.content);
      final parsed = await TerminalAuthorization.fromEvent(
        signed,
        decryptionPrivkey: terminalPrivkey,
      );
      expect(parsed.terminalId, authorization.terminalId);
    },
  );

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
