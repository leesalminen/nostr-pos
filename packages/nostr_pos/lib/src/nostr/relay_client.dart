import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../protocol/event.dart';
import '../protocol/kinds.dart';

class NostrRelayClient {
  NostrRelayClient({this.timeout = const Duration(seconds: 8)});

  final Duration timeout;

  Future<List<NostrPosEvent>> query(
    String relayUrl,
    Map<String, Object?> filter,
  ) async {
    final socket = await WebSocket.connect(relayUrl).timeout(timeout);
    final subId = 'nostr-pos-${DateTime.now().microsecondsSinceEpoch}';
    final events = <NostrPosEvent>[];
    final done = Completer<List<NostrPosEvent>>();
    StreamSubscription<dynamic>? subscription;

    subscription = socket.listen(
      (message) {
        final decoded = jsonDecode(message as String);
        if (decoded is! List || decoded.isEmpty) return;
        if (decoded[0] == 'EVENT' &&
            decoded.length >= 3 &&
            decoded[1] == subId) {
          events.add(
            NostrPosEvent.fromJson((decoded[2] as Map).cast<String, Object?>()),
          );
        }
        if ((decoded[0] == 'EOSE' || decoded[0] == 'CLOSED') &&
            decoded.length >= 2 &&
            decoded[1] == subId &&
            !done.isCompleted) {
          done.complete(events);
        }
      },
      onError: done.completeError,
      onDone: () {
        if (!done.isCompleted) done.complete(events);
      },
    );

    socket.add(jsonEncode(['REQ', subId, filter]));
    try {
      return await done.future.timeout(timeout, onTimeout: () => events);
    } finally {
      socket.add(jsonEncode(['CLOSE', subId]));
      await subscription.cancel();
      await socket.close();
    }
  }
}

Future<NostrPosEvent?> findPairingAnnouncement({
  required List<String> relays,
  required String pairingCode,
  NostrRelayClient? client,
}) async {
  final relayClient = client ?? NostrRelayClient();
  final events = <NostrPosEvent>[];
  for (final relay in relays) {
    try {
      events.addAll(
        await relayClient.query(relay, {
          'kinds': [NostrPosKinds.pairingAnnouncement],
          '#pairing': [pairingCode],
          'limit': 5,
        }),
      );
    } catch (_) {
      // Pairing can continue as long as one configured relay responds.
    }
  }
  final valid =
      events.where((event) => event.hasProtocolTag && event.idMatches).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return valid.isEmpty ? null : valid.first;
}
