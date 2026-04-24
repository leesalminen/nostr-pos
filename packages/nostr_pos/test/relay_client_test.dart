import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
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
}
