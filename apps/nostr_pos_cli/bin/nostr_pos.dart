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
    ..addCommand('pos-url')
    ..addCommand('announce-terminal')
    ..addCommand('auth-terminal')
    ..addCommand('revoke-terminal')
    ..addCommand('publish-events')
    ..addCommand('record-sale')
    ..addCommand('list-events')
    ..addCommand('list-sales')
    ..addCommand('export-sales')
    ..addCommand('recover-swaps')
    ..addCommand('quote');

  if (args.isEmpty) {
    stdout.writeln('Commands: create-pos, pos-url, pairing-code, quote');
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
    case 'pos-url':
      _posUrl(rest);
    case 'announce-terminal':
      await _announceTerminal(rest);
    case 'auth-terminal':
      await _authTerminal(rest);
    case 'revoke-terminal':
      await _revokeTerminal(rest);
    case 'publish-events':
      await _publishEvents(rest);
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

NostrPosEvent _maybeSign(NostrPosEvent event, String? privateKeyHex) {
  if (privateKeyHex == null || privateKeyHex.isEmpty) return event;
  return signNostrPosEvent(event, privateKeyHex);
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
    ..addOption(
      'relays',
      help: 'Comma-separated relays to scan for recovery backups.',
    )
    ..addOption('merchant-recovery-pubkey')
    ..addFlag('plan', defaultsTo: true);
  final parsed = parser.parse(args);
  final events = <NostrPosEvent>[
    ...await LocalEventStore(parsed['store'] as String).readAll(),
  ];
  if (parsed['relays'] != null) {
    events.addAll(
      await fetchSwapRecoveryBackups(
        relays: _parseRelays(parsed['relays'] as String),
        recoveryPubkey: parsed['merchant-recovery-pubkey'] as String?,
      ),
    );
  }
  final recoveries = swapRecoveriesFromEvents(events);
  final output = parsed['plan'] == true
      ? recoveryClaimPlan(recoveries)
      : recoveries.map((recovery) => recovery.toJson()).toList();
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(output));
}

Future<void> _publishEvents(List<String> args) async {
  final parser = ArgParser()
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl')
    ..addOption('relays', defaultsTo: defaultRelays.join(','))
    ..addOption('kind')
    ..addOption('limit', defaultsTo: '50');
  final parsed = parser.parse(args);
  final kind = parsed['kind'] == null
      ? null
      : int.parse(parsed['kind'] as String);
  final limit = int.parse(parsed['limit'] as String);
  final allEvents = await LocalEventStore(parsed['store'] as String).readAll();
  final events = allEvents
      .where((event) => kind == null || event.kind == kind)
      .take(limit)
      .toList();
  final relays = _parseRelays(parsed['relays'] as String);
  final output = <Map<String, Object?>>[];
  for (final event in events) {
    final results = await publishEventToRelays(relays: relays, event: event);
    output.add({
      'event_id': event.id,
      'kind': event.kind,
      'ok_count': results.where((result) => result.ok).length,
      'results': results.map((result) => result.toJson()).toList(),
    });
  }
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(output));
}

Future<void> _createPos(List<String> args) async {
  final parser = ArgParser()
    ..addOption('name', defaultsTo: 'Counter 1')
    ..addOption('merchant', defaultsTo: 'Seguras Butcher')
    ..addOption('currency', defaultsTo: 'CRC')
    ..addOption('pos-id', defaultsTo: 'seguras-butcher')
    ..addOption('merchant-pubkey', defaultsTo: 'a' * 64)
    ..addOption('merchant-privkey')
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl');
  final parsed = parser.parse(args);
  final merchantPrivkey = parsed['merchant-privkey'] as String?;
  final merchantPubkey = merchantPrivkey == null
      ? parsed['merchant-pubkey'] as String
      : publicKeyFromPrivateKey(merchantPrivkey);
  final profile = PosProfile(
    name: parsed['name'] as String,
    merchantName: parsed['merchant'] as String,
    currency: parsed['currency'] as String,
    description: 'Retail counter',
  );
  final event = buildPosProfileEvent(
    merchantPubkey: merchantPubkey,
    posId: parsed['pos-id'] as String,
    profile: profile,
  );
  final signed = _maybeSign(event, merchantPrivkey);
  await LocalEventStore(parsed['store'] as String).append(signed);
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(signed.toJson()));
}

void _posUrl(List<String> args) {
  final parser = ArgParser()
    ..addOption('pos-id', defaultsTo: 'seguras-butcher')
    ..addOption('merchant-pubkey', defaultsTo: 'a' * 64)
    ..addOption('merchant-privkey')
    ..addOption('relays', defaultsTo: defaultRelays.join(','))
    ..addOption('base-url', defaultsTo: 'https://pay.bullbitcoin.com/#/pos');
  final parsed = parser.parse(args);
  final merchantPrivkey = parsed['merchant-privkey'] as String?;
  final merchantPubkey = merchantPrivkey == null
      ? parsed['merchant-pubkey'] as String
      : publicKeyFromPrivateKey(merchantPrivkey);
  stdout.writeln(
    posProfileUrl(
      baseUrl: parsed['base-url'] as String,
      identifier: parsed['pos-id'] as String,
      pubkey: merchantPubkey,
      relays: _parseRelays(parsed['relays'] as String),
    ),
  );
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
    ..addOption('terminal-privkey')
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl');
  final parsed = parser.parse(args);
  final terminalPrivkey = parsed['terminal-privkey'] as String?;
  final terminalPubkey = terminalPrivkey == null
      ? parsed['terminal-pubkey'] as String
      : publicKeyFromPrivateKey(terminalPrivkey);
  final event = buildPairingAnnouncement(terminalPubkey: terminalPubkey);
  final signed = _maybeSign(event, terminalPrivkey);
  await LocalEventStore(parsed['store'] as String).append(signed);
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(signed.toJson()));
}

Future<void> _authTerminal(List<String> args) async {
  final parser = ArgParser()
    ..addOption('pairing-code', mandatory: true)
    ..addOption('pos-id', defaultsTo: 'seguras-butcher')
    ..addOption('merchant-pubkey', defaultsTo: 'a' * 64)
    ..addOption('merchant-privkey')
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
  final merchantPrivkey = parsed['merchant-privkey'] as String?;
  final merchantPubkey = merchantPrivkey == null
      ? parsed['merchant-pubkey'] as String
      : publicKeyFromPrivateKey(merchantPrivkey);
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
      merchantPubkey: merchantPubkey,
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
    merchantPubkey: merchantPubkey,
    posId: parsed['pos-id'] as String,
    authorization: authorization,
  );
  final encrypted = merchantPrivkey == null
      ? event
      : replaceEventContent(
          event,
          nip44EncryptToPubkey(
            plaintext: event.content,
            privateKeyHex: merchantPrivkey,
            publicKeyHex: terminalPubkey,
          ),
        );
  final signed = _maybeSign(encrypted, merchantPrivkey);
  await store.append(signed);
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(signed.toJson()));
}

Future<void> _revokeTerminal(List<String> args) async {
  final parser = ArgParser()
    ..addOption('terminal-pubkey', mandatory: true)
    ..addOption('pos-id', defaultsTo: 'seguras-butcher')
    ..addOption('merchant-pubkey', defaultsTo: 'a' * 64)
    ..addOption('merchant-privkey')
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl');
  final parsed = parser.parse(args);
  final merchantPrivkey = parsed['merchant-privkey'] as String?;
  final merchantPubkey = merchantPrivkey == null
      ? parsed['merchant-pubkey'] as String
      : publicKeyFromPrivateKey(merchantPrivkey);
  final event = buildTerminalRevocationEvent(
    merchantPubkey: merchantPubkey,
    posId: parsed['pos-id'] as String,
    terminalPubkey: parsed['terminal-pubkey'] as String,
  );
  final signed = _maybeSign(event, merchantPrivkey);
  await LocalEventStore(parsed['store'] as String).append(signed);
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(signed.toJson()));
}

Future<void> _recordSale(List<String> args) async {
  final parser = ArgParser()
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl')
    ..addOption('terminal-pubkey', defaultsTo: 'c' * 64)
    ..addOption('terminal-privkey')
    ..addOption('sale-id', defaultsTo: 'sale-demo')
    ..addOption('currency', defaultsTo: 'CRC')
    ..addOption('amount', defaultsTo: '8500')
    ..addOption('sats', defaultsTo: '25000')
    ..addOption('method', defaultsTo: 'lightning_swap')
    ..addOption('status', defaultsTo: 'settled')
    ..addOption('txid', defaultsTo: 'demo-txid');
  final parsed = parser.parse(args);
  final terminalPrivkey = parsed['terminal-privkey'] as String?;
  final terminalPubkey = terminalPrivkey == null
      ? parsed['terminal-pubkey'] as String
      : publicKeyFromPrivateKey(terminalPrivkey);
  final store = LocalEventStore(parsed['store'] as String);
  final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
  final saleId = parsed['sale-id'] as String;
  final sale = buildUnsignedEvent(
    pubkey: terminalPubkey,
    kind: NostrPosKinds.saleCreated,
    tags: [
      ['sale', saleId],
      ['terminal', terminalPubkey],
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
    pubkey: terminalPubkey,
    kind: NostrPosKinds.paymentStatus,
    tags: [
      ['sale', saleId],
      ['terminal', terminalPubkey],
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
    pubkey: terminalPubkey,
    kind: NostrPosKinds.receipt,
    tags: [
      ['sale', saleId],
      ['terminal', terminalPubkey],
    ],
    content: {'receipt_id': 'R-$saleId', 'sale_id': saleId, 'created_at': now},
  );
  final events = [
    _maybeSign(sale, terminalPrivkey),
    _maybeSign(status, terminalPrivkey),
    _maybeSign(receipt, terminalPrivkey),
  ];
  for (final event in events) {
    await store.append(event);
  }
  stdout.writeln(
    const JsonEncoder.withIndent(
      '  ',
    ).convert(events.map((event) => event.toJson()).toList()),
  );
}

Future<void> _listEvents(List<String> args) async {
  final parser = ArgParser()
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl')
    ..addOption('kind')
    ..addOption('relays')
    ..addOption('author')
    ..addOption('d')
    ..addOption('p')
    ..addOption('limit', defaultsTo: '50');
  final parsed = parser.parse(args);
  final events = parsed['relays'] == null
      ? parsed['kind'] == null
            ? await LocalEventStore(parsed['store'] as String).readAll()
            : await LocalEventStore(
                parsed['store'] as String,
              ).byKind(int.parse(parsed['kind'] as String))
      : await queryEventsFromRelays(
          relays: _parseRelays(parsed['relays'] as String),
          filter: {
            if (parsed['kind'] != null)
              'kinds': [int.parse(parsed['kind'] as String)],
            if (parsed['author'] != null)
              'authors': [parsed['author'] as String],
            if (parsed['d'] != null) '#d': [parsed['d'] as String],
            if (parsed['p'] != null) '#p': [parsed['p'] as String],
            'limit': int.parse(parsed['limit'] as String),
          },
        );
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
