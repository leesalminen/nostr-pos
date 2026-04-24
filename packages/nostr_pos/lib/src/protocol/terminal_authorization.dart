class TerminalAuthorization {
  TerminalAuthorization({
    required this.posRef,
    required this.terminalPubkey,
    required this.terminalName,
    required this.pairingCodeHint,
    required this.ctDescriptor,
    required this.descriptorFingerprint,
    required this.terminalBranch,
    required this.merchantRecoveryPubkey,
    required this.expiresAt,
    this.maxInvoiceSat = 100000,
    this.dailyVolumeSat = 20000000,
  });

  final String posRef;
  final String terminalPubkey;
  final String terminalName;
  final String pairingCodeHint;
  final String ctDescriptor;
  final String descriptorFingerprint;
  final int terminalBranch;
  final String merchantRecoveryPubkey;
  final int expiresAt;
  final int maxInvoiceSat;
  final int dailyVolumeSat;

  Map<String, Object?> toJson() => {
        'type': 'terminal_authorization',
        'pos_ref': posRef,
        'terminal_pubkey': terminalPubkey,
        'terminal_name': terminalName,
        'pairing_code_hint': pairingCodeHint,
        'network': 'liquid-mainnet',
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
            'id': 'boltz-mainnet',
            'type': 'boltz',
            'api_base': 'https://api.boltz.exchange',
            'ws_url': 'wss://api.boltz.exchange/ws',
            'supports_covenants': true,
          }
        ],
        'liquid_backends': [
          {'type': 'esplora', 'url': 'https://blockstream.info/liquid/api'},
        ],
        'merchant_recovery_pubkey': merchantRecoveryPubkey,
        'expires_at': expiresAt,
      };
}
