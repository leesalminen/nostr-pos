class PosProfile {
  PosProfile({
    required this.name,
    required this.merchantName,
    required this.currency,
    this.description = '',
    this.publicReceipts = false,
    List<String>? relays,
  }) : relays =
           relays ??
           const ['wss://no.str.cr', 'wss://relay.primal.net', 'wss://nos.lol'];

  final String name;
  final String merchantName;
  final String currency;
  final String description;
  final bool publicReceipts;
  final List<String> relays;

  Map<String, Object?> toJson() => {
    'name': name,
    'merchant_name': merchantName,
    'description': description,
    'branding': {'logo_url': null, 'theme': 'default', 'primary_color': null},
    'currency': currency,
    'methods': [
      {'type': 'liquid', 'asset': 'L-BTC'},
      {
        'type': 'lightning_via_swap',
        'settlement': 'liquid',
        'providers': ['boltz'],
        'claim_mode': 'standard',
      },
      {
        'type': 'bolt_card',
        'settlement': 'liquid',
        'providers': ['boltz'],
        'claim_mode': 'standard',
      },
    ],
    'relays': relays,
    'liquid_backends': [
      {'type': 'esplora', 'url': 'https://blockstream.info/liquid/api'},
    ],
    'swap_providers': [
      {
        'id': 'boltz-mainnet',
        'type': 'boltz',
        'api_base': 'https://api.boltz.exchange',
        'ws_url': 'wss://api.boltz.exchange/ws',
      },
    ],
    'fiat_provider': {
      'type': 'bull_bitcoin',
      'url': 'https://www.bullbitcoin.com/api/price',
      'mode': 'anonymous',
    },
    'public_receipts': publicReceipts,
  };
}
