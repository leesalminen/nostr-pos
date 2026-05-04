import 'network.dart';

class PosProfile {
  PosProfile({
    required this.name,
    required this.merchantName,
    required this.currency,
    this.description = '',
    this.publicReceipts = false,
    this.network = PosNetwork.mainnet,
    List<String>? relays,
  }) : relays =
           relays ??
           const ['wss://no.str.cr', 'wss://relay.primal.net', 'wss://nos.lol'];

  final String name;
  final String merchantName;
  final String currency;
  final String description;
  final bool publicReceipts;
  final PosNetwork network;
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
      {'type': 'esplora', 'url': network.liquidEsploraApiBase},
    ],
    'swap_providers': [
      {
        'id': network.boltzProviderId,
        'type': 'boltz',
        'api_base': network.boltzApiBase,
        'ws_url': network.boltzWebSocketUrl,
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
