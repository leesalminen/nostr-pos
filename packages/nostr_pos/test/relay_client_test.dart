import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ndk/data_layer/repositories/signers/bip340_event_signer.dart';
import 'package:ndk/domain_layer/entities/nip_01_event.dart';
import 'package:ndk/domain_layer/usecases/accounts/accounts.dart';
import 'package:ndk/domain_layer/usecases/gift_wrap/gift_wrap.dart';
import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test('publishes events to a relay websocket', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final event = signNostrPosEvent(
      buildUnsignedEvent(
        pubkey: publicKeyFromPrivateKey(
          '0000000000000000000000000000000000000000000000000000000000000001',
        ),
        kind: NostrPosKinds.posProfile,
        tags: [
          ['d', 'seguras'],
        ],
        content: {'name': 'Counter 1'},
        createdAt: 1000,
      ),
      '0000000000000000000000000000000000000000000000000000000000000001',
    );
    unawaited(
      server.forEach((request) async {
        final socket = await WebSocketTransformer.upgrade(request);
        await for (final message in socket) {
          final decoded = jsonDecode(message as String) as List<Object?>;
          expect(decoded[0], 'EVENT');
          socket.add(jsonEncode(['OK', event.id, true, 'stored']));
        }
      }),
    );

    final relayUrl = 'ws://${server.address.host}:${server.port}';
    final result = await publishEventToRelays(relays: [relayUrl], event: event);

    expect(result.single.ok, isTrue);
    expect(result.single.message, 'stored');
    await server.close(force: true);
  });

  test('treats duplicate relay publishes as accepted', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final event = signNostrPosEvent(
      buildUnsignedEvent(
        pubkey: publicKeyFromPrivateKey(
          '0000000000000000000000000000000000000000000000000000000000000001',
        ),
        kind: NostrPosKinds.posProfile,
        tags: [
          ['d', 'seguras'],
        ],
        content: {'name': 'Counter 1'},
        createdAt: 1000,
      ),
      '0000000000000000000000000000000000000000000000000000000000000001',
    );
    unawaited(
      server.forEach((request) async {
        final socket = await WebSocketTransformer.upgrade(request);
        await for (final message in socket) {
          final decoded = jsonDecode(message as String) as List<Object?>;
          expect(decoded[0], 'EVENT');
          socket.add(
            jsonEncode(['OK', event.id, false, 'duplicate: already have it']),
          );
        }
      }),
    );

    final relayUrl = 'ws://${server.address.host}:${server.port}';
    final result = await publishEventToRelays(relays: [relayUrl], event: event);

    expect(result.single.ok, isTrue);
    expect(result.single.message, 'duplicate: already have it');
    await server.close(force: true);
  });

  test('queries pairing announcements from a relay websocket', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final event = buildPairingAnnouncement(
      terminalPubkey:
          '23cf0f49b6f5db3c6ef008a0df8918df95e4436bda46e5b9d67b8b7c9d5f5bb1',
      createdAt: 1000,
    );
    unawaited(
      server.forEach((request) async {
        final socket = await WebSocketTransformer.upgrade(request);
        await for (final message in socket) {
          final decoded = jsonDecode(message as String) as List<Object?>;
          if (decoded.isEmpty || decoded[0] != 'REQ') continue;
          final filter = (decoded[2] as Map).cast<String, Object?>();
          expect(filter, containsPair('#d', ['4F7G-YJDP']));
          expect(filter.containsKey('#pairing'), isFalse);
          final subId = decoded[1] as String;
          socket.add(jsonEncode(['EVENT', subId, event.toJson()]));
          socket.add(jsonEncode(['EOSE', subId]));
        }
      }),
    );

    final relayUrl = 'ws://${server.address.host}:${server.port}';
    final found = await findPairingAnnouncement(
      relays: [relayUrl],
      pairingCode: '4F7G-YJDP',
    );

    expect(found?.id, event.id);
    await server.close(force: true);
  });

  test('fetches swap recovery backups from a relay websocket', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final event = buildUnsignedEvent(
      pubkey: 'c' * 64,
      kind: NostrPosKinds.swapRecoveryBackup,
      tags: [
        ['p', 'b' * 64],
        ['sale', 'sale1'],
        ['swap', 'swap1'],
      ],
      content: {
        'sale_id': 'sale1',
        'payment_attempt_id': 'attempt1',
        'swap_id': 'swap1',
        'expires_at': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
        'encrypted_local_blob': 'ciphertext',
      },
    );
    unawaited(
      server.forEach((request) async {
        final socket = await WebSocketTransformer.upgrade(request);
        await for (final message in socket) {
          final decoded = jsonDecode(message as String) as List<Object?>;
          final subId = decoded[1] as String;
          socket.add(jsonEncode(['EVENT', subId, event.toJson()]));
          socket.add(jsonEncode(['EOSE', subId]));
        }
      }),
    );

    final relayUrl = 'ws://${server.address.host}:${server.port}';
    final found = await fetchSwapRecoveryBackups(
      relays: [relayUrl],
      recoveryPubkey: 'b' * 64,
    );

    expect(found.single.id, event.id);
    await server.close(force: true);
  });

  test('fetches and unwraps NIP-59 swap recovery backups', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    const terminalPrivkey =
        '0000000000000000000000000000000000000000000000000000000000000002';
    const recoveryPrivkey =
        '0000000000000000000000000000000000000000000000000000000000000003';
    final terminalPubkey = publicKeyFromPrivateKey(terminalPrivkey);
    final recoveryPubkey = publicKeyFromPrivateKey(recoveryPrivkey);
    final recovery = buildUnsignedEvent(
      pubkey: terminalPubkey,
      kind: NostrPosKinds.swapRecoveryBackup,
      tags: [
        ['p', recoveryPubkey],
        ['sale', 'sale1'],
        ['swap', 'swap1'],
      ],
      content: {
        'sale_id': 'sale1',
        'payment_attempt_id': 'attempt1',
        'swap_id': 'swap1',
        'expires_at': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
        'encrypted_local_blob': 'ciphertext',
      },
      createdAt: 1000,
    );
    final giftWrap = GiftWrap(accounts: Accounts());
    final wrapped = await giftWrap.toGiftWrap(
      rumor: Nip01Event(
        id: recovery.id,
        pubKey: recovery.pubkey,
        createdAt: recovery.createdAt,
        kind: recovery.kind,
        tags: recovery.tags,
        content: recovery.content,
        sig: null,
      ),
      recipientPubkey: recoveryPubkey,
      customSigner: Bip340EventSigner(
        privateKey: terminalPrivkey,
        publicKey: terminalPubkey,
      ),
    );
    final wrappedEvent = NostrPosEvent(
      id: wrapped.id,
      pubkey: wrapped.pubKey,
      createdAt: wrapped.createdAt,
      kind: wrapped.kind,
      tags: wrapped.tags,
      content: wrapped.content,
      sig: wrapped.sig!,
    );

    unawaited(
      server.forEach((request) async {
        final socket = await WebSocketTransformer.upgrade(request);
        await for (final message in socket) {
          final decoded = jsonDecode(message as String) as List<Object?>;
          final subId = decoded[1] as String;
          socket.add(jsonEncode(['EVENT', subId, wrappedEvent.toJson()]));
          socket.add(jsonEncode(['EOSE', subId]));
        }
      }),
    );

    final relayUrl = 'ws://${server.address.host}:${server.port}';
    final found = await fetchSwapRecoveryBackups(
      relays: [relayUrl],
      recoveryPrivkey: recoveryPrivkey,
    );

    expect(found.single.id, recovery.id);
    expect(jsonDecode(found.single.content), containsPair('swap_id', 'swap1'));
    await server.close(force: true);
  });
}
