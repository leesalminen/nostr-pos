import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

const _encryptedLocalBlob =
    'AAECAwQFBgcICQoL4Exd881egI0TK1AdVDJpUAw0fjZZm+yZYKCzY4Er4Z9lql4PqhEBIjR5NJqTXbN8dpoYgM/LLP6D0b0ZbyZp7JUP9r/MAvh1F+l3/2G8fTbpzX27BJBnjQH89NqKpbL2pZH/yQ6fboY=';

void main() {
  test('waits when Boltz has not exposed a lockup transaction', () async {
    final executor = ControllerRecoveryExecutor(
      swapStatusClient: _FakeSwapStatusClient(
        SwapStatusDetails(status: 'created'),
      ),
      liquidClient: _FakeLiquidClient(),
      claimBuilder: (_) async => throw StateError('not used'),
    );

    final result = await executor.recoverClaim(_recovery());

    expect(result.status, 'waiting');
    expect(result.providerStatus, 'created');
  });

  test('decrypts material, builds a claim, and broadcasts it', () async {
    late RecoveryClaimBuildRequest buildRequest;
    final liquid = _FakeLiquidClient(lockupTxHex: 'lockuphex');
    final executor = ControllerRecoveryExecutor(
      swapStatusClient: _FakeSwapStatusClient(
        SwapStatusDetails(status: 'transaction.confirmed', txid: 'lockuptxid'),
      ),
      liquidClient: liquid,
      claimBuilder: (request) async {
        buildRequest = request;
        return 'claimtxhex';
      },
    );

    final result = await executor.recoverClaim(
      _recovery(),
      feeSatPerVbyte: 0.3,
    );

    expect(result.status, 'broadcast');
    expect(result.claimTxid, 'claimtxid');
    expect(liquid.fetchedTxids, ['lockuptxid']);
    expect(liquid.broadcastHexes, ['claimtxhex']);
    expect(buildRequest.lockupTxHex, 'lockuphex');
    expect(buildRequest.feeSatPerVbyte, 0.3);
    expect(buildRequest.material.settlementAddress, 'lq1destination');
    expect(buildRequest.material.swap?['id'], 'swap1');
  });

  test(
    'claims invoice-paid swaps when provider includes lockup tx material',
    () async {
      late RecoveryClaimBuildRequest buildRequest;
      final liquid = _FakeLiquidClient();
      final executor = ControllerRecoveryExecutor(
        swapStatusClient: _FakeSwapStatusClient(
          SwapStatusDetails(
            status: 'invoice.paid',
            transactionHex: 'lockuphex',
          ),
        ),
        liquidClient: liquid,
        claimBuilder: (request) async {
          buildRequest = request;
          return 'claimtxhex';
        },
      );

      final result = await executor.recoverClaim(_recovery());

      expect(result.status, 'broadcast');
      expect(result.providerStatus, 'invoice.paid');
      expect(buildRequest.lockupTxHex, 'lockuphex');
      expect(liquid.fetchedTxids, isEmpty);
      expect(liquid.broadcastHexes, ['claimtxhex']);
    },
  );

  test('polls invoice-paid swaps until Boltz exposes the lockup tx', () async {
    late RecoveryClaimBuildRequest buildRequest;
    final liquid = _FakeLiquidClient(lockupTxHex: 'fetchedlockuphex');
    final statusClient = _SequenceSwapStatusClient([
      SwapStatusDetails(status: 'invoice.paid'),
      SwapStatusDetails(status: 'transaction.confirmed', txid: 'lockuptxid'),
    ]);
    final executor = ControllerRecoveryExecutor(
      swapStatusClient: statusClient,
      liquidClient: liquid,
      claimBuilder: (request) async {
        buildRequest = request;
        return 'claimtxhex';
      },
    );

    final result = await executor.recoverClaim(
      _recovery(),
      lockupPollTimeout: const Duration(seconds: 1),
      lockupPollInterval: Duration.zero,
    );

    expect(result.status, 'broadcast');
    expect(result.providerStatus, 'transaction.confirmed');
    expect(statusClient.calls, 2);
    expect(liquid.fetchedTxids, ['lockuptxid']);
    expect(buildRequest.lockupTxHex, 'fetchedlockuphex');
  });

  test(
    'fetches reverse swap transaction when status omits lockup material',
    () async {
      final requestedPaths = <String>[];
      final client = BoltzSwapStatusClient(
        apiBase: 'https://api.boltz.exchange',
        client: MockClient((request) async {
          requestedPaths.add(request.url.path);
          if (request.url.path == '/v2/swap/swap1') {
            return http.Response(
              jsonEncode({'status': 'invoice.settled'}),
              200,
            );
          }
          if (request.url.path == '/v2/swap/reverse/swap1/transaction') {
            return http.Response(
              jsonEncode({'id': 'lockuptxid', 'hex': 'lockuphex'}),
              200,
            );
          }
          return http.Response('not found', 404);
        }),
      );

      final details = await client.getSwapStatusDetails('swap1');

      expect(details.status, 'invoice.paid');
      expect(details.txid, 'lockuptxid');
      expect(details.transactionHex, 'lockuphex');
      expect(requestedPaths, [
        '/v2/swap/swap1',
        '/v2/swap/reverse/swap1/transaction',
      ]);
    },
  );

  test(
    'waits for Boltz websocket transaction when REST is settled without tx',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final sawSubscribe = Completer<void>();
      server.listen((request) async {
        final socket = await WebSocketTransformer.upgrade(request);
        socket.listen((message) {
          final subscribe = jsonDecode(message as String) as Map;
          expect(subscribe['op'], 'subscribe');
          expect(subscribe['channel'], 'swap.update');
          expect(subscribe['args'], ['swap1']);
          socket.add(
            jsonEncode({
              'event': 'update',
              'channel': 'swap.update',
              'args': [
                {
                  'id': 'swap1',
                  'status': 'invoice.settled',
                  'transaction': {'id': 'lockuptxid', 'hex': 'lockuphex'},
                },
              ],
            }),
          );
          unawaited(socket.close());
          if (!sawSubscribe.isCompleted) sawSubscribe.complete();
        });
      });

      try {
        final client = BoltzSwapStatusClient(
          apiBase: 'https://api.boltz.exchange',
          webSocketUrl: 'ws://${server.address.host}:${server.port}',
          webSocketTimeout: const Duration(seconds: 2),
          client: MockClient(
            (_) async =>
                http.Response(jsonEncode({'status': 'invoice.settled'}), 200),
          ),
        );

        final details = await client.getSwapStatusDetails('swap1');

        expect(details.status, 'invoice.paid');
        expect(details.txid, 'lockuptxid');
        expect(details.transactionHex, 'lockuphex');
        await sawSubscribe.future.timeout(const Duration(seconds: 1));
      } finally {
        await server.close(force: true);
      }
    },
  );

  test('broadcasts prepared claim hex from recovery records', () async {
    final liquid = _FakeLiquidClient();
    final executor = ControllerRecoveryExecutor(
      swapStatusClient: _FakeSwapStatusClient(
        SwapStatusDetails(status: 'transaction.confirmed'),
      ),
      liquidClient: liquid,
      claimBuilder: (_) async => throw StateError('not used'),
    );

    final result = await executor.recoverClaim(
      _recovery(claimTxHex: 'preparedclaimhex'),
    );

    expect(result.status, 'broadcast');
    expect(result.claimTxid, 'claimtxid');
    expect(liquid.broadcastHexes, ['preparedclaimhex']);
    expect(liquid.fetchedTxids, isEmpty);
  });

  test(
    'broadcasts prepared claim hex even when provider polling fails',
    () async {
      final liquid = _FakeLiquidClient();
      final executor = ControllerRecoveryExecutor(
        swapStatusClient: _ThrowingSwapStatusClient(),
        liquidClient: liquid,
        claimBuilder: (_) async => throw StateError('not used'),
      );

      final result = await executor.recoverClaim(
        _recovery(claimTxHex: 'preparedclaimhex'),
      );

      expect(result.status, 'broadcast');
      expect(result.providerStatus, isNull);
      expect(result.claimTxid, 'claimtxid');
      expect(liquid.broadcastHexes, ['preparedclaimhex']);
    },
  );

  test(
    'builds claims from stored lockup hex when provider polling fails',
    () async {
      late RecoveryClaimBuildRequest buildRequest;
      final liquid = _FakeLiquidClient();
      final executor = ControllerRecoveryExecutor(
        swapStatusClient: _ThrowingSwapStatusClient(),
        liquidClient: liquid,
        claimBuilder: (request) async {
          buildRequest = request;
          return 'claimtxhex';
        },
      );

      final result = await executor.recoverClaim(
        _recovery(lockupTxHex: 'storedlockuphex'),
        feeSatPerVbyte: 0.4,
      );

      expect(result.status, 'broadcast');
      expect(result.providerStatus, isNull);
      expect(result.claimTxid, 'claimtxid');
      expect(buildRequest.lockupTxHex, 'storedlockuphex');
      expect(buildRequest.feeSatPerVbyte, 0.4);
      expect(liquid.fetchedTxids, isEmpty);
      expect(liquid.broadcastHexes, ['claimtxhex']);
    },
  );

  test('reports expired recoveries without polling providers', () async {
    final statusClient = _FakeSwapStatusClient(
      SwapStatusDetails(status: 'transaction.confirmed'),
    );
    final executor = ControllerRecoveryExecutor(
      swapStatusClient: statusClient,
      liquidClient: _FakeLiquidClient(),
      claimBuilder: (_) async => 'claimtxhex',
    );

    final result = await executor.recoverClaim(
      _recovery(expiresAt: 100),
      now: DateTime.fromMillisecondsSinceEpoch(101000),
    );

    expect(result.status, 'expired');
    expect(statusClient.calls, 0);
  });
}

SwapRecoverySummary _recovery({
  int? expiresAt,
  String? claimTxHex,
  String? lockupTxHex,
}) => SwapRecoverySummary(
  saleId: 'sale1',
  paymentAttemptId: 'attempt1',
  swapId: 'swap1',
  expiresAt: expiresAt ?? DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
  encryptedLocalBlob: _encryptedLocalBlob,
  terminalId: 'term1',
  lockupTxHex: lockupTxHex,
  claimTxHex: claimTxHex,
);

class _FakeSwapStatusClient implements SwapStatusClient {
  _FakeSwapStatusClient(this.status);

  final SwapStatusDetails status;
  int calls = 0;

  @override
  Future<SwapStatusDetails> getSwapStatusDetails(String swapId) async {
    calls += 1;
    return status;
  }
}

class _ThrowingSwapStatusClient implements SwapStatusClient {
  @override
  Future<SwapStatusDetails> getSwapStatusDetails(String swapId) async {
    throw StateError('provider offline');
  }
}

class _SequenceSwapStatusClient implements SwapStatusClient {
  _SequenceSwapStatusClient(this.statuses);

  final List<SwapStatusDetails> statuses;
  int calls = 0;

  @override
  Future<SwapStatusDetails> getSwapStatusDetails(String swapId) async {
    final index = calls < statuses.length ? calls : statuses.length - 1;
    calls += 1;
    return statuses[index];
  }
}

class _FakeLiquidClient extends LiquidTransactionClient {
  _FakeLiquidClient({this.lockupTxHex = 'lockuphex'})
    : super(apiBase: 'https://liquid.example/api');

  final String lockupTxHex;
  final fetchedTxids = <String>[];
  final broadcastHexes = <String>[];

  @override
  Future<String> fetchTransactionHex(String txid) async {
    fetchedTxids.add(txid);
    return lockupTxHex;
  }

  @override
  Future<String> broadcastTransaction(String txHex) async {
    broadcastHexes.add(txHex);
    return 'claimtxid';
  }
}
