import 'dart:convert';

import 'package:http/http.dart' as http;

class BullBitcoinRate {
  BullBitcoinRate({
    required this.fromCurrency,
    required this.toCurrency,
    required this.priceCurrency,
    required this.indexPrice,
    required this.precision,
    required this.createdAt,
  });

  final String fromCurrency;
  final String toCurrency;
  final String priceCurrency;
  final int indexPrice;
  final int precision;
  final DateTime createdAt;

  double get decodedIndexPrice => indexPrice / _pow10(precision);

  int fiatToSats(num fiatAmount) {
    return ((fiatAmount / decodedIndexPrice) * 100000000).round();
  }

  static int _pow10(int precision) {
    var value = 1;
    for (var i = 0; i < precision; i++) {
      value *= 10;
    }
    return value;
  }
}

class BullBitcoinFxClient {
  BullBitcoinFxClient({
    http.Client? httpClient,
    this.endpoint = 'https://www.bullbitcoin.com/api/price',
  }) : _httpClient = httpClient ?? http.Client();

  final http.Client _httpClient;
  final String endpoint;

  Future<BullBitcoinRate> getIndexRate({
    required String fromCurrency,
    String toCurrency = 'BTC',
  }) async {
    final response = await _httpClient.post(
      Uri.parse(endpoint),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({
        'jsonrpc': '2.0',
        'id': DateTime.now().millisecondsSinceEpoch.toString(),
        'method': 'getUserRate',
        'params': {
          'element': {
            'fromCurrency': fromCurrency,
            'toCurrency': toCurrency,
          }
        },
      }),
    );

    if (response.statusCode < 200 || response.statusCode > 299) {
      throw StateError('rate endpoint returned ${response.statusCode}');
    }

    final decoded = jsonDecode(response.body) as Map<String, Object?>;
    final result = decoded['result'] as Map<String, Object?>?;
    final element = result?['element'] as Map<String, Object?>?;
    if (element == null) {
      throw StateError('rate response missing result.element');
    }

    return BullBitcoinRate(
      fromCurrency: element['fromCurrency']! as String,
      toCurrency: element['toCurrency']! as String,
      priceCurrency: element['priceCurrency']! as String,
      indexPrice: element['indexPrice']! as int,
      precision: element['precision']! as int,
      createdAt: DateTime.parse(element['createdAt']! as String),
    );
  }
}
