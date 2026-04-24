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

  test('decrypts merchant accounting events before merging history', () async {
    const terminalPrivkey =
        '0000000000000000000000000000000000000000000000000000000000000002';
    const recoveryPrivkey =
        '0000000000000000000000000000000000000000000000000000000000000003';
    final terminalPubkey = publicKeyFromPrivateKey(terminalPrivkey);
    final recoveryPubkey = publicKeyFromPrivateKey(recoveryPrivkey);

    final sale = buildUnsignedEvent(
      pubkey: terminalPubkey,
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
        'note': 'encrypted counter',
        'discount_fiat': null,
        'status': 'created',
      },
    );
    final status = buildUnsignedEvent(
      pubkey: terminalPubkey,
      kind: NostrPosKinds.paymentStatus,
      tags: [
        ['sale', 'sale1'],
      ],
      createdAt: 11,
      content: {
        'sale_id': 'sale1',
        'status': 'settled',
        'method': 'liquid',
        'updated_at': 11,
        'payment': {'settlement_txid': 'txid'},
      },
    );
    final encryptedSale = signNostrPosEvent(
      replaceEventContent(
        sale,
        await nip44EncryptToPubkey(
          plaintext: sale.content,
          privateKeyHex: terminalPrivkey,
          publicKeyHex: recoveryPubkey,
        ),
      ),
      terminalPrivkey,
    );
    final encryptedStatus = signNostrPosEvent(
      replaceEventContent(
        status,
        await nip44EncryptToPubkey(
          plaintext: status.content,
          privateKeyHex: terminalPrivkey,
          publicKeyHex: recoveryPubkey,
        ),
      ),
      terminalPrivkey,
    );

    expect(salesHistoryFromEvents([encryptedSale, encryptedStatus]), isEmpty);

    final rows = await salesHistoryFromEventsForMerchant([
      encryptedSale,
      encryptedStatus,
    ], merchantRecoveryPrivkey: recoveryPrivkey);
    expect(rows, hasLength(1));
    expect(rows.single.status, 'settled');
    expect(rows.single.note, 'encrypted counter');
  });
}
