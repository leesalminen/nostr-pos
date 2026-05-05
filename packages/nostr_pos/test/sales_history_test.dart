import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test('merges sale, status, and receipt events into accounting rows', () {
    final sale = buildUnsignedEvent(
      pubkey: 'a' * 64,
      kind: NostrPosKinds.saleCreated,
      tags: [
        ['x', 'bucket'],
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
        ['x', 'bucket'],
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
        ['x', 'bucket'],
      ],
      createdAt: 12,
      content: {'receipt_id': 'R-1', 'sale_id': 'sale1', 'created_at': 12},
    );

    final rows = salesHistoryFromEvents([sale, status, receipt]);
    expect(rows, hasLength(1));
    expect(rows.single.status, 'settled');
    expect(rows.single.statusKind, SaleStatus.settled);
    expect(rows.single.methodKind, PosPaymentMethod.lightningSwap);
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
        ['x', 'bucket'],
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
        ['x', 'bucket'],
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

  test('uses recovery claim records to settle interrupted sales', () {
    final sale = buildUnsignedEvent(
      pubkey: 'a' * 64,
      kind: NostrPosKinds.saleCreated,
      tags: [
        ['x', 'bucket'],
      ],
      createdAt: 10,
      content: {
        'sale_id': 'sale1',
        'created_at': 10,
        'amount': {
          'fiat_currency': 'CAD',
          'fiat_amount': '5.00',
          'sat_amount': 12345,
        },
        'note': null,
        'discount_fiat': null,
        'status': 'created',
      },
    );
    final waiting = buildUnsignedEvent(
      pubkey: 'a' * 64,
      kind: NostrPosKinds.paymentStatus,
      tags: [
        ['x', 'bucket'],
      ],
      createdAt: 11,
      content: {
        'sale_id': 'sale1',
        'status': 'waiting',
        'method': 'lightning_swap',
        'updated_at': 11,
        'payment': {'boltz_swap_id': 'swap1'},
      },
    );
    final recovery = buildUnsignedEvent(
      pubkey: 'b' * 64,
      kind: NostrPosKinds.swapRecoveryBackup,
      tags: [
        ['sale', 'sale1'],
        ['swap', 'swap1'],
      ],
      createdAt: 30,
      content: {
        'sale_id': 'sale1',
        'payment_attempt_id': 'attempt1',
        'swap_id': 'swap1',
        'terminal_id': 'term1',
        'encrypted_local_blob': 'blob',
        'expires_at': 9999999999,
        'claim': {
          'mode': 'standard',
          'claim_txid': 'claimtxid',
          'claim_broadcast_at': 30,
        },
      },
    );

    final rows = salesHistoryFromEvents([sale, waiting, recovery]);

    expect(rows, hasLength(1));
    expect(rows.single.status, 'settled');
    expect(rows.single.method, 'lightning_swap');
    expect(rows.single.settlementTxid, 'claimtxid');
  });
}
