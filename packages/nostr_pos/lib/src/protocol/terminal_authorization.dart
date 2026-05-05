import 'dart:convert';
import 'dart:math';

import 'bucket_rotation.dart';
import 'bucket_tag.dart';
import 'event.dart';
import 'kinds.dart';
import 'network.dart';
import 'nip44.dart';
import 'payment_methods.dart';

class TerminalAuthorizationMaterial {
  TerminalAuthorizationMaterial({
    required this.terminalId,
    required this.saleBucketSecret,
    required this.saleBucketGeneration,
    required this.effectiveFromEpochDay,
    required this.expiresAt,
  });

  final String terminalId;
  final String saleBucketSecret;
  final int saleBucketGeneration;
  final int effectiveFromEpochDay;
  final int expiresAt;

  static TerminalAuthorizationMaterial create({
    DateTime? now,
    Duration validity = const Duration(days: 365),
    int generation = 1,
    Random? random,
  }) {
    final createdAt = now ?? DateTime.now();
    final nowSeconds = createdAt.millisecondsSinceEpoch ~/ 1000;
    return TerminalAuthorizationMaterial(
      terminalId: _randomHex(bytes: 16, random: random),
      saleBucketSecret: randomSecretHex(random: random),
      saleBucketGeneration: generation,
      effectiveFromEpochDay: epochDayFromUnix(nowSeconds),
      expiresAt: createdAt.add(validity).millisecondsSinceEpoch ~/ 1000,
    );
  }

  static String _randomHex({required int bytes, Random? random}) {
    final rng = random ?? Random.secure();
    return bytesToHex(List<int>.generate(bytes, (_) => rng.nextInt(256)));
  }
}

class TerminalAuthorization {
  TerminalAuthorization({
    required this.posRef,
    required this.terminalPubkey,
    required this.terminalId,
    required this.terminalName,
    required this.pairingCodeHint,
    required this.ctDescriptor,
    required this.descriptorFingerprint,
    required this.terminalBranch,
    required this.merchantRecoveryPubkey,
    required this.saleBucketSecret,
    required this.saleBucketGeneration,
    required this.effectiveFromEpochDay,
    required this.expiresAt,
    this.network = PosNetwork.mainnet,
    PosServiceConfig? serviceConfig,
    this.paymentMethods = PosPaymentMethods.all,
    PosTerminalLimits? limits,
    this.merchantName,
    this.currency,
    int? maxInvoiceSat,
    int? dailyVolumeSat,
    int? lookahead,
    bool? supportsCovenants,
  }) : serviceConfig = serviceConfig ?? PosServiceConfig.defaultsFor(network),
       limits =
           limits ??
           PosTerminalLimits(
             maxInvoiceSat: maxInvoiceSat ?? 100000,
             dailyVolumeSat: dailyVolumeSat ?? 20000000,
             lookahead: lookahead ?? 1000,
             supportsCovenants: supportsCovenants ?? false,
           );

  final String posRef;
  final String terminalPubkey;
  final String terminalId;
  final String terminalName;
  final String pairingCodeHint;
  final String ctDescriptor;
  final String descriptorFingerprint;
  final int terminalBranch;
  final String merchantRecoveryPubkey;
  final String saleBucketSecret;
  final int saleBucketGeneration;
  final int effectiveFromEpochDay;
  final int expiresAt;
  final PosNetwork network;
  final PosServiceConfig serviceConfig;
  final PosPaymentMethods paymentMethods;
  final PosTerminalLimits limits;
  final String? merchantName;
  final String? currency;
  int get maxInvoiceSat => limits.maxInvoiceSat;
  int get dailyVolumeSat => limits.dailyVolumeSat;

  Map<String, Object?> toJson({PosServiceConfig? serviceConfig}) {
    final services = serviceConfig ?? this.serviceConfig;
    return {
      'type': 'terminal_authorization',
      'pos_ref': posRef,
      'terminal_pubkey': terminalPubkey,
      'terminal_id': terminalId,
      if (merchantName != null) 'merchant_name': merchantName,
      if (currency != null) 'currency': currency,
      'terminal_name': terminalName,
      'pairing_code_hint': pairingCodeHint,
      'network': network.protocolName,
      'asset': 'L-BTC',
      'settlement': {
        'type': 'liquid_ct_descriptor',
        'ct_descriptor': ctDescriptor,
        'descriptor_fingerprint': descriptorFingerprint,
        'terminal_branch': terminalBranch,
        'lookahead': limits.lookahead,
      },
      'limits': {
        'max_invoice_sat': limits.maxInvoiceSat,
        'daily_volume_sat': limits.dailyVolumeSat,
        ...paymentMethods.toAuthorizationJson(),
      },
      'claim_mode': 'standard',
      'swap_providers': [
        services.swapProviderJson(
          id: network.boltzProviderId,
          supportsCovenants: limits.supportsCovenants,
        ),
      ],
      'liquid_backends': [services.liquidBackendJson()],
      'merchant_recovery_pubkey': merchantRecoveryPubkey,
      'sale_bucket_secret': saleBucketSecret,
      'sale_bucket_generation': saleBucketGeneration,
      'effective_from_epoch_day': effectiveFromEpochDay,
      'expires_at': expiresAt,
    };
  }

  factory TerminalAuthorization.fromContent(Map<String, Object?> content) {
    final settlement = (content['settlement']! as Map).cast<String, Object?>();
    final limits = (content['limits']! as Map).cast<String, Object?>();
    final swapProviders = (content['swap_providers'] as List?) ?? const [];
    final provider = swapProviders.whereType<Map>().isEmpty
        ? const <String, Object?>{}
        : swapProviders.whereType<Map>().first.cast<String, Object?>();
    final serviceConfig = PosServiceConfig.fromContent(content);
    return TerminalAuthorization(
      posRef: content['pos_ref']! as String,
      terminalPubkey: content['terminal_pubkey']! as String,
      terminalId: content['terminal_id']! as String,
      terminalName: content['terminal_name']! as String,
      pairingCodeHint: content['pairing_code_hint']! as String,
      ctDescriptor: settlement['ct_descriptor']! as String,
      descriptorFingerprint: settlement['descriptor_fingerprint']! as String,
      terminalBranch: settlement['terminal_branch']! as int,
      merchantRecoveryPubkey: content['merchant_recovery_pubkey']! as String,
      saleBucketSecret: content['sale_bucket_secret']! as String,
      saleBucketGeneration: content['sale_bucket_generation']! as int,
      effectiveFromEpochDay: content['effective_from_epoch_day']! as int,
      expiresAt: content['expires_at']! as int,
      network: PosNetwork.fromName(content['network'] as String? ?? 'mainnet'),
      serviceConfig: serviceConfig,
      merchantName: content['merchant_name'] as String?,
      currency: content['currency'] as String?,
      paymentMethods: PosPaymentMethods(
        liquid: limits['allow_liquid'] as bool? ?? true,
        lightningSwap: limits['allow_lightning'] as bool? ?? true,
        boltCard: limits['allow_bolt_card'] as bool? ?? true,
      ),
      limits: PosTerminalLimits(
        maxInvoiceSat: limits['max_invoice_sat']! as int,
        dailyVolumeSat: limits['daily_volume_sat']! as int,
        lookahead: settlement['lookahead'] as int? ?? 1000,
        supportsCovenants: provider['supports_covenants'] as bool? ?? false,
      ),
    );
  }

  static Future<TerminalAuthorization> fromEvent(
    NostrPosEvent event, {
    required String decryptionPrivkey,
  }) async {
    if (event.kind != NostrPosKinds.terminalAuthorization ||
        !event.hasProtocolTag ||
        !event.idMatches) {
      throw ArgumentError('event is not a valid terminal authorization event');
    }
    final plaintext = await nip44DecryptFromPubkey(
      payload: event.content,
      privateKeyHex: decryptionPrivkey,
      publicKeyHex: event.pubkey,
    );
    return TerminalAuthorization.fromContent(
      (jsonDecode(plaintext) as Map).cast<String, Object?>(),
    );
  }
}
