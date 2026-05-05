enum PosPaymentMethod {
  liquid('liquid'),
  lightningSwap('lightning_swap'),
  boltCard('bolt_card');

  const PosPaymentMethod(this.wireName);

  final String wireName;

  static PosPaymentMethod? parse(String? value) {
    return switch (value) {
      'liquid' => PosPaymentMethod.liquid,
      'lightning_swap' ||
      'lightning_via_swap' => PosPaymentMethod.lightningSwap,
      'bolt_card' => PosPaymentMethod.boltCard,
      _ => null,
    };
  }
}

class PosPaymentMethods {
  const PosPaymentMethods({
    this.liquid = true,
    this.lightningSwap = true,
    this.boltCard = true,
  });

  final bool liquid;
  final bool lightningSwap;
  final bool boltCard;

  static const all = PosPaymentMethods();

  bool allows(PosPaymentMethod method) {
    return switch (method) {
      PosPaymentMethod.liquid => liquid,
      PosPaymentMethod.lightningSwap => lightningSwap,
      PosPaymentMethod.boltCard => boltCard,
    };
  }

  List<Map<String, Object?>> toProfileJson() => [
    if (liquid) {'type': 'liquid', 'asset': 'L-BTC'},
    if (lightningSwap)
      {
        'type': 'lightning_via_swap',
        'settlement': 'liquid',
        'providers': ['boltz'],
        'claim_mode': 'standard',
      },
    if (boltCard)
      {
        'type': 'bolt_card',
        'settlement': 'liquid',
        'providers': ['boltz'],
        'claim_mode': 'standard',
      },
  ];

  List<List<String>> toMethodTags() => [
    if (liquid) ['method', 'liquid'],
    if (lightningSwap) ['method', 'lightning_via_swap'],
    if (boltCard) ['method', 'bolt_card'],
  ];

  Map<String, Object?> toAuthorizationJson() => {
    'allow_lightning': lightningSwap,
    'allow_liquid': liquid,
    'allow_bolt_card': boltCard,
  };
}

class PosTerminalLimits {
  const PosTerminalLimits({
    this.maxInvoiceSat = 100000,
    this.dailyVolumeSat = 20000000,
    this.lookahead = 1000,
    this.supportsCovenants = false,
  });

  final int maxInvoiceSat;
  final int dailyVolumeSat;
  final int lookahead;
  final bool supportsCovenants;
}
