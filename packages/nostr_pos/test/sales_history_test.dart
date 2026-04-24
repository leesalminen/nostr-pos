import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test('merges sale, status, and receipt events into accounting rows', () {
    final sale = buildUnsignedEvent(
      pubkey: 'a' * 64,
      kind: NostrPosKinds.saleCreated,
      tags: [
        ['sale', 'sale1'],
      ],
      createdAt: 10,
      content: {
        'sale_id': 'sale1',
        'created_at': 10,
        'amount': {
          'fiat_currency': 'CRC',
          'fiat_amount': '8500',
          'sat_amount': 25000,
        },
        'note': 'counter',
        'discount_fiat': null,
        'status': 'created',
      },
    );
    final status = buildUnsignedEvent(
      pubkey: 'a' * 64,
      kind: NostrPosKinds.paymentStatus,
      tags: [
        ['sale', 'sale1'],
      ],
      createdAt: 11,
      content: {
        'sale_id': 'sale1',
        'status': 'settled',
        'method': 'lightning_swap',
        'updated_at': 11,
        'payment': {'settlement_txid': 'txid'},
      },
    );
    final receipt = buildUnsignedEvent(
      pubkey: 'a' * 64,
      kind: NostrPosKinds.receipt,
      tags: [
        ['sale', 'sale1'],
      ],
      createdAt: 12,
      content: {'receipt_id': 'R-1', 'sale_id': 'sale1', 'created_at': 12},
    );

    final rows = salesHistoryFromEvents([sale, status, receipt]);
    expect(rows, hasLength(1));
    expect(rows.single.status, 'settled');
    expect(rows.single.receiptId, 'R-1');
    expect(
      salesHistoryCsv(rows),
      contains(
        'sale1,10,CRC,8500,25000,settled,lightning_swap,txid,R-1,counter',
      ),
    );
  });
}
