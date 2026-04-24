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

SwapRecoverySummary _recovery({int? expiresAt}) => SwapRecoverySummary(
  saleId: 'sale1',
  paymentAttemptId: 'attempt1',
  swapId: 'swap1',
  expiresAt: expiresAt ?? DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
  encryptedLocalBlob: _encryptedLocalBlob,
  terminalId: 'term1',
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
