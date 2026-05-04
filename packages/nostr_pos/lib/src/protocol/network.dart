enum PosNetwork {
  mainnet(
    protocolName: 'liquid-mainnet',
    boltzProviderId: 'boltz-mainnet',
    boltzApiBase: 'https://api.boltz.exchange',
    boltzWebSocketUrl: 'wss://api.boltz.exchange/v2/ws',
    liquidEsploraApiBase: 'https://liquid.bullbitcoin.com/api',
  ),
  testnet(
    protocolName: 'liquid-testnet',
    boltzProviderId: 'boltz-testnet',
    boltzApiBase: 'https://api.testnet.boltz.exchange',
    boltzWebSocketUrl: 'wss://api.testnet.boltz.exchange/v2/ws',
    liquidEsploraApiBase: 'https://liquid.bullbitcoin.com/testnet/api',
  );

  const PosNetwork({
    required this.protocolName,
    required this.boltzProviderId,
    required this.boltzApiBase,
    required this.boltzWebSocketUrl,
    required this.liquidEsploraApiBase,
  });

  final String protocolName;
  final String boltzProviderId;
  final String boltzApiBase;
  final String boltzWebSocketUrl;
  final String liquidEsploraApiBase;

  static PosNetwork fromName(String value) {
    return switch (value) {
      'mainnet' || 'liquid-mainnet' => PosNetwork.mainnet,
      'testnet' || 'liquid-testnet' => PosNetwork.testnet,
      _ => throw ArgumentError.value(value, 'value', 'Unsupported POS network'),
    };
  }
}
