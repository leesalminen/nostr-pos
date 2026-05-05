import 'dart:convert';

import 'defaults.dart';
import 'event.dart';
import 'kinds.dart';
import 'network.dart';
import 'payment_methods.dart';

class PosProfile {
  PosProfile({
    required this.name,
    required this.merchantName,
    required this.currency,
    this.description = '',
    this.publicReceipts = false,
    this.network = PosNetwork.mainnet,
    PosServiceConfig? serviceConfig,
    this.paymentMethods = PosPaymentMethods.all,
    FiatProviderConfig? fiatProvider,
    List<String>? relays,
  }) : relays = relays ?? defaultNostrPosRelays,
       serviceConfig = serviceConfig ?? PosServiceConfig.defaultsFor(network),
       fiatProvider =
           fiatProvider ??
           serviceConfig?.fiatProvider ??
           PosServiceConfig.defaultsFor(network).fiatProvider;

  final String name;
  final String merchantName;
  final String currency;
  final String description;
  final bool publicReceipts;
  final PosNetwork network;
  final PosServiceConfig serviceConfig;
  final PosPaymentMethods paymentMethods;
  final FiatProviderConfig fiatProvider;
  final List<String> relays;

  Map<String, Object?> toJson({PosServiceConfig? serviceConfig}) {
    final services = serviceConfig ?? this.serviceConfig;
    return {
      'name': name,
      'merchant_name': merchantName,
      'description': description,
      'branding': {'logo_url': null, 'theme': 'default', 'primary_color': null},
      'currency': currency,
      'methods': paymentMethods.toProfileJson(),
      'relays': relays,
      'liquid_backends': [services.liquidBackendJson()],
      'swap_providers': [
        services.swapProviderJson(id: network.boltzProviderId),
      ],
      'fiat_provider': fiatProvider.toJson(),
      'public_receipts': publicReceipts,
    };
  }

  factory PosProfile.fromContent(Map<String, Object?> content) {
    final network = PosNetwork.fromName(
      content['network'] as String? ?? 'mainnet',
    );
    final relays = (content['relays'] as List?)?.whereType<String>().toList();
    final serviceConfig = PosServiceConfig.fromContent(content);
    final methods = (content['methods'] as List?)
        ?.whereType<Map>()
        .map((method) => method.cast<String, Object?>()['type'] as String?)
        .toSet();
    return PosProfile(
      name: content['name']! as String,
      merchantName: content['merchant_name']! as String,
      currency: content['currency']! as String,
      description: content['description'] as String? ?? '',
      publicReceipts: content['public_receipts'] as bool? ?? false,
      network: network,
      relays: relays,
      serviceConfig: serviceConfig,
      paymentMethods: methods == null
          ? PosPaymentMethods.all
          : PosPaymentMethods(
              liquid: methods.contains('liquid'),
              lightningSwap:
                  methods.contains('lightning_via_swap') ||
                  methods.contains('lightning_swap'),
              boltCard: methods.contains('bolt_card'),
            ),
    );
  }

  factory PosProfile.fromEvent(NostrPosEvent event) {
    if (event.kind != NostrPosKinds.posProfile ||
        !event.hasProtocolTag ||
        !event.idMatches) {
      throw ArgumentError('event is not a valid POS profile event');
    }
    final content = (jsonDecode(event.content) as Map).cast<String, Object?>();
    final network = event.tags
        .where((tag) => tag.length >= 2 && tag[0] == 'network')
        .map((tag) => tag[1])
        .firstOrNull;
    if (network != null) content['network'] = network;
    return PosProfile.fromContent(content);
  }
}
