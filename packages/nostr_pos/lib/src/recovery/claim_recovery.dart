import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'swap_recovery.dart';

typedef RecoveryClaimBuilder =
    Future<String> Function(RecoveryClaimBuildRequest request);

class RecoveryClaimBuildRequest {
  RecoveryClaimBuildRequest({
    required this.recovery,
    required this.material,
    required this.lockupTxHex,
    this.feeSatPerVbyte,
  });

  final SwapRecoverySummary recovery;
  final SwapRecoveryMaterial material;
  final String lockupTxHex;
  final double? feeSatPerVbyte;
}

class SwapStatusDetails {
  SwapStatusDetails({required this.status, this.txid, this.transactionHex});

  final String status;
  final String? txid;
  final String? transactionHex;
}

abstract class SwapStatusClient {
  Future<SwapStatusDetails> getSwapStatusDetails(String swapId);
}

class BoltzSwapStatusClient implements SwapStatusClient {
  BoltzSwapStatusClient({
    required String apiBase,
    String? webSocketUrl,
    Duration webSocketTimeout = Duration.zero,
    http.Client? client,
  }) : _apiBase = apiBase.replaceAll(RegExp(r'/+$'), ''),
       _webSocketUrl = webSocketUrl,
       _webSocketTimeout = webSocketTimeout,
       _client = client ?? http.Client();

  final String _apiBase;
  final String? _webSocketUrl;
  final Duration _webSocketTimeout;
  final http.Client _client;

  @override
  Future<SwapStatusDetails> getSwapStatusDetails(String swapId) async {
    final details = await _getRestSwapStatusDetails(swapId);
    if (_shouldFetchReverseSwapTransaction(details)) {
      final transactionDetails = await _getReverseSwapTransactionDetails(
        swapId,
        fallbackStatus: details.status,
      );
      if (transactionDetails != null) return transactionDetails;
    }
    if (_shouldWaitForWebSocket(details)) {
      return _waitForWebSocketUpdate(swapId, fallback: details);
    }
    return details;
  }

  Future<SwapStatusDetails> _getRestSwapStatusDetails(String swapId) async {
    final response = await _client.get(
      Uri.parse('$_apiBase/v2/swap/${Uri.encodeComponent(swapId)}'),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return SwapStatusDetails(status: 'created');
    }
    final json = jsonDecode(response.body) as Map<String, Object?>;
    return _detailsFromBoltzJson(json);
  }

  bool _shouldFetchReverseSwapTransaction(SwapStatusDetails details) =>
      details.status == 'invoice.paid' &&
      details.txid == null &&
      details.transactionHex == null;

  Future<SwapStatusDetails?> _getReverseSwapTransactionDetails(
    String swapId, {
    required String fallbackStatus,
  }) async {
    final response = await _client.get(
      Uri.parse(
        '$_apiBase/v2/swap/reverse/${Uri.encodeComponent(swapId)}/transaction',
      ),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) return null;
    final json = jsonDecode(response.body) as Map<String, Object?>;
    final txid = json['id'] as String?;
    final transactionHex = json['hex'] as String?;
    if (txid == null && transactionHex == null) return null;
    return SwapStatusDetails(
      status: fallbackStatus,
      txid: txid,
      transactionHex: transactionHex,
    );
  }

  bool _shouldWaitForWebSocket(SwapStatusDetails details) =>
      _webSocketUrl != null &&
      _webSocketTimeout > Duration.zero &&
      details.status == 'invoice.paid' &&
      details.txid == null &&
      details.transactionHex == null;

  Future<SwapStatusDetails> _waitForWebSocketUpdate(
    String swapId, {
    required SwapStatusDetails fallback,
  }) async {
    WebSocket? socket;
    try {
      socket = await WebSocket.connect(
        _normalizeBoltzWebSocketUrl(_webSocketUrl!),
      );
      socket.add(
        jsonEncode({
          'op': 'subscribe',
          'channel': 'swap.update',
          'args': [swapId],
        }),
      );

      await for (final message in socket.timeout(_webSocketTimeout)) {
        final details = _detailsFromBoltzWebSocketMessage(message, swapId);
        if (details == null) continue;
        if (details.txid != null ||
            details.transactionHex != null ||
            details.status == 'transaction.claimed') {
          return details;
        }
        if (details.status != 'invoice.paid') return details;
      }
    } on TimeoutException {
      return fallback;
    } catch (_) {
      return fallback;
    } finally {
      await socket?.close();
    }
    return fallback;
  }
}

String _normalizeBoltzWebSocketUrl(String url) {
  var uri = Uri.parse(url);
  final scheme = switch (uri.scheme) {
    'http' => 'ws',
    'https' => 'wss',
    _ => uri.scheme,
  };
  uri = uri.replace(scheme: scheme);
  if (uri.path.endsWith('/v2/ws')) return uri.toString();
  final base = uri.replace(path: uri.path.replaceAll(RegExp(r'/+$'), ''));
  return base.replace(path: '${base.path}/v2/ws').toString();
}

SwapStatusDetails _detailsFromBoltzJson(Map<String, Object?> json) {
  final transaction = json['transaction'] is Map
      ? (json['transaction'] as Map).cast<String, Object?>()
      : null;
  return SwapStatusDetails(
    status: _normalizeBoltzStatus(json['status']),
    txid: transaction?['id'] as String?,
    transactionHex: transaction?['hex'] as String?,
  );
}

SwapStatusDetails? _detailsFromBoltzWebSocketMessage(
  Object? message,
  String swapId,
) {
  if (message is! String) return null;
  final decoded = jsonDecode(message);
  if (decoded is! Map) return null;
  final json = decoded.cast<String, Object?>();
  if (json['event'] != 'update' || json['channel'] != 'swap.update') {
    return null;
  }
  final args = json['args'];
  if (args is! List) return null;
  for (final arg in args) {
    if (arg is! Map) continue;
    final update = arg.cast<String, Object?>();
    if (update['id'] != swapId) continue;
    return _detailsFromBoltzJson(update);
  }
  return null;
}

class LiquidTransactionClient {
  LiquidTransactionClient({required String apiBase, http.Client? client})
    : _apiBase = apiBase.replaceAll(RegExp(r'/+$'), ''),
      _client = client ?? http.Client();

  final String _apiBase;
  final http.Client _client;

  Future<String> fetchTransactionHex(String txid) async {
    final response = await _client.get(
      Uri.parse('$_apiBase/tx/${Uri.encodeComponent(txid)}/hex'),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Could not fetch Liquid lockup transaction.');
    }
    return response.body.trim();
  }

  Future<String> broadcastTransaction(String txHex) async {
    final response = await _client.post(
      Uri.parse('$_apiBase/tx'),
      headers: {'content-type': 'text/plain'},
      body: txHex,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Could not broadcast Liquid claim transaction.');
    }
    return response.body.trim();
  }
}

class ControllerRecoveryExecutor {
  ControllerRecoveryExecutor({
    required SwapStatusClient swapStatusClient,
    required LiquidTransactionClient liquidClient,
    required RecoveryClaimBuilder claimBuilder,
  }) : _swapStatusClient = swapStatusClient,
       _liquidClient = liquidClient,
       _claimBuilder = claimBuilder;

  final SwapStatusClient _swapStatusClient;
  final LiquidTransactionClient _liquidClient;
  final RecoveryClaimBuilder _claimBuilder;

  Future<List<ControllerRecoveryResult>> recoverClaims(
    List<SwapRecoverySummary> recoveries, {
    String? terminalId,
    double? feeSatPerVbyte,
    DateTime? now,
    Duration lockupPollTimeout = Duration.zero,
    Duration lockupPollInterval = const Duration(seconds: 5),
  }) async {
    final results = <ControllerRecoveryResult>[];
    for (final recovery in recoveries) {
      results.add(
        await recoverClaim(
          recovery,
          terminalId: terminalId,
          feeSatPerVbyte: feeSatPerVbyte,
          now: now,
          lockupPollTimeout: lockupPollTimeout,
          lockupPollInterval: lockupPollInterval,
        ),
      );
    }
    return results;
  }

  Future<ControllerRecoveryResult> recoverClaim(
    SwapRecoverySummary recovery, {
    String? terminalId,
    double? feeSatPerVbyte,
    DateTime? now,
    Duration lockupPollTimeout = Duration.zero,
    Duration lockupPollInterval = const Duration(seconds: 5),
  }) async {
    if (_expiredAt(recovery, now ?? DateTime.now())) {
      return ControllerRecoveryResult(
        swapId: recovery.swapId,
        status: 'expired',
        reason: 'Recovery record is expired.',
      );
    }

    SwapStatusDetails? status;
    try {
      status = await _swapStatusClient.getSwapStatusDetails(recovery.swapId);
      if (status.status == 'transaction.claimed') {
        return ControllerRecoveryResult(
          swapId: recovery.swapId,
          status: 'already_claimed',
          providerStatus: status.status,
        );
      }
    } catch (error) {
      if (recovery.claimTxHex == null && recovery.lockupTxHex == null) {
        return ControllerRecoveryResult(
          swapId: recovery.swapId,
          status: 'failed',
          reason: '$error',
        );
      }
    }

    try {
      if (recovery.claimTxHex != null && recovery.claimTxHex!.isNotEmpty) {
        final claimTxid = await _liquidClient.broadcastTransaction(
          recovery.claimTxHex!,
        );
        return ControllerRecoveryResult(
          swapId: recovery.swapId,
          status: 'broadcast',
          providerStatus: status?.status,
          claimTxid: claimTxid,
        );
      }
      status = await _pollForLockupMaterial(
        recovery,
        status,
        timeout: lockupPollTimeout,
        interval: lockupPollInterval,
      );
      if (status?.status == 'transaction.claimed') {
        return ControllerRecoveryResult(
          swapId: recovery.swapId,
          status: 'already_claimed',
          providerStatus: status!.status,
        );
      }
      final hasLockupMaterial = _hasLockupMaterial(recovery, status);
      if (status != null &&
          !_claimableStatus(status.status) &&
          !hasLockupMaterial) {
        return ControllerRecoveryResult(
          swapId: recovery.swapId,
          status: 'waiting',
          providerStatus: status.status,
        );
      }

      final statusTxid = status?.txid;
      final lockupTxHex =
          recovery.lockupTxHex ??
          status?.transactionHex ??
          (statusTxid == null
              ? null
              : await _liquidClient.fetchTransactionHex(statusTxid));
      if (lockupTxHex == null || lockupTxHex.isEmpty) {
        return ControllerRecoveryResult(
          swapId: recovery.swapId,
          status: 'failed',
          providerStatus: status?.status,
          reason: 'Provider did not expose a Liquid lockup transaction.',
        );
      }

      final material = await decryptSwapRecovery(
        recovery,
        terminalId: terminalId,
      );
      if (material.swap == null) {
        return ControllerRecoveryResult(
          swapId: recovery.swapId,
          status: 'failed',
          providerStatus: status?.status,
          reason: 'Recovery material does not contain swap data.',
        );
      }

      final claimTxHex = await _claimBuilder(
        RecoveryClaimBuildRequest(
          recovery: recovery,
          material: material,
          lockupTxHex: lockupTxHex,
          feeSatPerVbyte: feeSatPerVbyte,
        ),
      );
      final claimTxid = await _liquidClient.broadcastTransaction(claimTxHex);
      return ControllerRecoveryResult(
        swapId: recovery.swapId,
        status: 'broadcast',
        providerStatus: status?.status,
        claimTxid: claimTxid,
      );
    } catch (error) {
      return ControllerRecoveryResult(
        swapId: recovery.swapId,
        status: 'failed',
        reason: '$error',
      );
    }
  }

  Future<SwapStatusDetails?> _pollForLockupMaterial(
    SwapRecoverySummary recovery,
    SwapStatusDetails? status, {
    required Duration timeout,
    required Duration interval,
  }) async {
    if (timeout <= Duration.zero || !_shouldPollForLockup(status)) {
      return status;
    }
    final deadline = DateTime.now().add(timeout);
    var latest = status;
    while (DateTime.now().isBefore(deadline) &&
        !_claimableStatus(latest?.status ?? '') &&
        !_hasLockupMaterial(recovery, latest)) {
      if (interval > Duration.zero) await Future<void>.delayed(interval);
      latest = await _swapStatusClient.getSwapStatusDetails(recovery.swapId);
      if (latest.status == 'transaction.claimed') return latest;
      if (!_shouldPollForLockup(latest)) return latest;
    }
    return latest;
  }
}

String _normalizeBoltzStatus(Object? status) {
  if (status == 'transaction.claimed') return 'transaction.claimed';
  if (status == 'invoice.settled') return 'invoice.paid';
  if (status == 'transaction.mempool' ||
      status == 'transaction.server.mempool') {
    return 'transaction.mempool';
  }
  if (status == 'transaction.confirmed' ||
      status == 'transaction.server.confirmed') {
    return 'transaction.confirmed';
  }
  if (status == 'swap.expired' || status == 'invoice.expired') {
    return 'expired';
  }
  if (status == 'swap.failed' || status == 'invoice.failed') return 'failed';
  return 'created';
}

bool _claimableStatus(String status) =>
    status == 'transaction.mempool' || status == 'transaction.confirmed';

bool _hasLockupMaterial(
  SwapRecoverySummary recovery,
  SwapStatusDetails? status,
) =>
    recovery.lockupTxHex != null ||
    status?.transactionHex != null ||
    status?.txid != null;

bool _shouldPollForLockup(SwapStatusDetails? status) =>
    status?.status == 'invoice.paid' || status?.status == 'invoice.settled';

bool _expiredAt(SwapRecoverySummary recovery, DateTime now) =>
    recovery.expiresAt <= now.millisecondsSinceEpoch ~/ 1000;
