import 'network.dart';

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
    this.merchantName,
    this.currency,
    this.maxInvoiceSat = 100000,
    this.dailyVolumeSat = 20000000,
  });

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
  final String? merchantName;
  final String? currency;
  final int maxInvoiceSat;
  final int dailyVolumeSat;

  Map<String, Object?> toJson() => {
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
      'lookahead': 1000,
    },
    'limits': {
      'max_invoice_sat': maxInvoiceSat,
      'daily_volume_sat': dailyVolumeSat,
      'allow_lightning': true,
      'allow_liquid': true,
      'allow_bolt_card': true,
    },
    'claim_mode': 'standard',
    'swap_providers': [
      {
        'id': network.boltzProviderId,
        'type': 'boltz',
        'api_base': network.boltzApiBase,
        'ws_url': network.boltzWebSocketUrl,
        'supports_covenants': true,
      },
    ],
    'liquid_backends': [
      {'type': 'esplora', 'url': network.liquidEsploraApiBase},
    ],
    'merchant_recovery_pubkey': merchantRecoveryPubkey,
    'sale_bucket_secret': saleBucketSecret,
    'sale_bucket_generation': saleBucketGeneration,
    'effective_from_epoch_day': effectiveFromEpochDay,
    'expires_at': expiresAt,
  };
}
