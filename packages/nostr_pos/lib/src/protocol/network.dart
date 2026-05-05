enum PosNetwork {
  mainnet(protocolName: 'liquid-mainnet', boltzProviderId: 'boltz-mainnet'),
  testnet(protocolName: 'liquid-testnet', boltzProviderId: 'boltz-testnet');

  const PosNetwork({required this.protocolName, required this.boltzProviderId});

  final String protocolName;
  final String boltzProviderId;

  static PosNetwork fromName(String value) {
    return switch (value) {
      'mainnet' || 'liquid-mainnet' => PosNetwork.mainnet,
      'testnet' || 'liquid-testnet' => PosNetwork.testnet,
      _ => throw ArgumentError.value(value, 'value', 'Unsupported POS network'),
    };
  }
}

class FiatProviderConfig {
  const FiatProviderConfig({
    required this.type,
    required this.url,
    required this.mode,
  });

  final String type;
  final String url;
  final String mode;

  static const bullBitcoinDefault = FiatProviderConfig(
    type: 'bull_bitcoin',
    url: 'https://www.bullbitcoin.com/api/price',
    mode: 'anonymous',
  );

  Map<String, Object?> toJson() => {'type': type, 'url': url, 'mode': mode};

  factory FiatProviderConfig.fromContent(Map<String, Object?> content) {
    return FiatProviderConfig(
      type: content['type']! as String,
      url: content['url']! as String,
      mode: content['mode']! as String,
    );
  }
}

class PosServiceConfig {
  const PosServiceConfig({
    required this.boltzApiBase,
    required this.boltzWebSocketUrl,
    required this.liquidEsploraApiBase,
    this.fiatProvider = FiatProviderConfig.bullBitcoinDefault,
  });

  final String boltzApiBase;
  final String boltzWebSocketUrl;
  final String liquidEsploraApiBase;
  final FiatProviderConfig fiatProvider;

  static const mainnetDefaults = PosServiceConfig(
    boltzApiBase: 'https://api.boltz.exchange',
    boltzWebSocketUrl: 'wss://api.boltz.exchange/v2/ws',
    liquidEsploraApiBase: 'https://liquid.bullbitcoin.com/api',
  );

  static const testnetDefaults = PosServiceConfig(
    boltzApiBase: 'https://api.testnet.boltz.exchange',
    boltzWebSocketUrl: 'wss://api.testnet.boltz.exchange/v2/ws',
    liquidEsploraApiBase: 'https://liquid.bullbitcoin.com/testnet/api',
  );

  static PosServiceConfig defaultsFor(PosNetwork network) {
    return switch (network) {
      PosNetwork.mainnet => mainnetDefaults,
      PosNetwork.testnet => testnetDefaults,
    };
  }

  factory PosServiceConfig.fromContent(Map<String, Object?> content) {
    final swapProviders = (content['swap_providers'] as List?) ?? const [];
    final provider = swapProviders.whereType<Map>().isEmpty
        ? const <String, Object?>{}
        : swapProviders.whereType<Map>().first.cast<String, Object?>();
    final liquidBackends = (content['liquid_backends'] as List?) ?? const [];
    final liquid = liquidBackends.whereType<Map>().isEmpty
        ? const <String, Object?>{}
        : liquidBackends.whereType<Map>().first.cast<String, Object?>();
    final fiatProvider = content['fiat_provider'] is Map
        ? FiatProviderConfig.fromContent(
            (content['fiat_provider'] as Map).cast<String, Object?>(),
          )
        : FiatProviderConfig.bullBitcoinDefault;
    return PosServiceConfig(
      boltzApiBase: provider['api_base']! as String,
      boltzWebSocketUrl: provider['ws_url']! as String,
      liquidEsploraApiBase: liquid['url']! as String,
      fiatProvider: fiatProvider,
    );
  }

  Map<String, Object?> liquidBackendJson() => {
    'type': 'esplora',
    'url': liquidEsploraApiBase,
  };

  Map<String, Object?> swapProviderJson({
    required String id,
    bool? supportsCovenants,
  }) => {
    'id': id,
    'type': 'boltz',
    'api_base': boltzApiBase,
    'ws_url': boltzWebSocketUrl,
    ...supportsCovenants == null
        ? const <String, Object?>{}
        : {'supports_covenants': supportsCovenants},
  };
}
