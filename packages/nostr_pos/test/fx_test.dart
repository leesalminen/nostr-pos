import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test('decodes indexed fiat price and converts to sats', () {
    final rate = BullBitcoinRate(
      fromCurrency: 'CRC',
      toCurrency: 'BTC',
      priceCurrency: 'CRC',
      indexPrice: 3549391698,
      precision: 2,
      createdAt: DateTime.utc(2026, 4, 24),
    );

    expect(rate.decodedIndexPrice, 35493916.98);
    expect(rate.fiatToSats(8500), 23948);
  });
}
