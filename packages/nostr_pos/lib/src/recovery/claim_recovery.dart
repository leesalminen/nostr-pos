import 'dart:convert';

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
  BoltzSwapStatusClient({required String apiBase, http.Client? client})
    : _apiBase = apiBase.replaceAll(RegExp(r'/+$'), ''),
      _client = client ?? http.Client();

  final String _apiBase;
  final http.Client _client;

  @override
  Future<SwapStatusDetails> getSwapStatusDetails(String swapId) async {
    final response = await _client.get(
      Uri.parse('$_apiBase/v2/swap/${Uri.encodeComponent(swapId)}'),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return SwapStatusDetails(status: 'created');
    }
    final json = jsonDecode(response.body) as Map<String, Object?>;
    final transaction = json['transaction'] is Map
        ? (json['transaction'] as Map).cast<String, Object?>()
        : null;
    return SwapStatusDetails(
      status: _normalizeBoltzStatus(json['status']),
      txid: transaction?['id'] as String?,
      transactionHex: transaction?['hex'] as String?,
    );
  }
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

class ControllerRecoveryResult {
  ControllerRecoveryResult({
    required this.swapId,
    required this.status,
    this.providerStatus,
    this.claimTxid,
    this.reason,
  });

  final String swapId;
  final String status;
  final String? providerStatus;
  final String? claimTxid;
  final String? reason;

  Map<String, Object?> toJson() => {
    'swap_id': swapId,
    'status': status,
    'provider_status': providerStatus,
    'claim_txid': claimTxid,
    'reason': reason,
  };
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
  }) async {
    final results = <ControllerRecoveryResult>[];
    for (final recovery in recoveries) {
      results.add(
        await recoverClaim(
          recovery,
          terminalId: terminalId,
          feeSatPerVbyte: feeSatPerVbyte,
          now: now,
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
      if (status != null && !_claimableStatus(status.status)) {
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

bool _expiredAt(SwapRecoverySummary recovery, DateTime now) =>
    recovery.expiresAt <= now.millisecondsSinceEpoch ~/ 1000;
