import 'dart:convert';
import 'dart:io';

import 'package:args/args.dart';
import 'package:nostr_pos/nostr_pos.dart';

const defaultRelays = [
  'wss://no.str.cr',
  'wss://relay.primal.net',
  'wss://nos.lol',
];

void main(List<String> args) async {
  final parser = ArgParser()
    ..addCommand('create-pos')
    ..addCommand('pairing-code')
    ..addCommand('fetch-pairing')
    ..addCommand('announce-terminal')
    ..addCommand('auth-terminal')
    ..addCommand('revoke-terminal')
    ..addCommand('record-sale')
    ..addCommand('list-events')
    ..addCommand('list-sales')
    ..addCommand('export-sales')
    ..addCommand('recover-swaps')
    ..addCommand('quote');

  if (args.isEmpty) {
    stdout.writeln('Commands: create-pos, pairing-code, quote');
    exitCode = 64;
    return;
  }

  final command = args.first;
  final rest = args.skip(1).toList();
  switch (command) {
    case 'create-pos':
      await _createPos(rest);
    case 'pairing-code':
      _pairingCode(rest);
    case 'fetch-pairing':
      await _fetchPairing(rest);
    case 'announce-terminal':
      await _announceTerminal(rest);
    case 'auth-terminal':
      await _authTerminal(rest);
    case 'revoke-terminal':
      await _revokeTerminal(rest);
    case 'record-sale':
      await _recordSale(rest);
    case 'list-events':
      await _listEvents(rest);
    case 'list-sales':
      await _listSales(rest);
    case 'export-sales':
      await _exportSales(rest);
    case 'recover-swaps':
      await _recoverSwaps(rest);
    case 'quote':
      await _quote(rest);
    default:
      stdout.writeln(parser.usage);
      exitCode = 64;
  }
}

List<String> _parseRelays(String value) {
  if (value.trim().isEmpty) return const [];
  return value
      .split(',')
      .map((relay) => relay.trim())
      .where((relay) => relay.isNotEmpty)
      .toList();
}

Future<void> _listSales(List<String> args) async {
  final parser = ArgParser()
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl');
  final parsed = parser.parse(args);
  final events = await LocalEventStore(parsed['store'] as String).readAll();
  final rows = salesHistoryFromEvents(events);
  stdout.writeln(
    const JsonEncoder.withIndent(
      '  ',
    ).convert(rows.map((row) => row.toJson()).toList()),
  );
}

Future<void> _exportSales(List<String> args) async {
  final parser = ArgParser()
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl')
    ..addOption('format', defaultsTo: 'csv', allowed: ['csv', 'json']);
  final parsed = parser.parse(args);
  final events = await LocalEventStore(parsed['store'] as String).readAll();
  final rows = salesHistoryFromEvents(events);
  if (parsed['format'] == 'json') {
    stdout.writeln(
      const JsonEncoder.withIndent(
        '  ',
      ).convert(rows.map((row) => row.toJson()).toList()),
    );
  } else {
    stdout.write(salesHistoryCsv(rows));
  }
}

Future<void> _recoverSwaps(List<String> args) async {
  final parser = ArgParser()
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl')
    ..addFlag('plan', defaultsTo: true);
  final parsed = parser.parse(args);
  final events = await LocalEventStore(parsed['store'] as String).readAll();
  final recoveries = swapRecoveriesFromEvents(events);
  final output = parsed['plan'] == true
      ? recoveryClaimPlan(recoveries)
      : recoveries.map((recovery) => recovery.toJson()).toList();
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(output));
}

Future<void> _createPos(List<String> args) async {
  final parser = ArgParser()
    ..addOption('name', defaultsTo: 'Counter 1')
    ..addOption('merchant', defaultsTo: 'Seguras Butcher')
    ..addOption('currency', defaultsTo: 'CRC')
    ..addOption('pos-id', defaultsTo: 'seguras-butcher')
    ..addOption('merchant-pubkey', defaultsTo: 'a' * 64)
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl');
  final parsed = parser.parse(args);
  final profile = PosProfile(
    name: parsed['name'] as String,
    merchantName: parsed['merchant'] as String,
    currency: parsed['currency'] as String,
    description: 'Retail counter',
  );
  final event = buildPosProfileEvent(
    merchantPubkey: parsed['merchant-pubkey'] as String,
    posId: parsed['pos-id'] as String,
    profile: profile,
  );
  await LocalEventStore(parsed['store'] as String).append(event);
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(event.toJson()));
}

void _pairingCode(List<String> args) {
  final parser = ArgParser()..addOption('terminal-pubkey', mandatory: true);
  final parsed = parser.parse(args);
  stdout.writeln(pairingCodeFromPubkey(parsed['terminal-pubkey'] as String));
}

Future<void> _fetchPairing(List<String> args) async {
  final parser = ArgParser()
    ..addOption('pairing-code', mandatory: true)
    ..addOption('relays', defaultsTo: defaultRelays.join(','));
  final parsed = parser.parse(args);
  final event = await findPairingAnnouncement(
    relays: _parseRelays(parsed['relays'] as String),
    pairingCode: parsed['pairing-code'] as String,
  );
  if (event == null) {
    stderr.writeln(
      'No terminal announced that pairing code on the configured relays.',
    );
    exitCode = 66;
    return;
  }
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(event.toJson()));
}

Future<void> _announceTerminal(List<String> args) async {
  final parser = ArgParser()
    ..addOption('terminal-pubkey', mandatory: true)
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl');
  final parsed = parser.parse(args);
  final event = buildPairingAnnouncement(
    terminalPubkey: parsed['terminal-pubkey'] as String,
  );
  await LocalEventStore(parsed['store'] as String).append(event);
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(event.toJson()));
}

Future<void> _authTerminal(List<String> args) async {
  final parser = ArgParser()
    ..addOption('pairing-code', mandatory: true)
    ..addOption('pos-id', defaultsTo: 'seguras-butcher')
    ..addOption('merchant-pubkey', defaultsTo: 'a' * 64)
    ..addOption('merchant-recovery-pubkey', defaultsTo: 'b' * 64)
    ..addOption('terminal-name', defaultsTo: 'Counter 1')
    ..addOption(
      'descriptor',
      defaultsTo: 'ct(slip77(00),elwpkh([00000000/84h/1776h/0h]xpub-demo/0/*))',
    )
    ..addOption('fingerprint', defaultsTo: 'demo-fingerprint')
    ..addOption('branch', defaultsTo: '17')
    ..addOption(
      'relays',
      help:
          'Comma-separated relays to search if the local store has no pairing announcement.',
    )
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl');
  final parsed = parser.parse(args);
  final store = LocalEventStore(parsed['store'] as String);
  final pairing =
      await store.latestByTag(
        kind: NostrPosKinds.pairingAnnouncement,
        tagName: 'pairing',
        tagValue: parsed['pairing-code'] as String,
      ) ??
      (parsed['relays'] == null
          ? null
          : await findPairingAnnouncement(
              relays: _parseRelays(parsed['relays'] as String),
              pairingCode: parsed['pairing-code'] as String,
            ));
  if (pairing == null) {
    stderr.writeln('No terminal announced that pairing code.');
    exitCode = 66;
    return;
  }
  await store.append(pairing);
  final terminalPubkey = pairing.tags.firstWhere((tag) => tag[0] == 'p')[1];
  final authorization = TerminalAuthorization(
    posRef: posRef(
      merchantPubkey: parsed['merchant-pubkey'] as String,
      posId: parsed['pos-id'] as String,
    ),
    terminalPubkey: terminalPubkey,
    terminalName: parsed['terminal-name'] as String,
    pairingCodeHint: parsed['pairing-code'] as String,
    ctDescriptor: parsed['descriptor'] as String,
    descriptorFingerprint: parsed['fingerprint'] as String,
    terminalBranch: int.parse(parsed['branch'] as String),
    merchantRecoveryPubkey: parsed['merchant-recovery-pubkey'] as String,
    expiresAt:
        DateTime.now().add(const Duration(days: 365)).millisecondsSinceEpoch ~/
        1000,
  );
  final event = buildTerminalAuthorizationEvent(
    merchantPubkey: parsed['merchant-pubkey'] as String,
    posId: parsed['pos-id'] as String,
    authorization: authorization,
  );
  await store.append(event);
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(event.toJson()));
}

Future<void> _revokeTerminal(List<String> args) async {
  final parser = ArgParser()
    ..addOption('terminal-pubkey', mandatory: true)
    ..addOption('pos-id', defaultsTo: 'seguras-butcher')
    ..addOption('merchant-pubkey', defaultsTo: 'a' * 64)
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl');
  final parsed = parser.parse(args);
  final event = buildTerminalRevocationEvent(
    merchantPubkey: parsed['merchant-pubkey'] as String,
    posId: parsed['pos-id'] as String,
    terminalPubkey: parsed['terminal-pubkey'] as String,
  );
  await LocalEventStore(parsed['store'] as String).append(event);
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(event.toJson()));
}

Future<void> _recordSale(List<String> args) async {
  final parser = ArgParser()
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl')
    ..addOption('terminal-pubkey', defaultsTo: 'c' * 64)
    ..addOption('sale-id', defaultsTo: 'sale-demo')
    ..addOption('currency', defaultsTo: 'CRC')
    ..addOption('amount', defaultsTo: '8500')
    ..addOption('sats', defaultsTo: '25000')
    ..addOption('method', defaultsTo: 'lightning_swap')
    ..addOption('status', defaultsTo: 'settled')
    ..addOption('txid', defaultsTo: 'demo-txid');
  final parsed = parser.parse(args);
  final store = LocalEventStore(parsed['store'] as String);
  final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
  final saleId = parsed['sale-id'] as String;
  final sale = buildUnsignedEvent(
    pubkey: parsed['terminal-pubkey'] as String,
    kind: NostrPosKinds.saleCreated,
    tags: [
      ['sale', saleId],
      ['terminal', parsed['terminal-pubkey'] as String],
    ],
    content: {
      'sale_id': saleId,
      'created_at': now,
      'amount': {
        'fiat_currency': parsed['currency'],
        'fiat_amount': parsed['amount'],
        'sat_amount': int.parse(parsed['sats'] as String),
      },
      'note': null,
      'discount_fiat': null,
      'status': 'created',
    },
  );
  final status = buildUnsignedEvent(
    pubkey: parsed['terminal-pubkey'] as String,
    kind: NostrPosKinds.paymentStatus,
    tags: [
      ['sale', saleId],
      ['terminal', parsed['terminal-pubkey'] as String],
      ['status', parsed['status'] as String],
    ],
    content: {
      'sale_id': saleId,
      'status': parsed['status'],
      'method': parsed['method'],
      'updated_at': now,
      'payment': {'settlement_txid': parsed['txid']},
    },
  );
  final receipt = buildUnsignedEvent(
    pubkey: parsed['terminal-pubkey'] as String,
    kind: NostrPosKinds.receipt,
    tags: [
      ['sale', saleId],
      ['terminal', parsed['terminal-pubkey'] as String],
    ],
    content: {'receipt_id': 'R-$saleId', 'sale_id': saleId, 'created_at': now},
  );
  await store.append(sale);
  await store.append(status);
  await store.append(receipt);
  stdout.writeln(
    const JsonEncoder.withIndent(
      '  ',
    ).convert([sale.toJson(), status.toJson(), receipt.toJson()]),
  );
}

Future<void> _listEvents(List<String> args) async {
  final parser = ArgParser()
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl')
    ..addOption('kind');
  final parsed = parser.parse(args);
  final store = LocalEventStore(parsed['store'] as String);
  final events = parsed['kind'] == null
      ? await store.readAll()
      : await store.byKind(int.parse(parsed['kind'] as String));
  stdout.writeln(
    const JsonEncoder.withIndent(
      '  ',
    ).convert(events.map((event) => event.toJson()).toList()),
  );
}

Future<void> _quote(List<String> args) async {
  final parser = ArgParser()
    ..addOption('currency', defaultsTo: 'CRC')
    ..addOption('amount', defaultsTo: '8500');
  final parsed = parser.parse(args);
  final rate = await BullBitcoinFxClient().getIndexRate(
    fromCurrency: parsed['currency'] as String,
  );
  final amount = num.parse(parsed['amount'] as String);
  stdout.writeln(
    const JsonEncoder.withIndent('  ').convert({
      'currency': parsed['currency'],
      'amount': amount,
      'index_price': rate.indexPrice,
      'precision': rate.precision,
      'decoded_index_price': rate.decodedIndexPrice,
      'sats': rate.fiatToSats(amount),
      'created_at': rate.createdAt.toIso8601String(),
    }),
  );
}
