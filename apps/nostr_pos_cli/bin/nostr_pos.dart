import 'dart:convert';
import 'dart:io';

import 'package:args/args.dart';
import 'package:nostr_pos/nostr_pos.dart';

const defaultRelays = [
  'wss://no.str.cr',
  'wss://relay.primal.net',
  'wss://nos.lol',
];

const _usage = '''
nostr_pos — Dart controller CLI for the open Nostr POS protocol.

Streamlined demo flow (run alongside the web cashier):
  init           Generate merchant + recovery keys and write .nostr-pos/profile.json
  serve-pos      Publish the POS profile and print the pairing URL for the PWA
  pair-terminal  Watch relays for the pairing code, sign + publish the auth event

Lower-level commands:
  create-pos          Build a POS profile event and append it to the local store
  pos-url             Print the naddr-encoded URL the cashier scans
  pairing-code        Derive the pairing code from a terminal pubkey
  announce-terminal   Build a pairing-announcement event (test/dev only)
  fetch-pairing       Look up a pairing announcement on relays
  auth-terminal       Build the encrypted terminal-authorization event
  revoke-terminal     Build the terminal-revocation event
  publish-events      Push local-store events to relays (--kind / --limit)
  record-sale         Record sale-created + payment-status + receipt locally
  list-events         List events from the local store or relays
  list-sales          Reduce sales/payment/receipt events into a sales table
  export-sales        Export sales as csv or json
  recover-swaps       Inspect / broadcast swap recovery records
  quote               Fetch a Bull Bitcoin index price quote

Run any command with no args to see its options.
''';

void main(List<String> args) async {
  if (args.isEmpty || args.first == '--help' || args.first == '-h') {
    stdout.write(_usage);
    if (args.isEmpty) exitCode = 64;
    return;
  }

  final command = args.first;
  final rest = args.skip(1).toList();
  switch (command) {
    case 'init':
      await _init(rest);
    case 'serve-pos':
      await _servePos(rest);
    case 'pair-terminal':
      await _pairTerminal(rest);
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
      stdout.write(_usage);
      exitCode = 64;
  }
}

class _DemoProfile {
  _DemoProfile({
    required this.merchantPrivkey,
    required this.merchantPubkey,
    required this.recoveryPrivkey,
    required this.recoveryPubkey,
    required this.posId,
    required this.name,
    required this.merchantName,
    required this.currency,
    required this.network,
    required this.relays,
    required this.store,
    required this.baseUrl,
    required this.saleBucketSecret,
    required this.saleBucketGeneration,
  });

  final String merchantPrivkey;
  final String merchantPubkey;
  final String recoveryPrivkey;
  final String recoveryPubkey;
  final String posId;
  final String name;
  final String merchantName;
  final String currency;
  final PosNetwork network;
  final List<String> relays;
  final String store;
  final String baseUrl;
  final String saleBucketSecret;
  final int saleBucketGeneration;

  Map<String, Object?> toJson() => {
    'version': 1,
    'merchant': {'privkey': merchantPrivkey, 'pubkey': merchantPubkey},
    'recovery': {'privkey': recoveryPrivkey, 'pubkey': recoveryPubkey},
    'pos_id': posId,
    'name': name,
    'merchant_name': merchantName,
    'currency': currency,
    'network': network.name,
    'relays': relays,
    'store': store,
    'base_url': baseUrl,
    'sale_bucket_secret': saleBucketSecret,
    'sale_bucket_generation': saleBucketGeneration,
  };

  static _DemoProfile fromJson(Map<String, Object?> json) {
    final merchant = (json['merchant'] as Map).cast<String, Object?>();
    final recovery = (json['recovery'] as Map).cast<String, Object?>();
    return _DemoProfile(
      merchantPrivkey: merchant['privkey']! as String,
      merchantPubkey: merchant['pubkey']! as String,
      recoveryPrivkey: recovery['privkey']! as String,
      recoveryPubkey: recovery['pubkey']! as String,
      posId: json['pos_id']! as String,
      name: json['name']! as String,
      merchantName: json['merchant_name']! as String,
      currency: json['currency']! as String,
      network: PosNetwork.fromName((json['network'] as String?) ?? 'mainnet'),
      relays: (json['relays']! as List).cast<String>(),
      store: json['store']! as String,
      baseUrl: json['base_url']! as String,
      saleBucketSecret: (json['sale_bucket_secret'] as String?) ?? '0' * 64,
      saleBucketGeneration: (json['sale_bucket_generation'] as int?) ?? 1,
    );
  }
}

const _profilePath = '.nostr-pos/profile.json';
const _defaultPosBaseUrl = 'https://nostr-pos.vercel.app/#/pos';

Future<_DemoProfile?> _loadProfile(String path) async {
  final file = File(path);
  if (!await file.exists()) return null;
  return _DemoProfile.fromJson(
    jsonDecode(await file.readAsString()) as Map<String, Object?>,
  );
}

Future<_DemoProfile> _requireProfile(String path) async {
  final profile = await _loadProfile(path);
  if (profile == null) {
    stderr.writeln(
      'No profile at $path. Run `dart run bin/nostr_pos.dart init` first.',
    );
    exit(66);
  }
  return profile;
}

Future<void> _init(List<String> args) async {
  final parser = ArgParser()
    ..addOption('profile', defaultsTo: _profilePath)
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl')
    ..addOption('pos-id')
    ..addOption('name', defaultsTo: 'Counter 1')
    ..addOption('merchant', defaultsTo: 'Demo Merchant')
    ..addOption('currency', defaultsTo: 'USD')
    ..addOption(
      'network',
      defaultsTo: 'mainnet',
      allowed: ['mainnet', 'testnet'],
    )
    ..addOption('relays', defaultsTo: defaultRelays.join(','))
    ..addOption('base-url', defaultsTo: _defaultPosBaseUrl)
    ..addOption('merchant-privkey', help: 'Reuse an existing 32-byte hex key.')
    ..addOption('recovery-privkey', help: 'Reuse an existing 32-byte hex key.')
    ..addFlag(
      'force',
      defaultsTo: false,
      help: 'Overwrite an existing profile file.',
    );
  final parsed = parser.parse(args);
  final profilePath = parsed['profile'] as String;
  final file = File(profilePath);
  if (await file.exists() && parsed['force'] != true) {
    stderr.writeln(
      'Refusing to overwrite $profilePath. Pass --force to regenerate.',
    );
    exitCode = 73;
    return;
  }

  final merchantPrivkey =
      (parsed['merchant-privkey'] as String?) ?? randomAuxHex();
  final recoveryPrivkey =
      (parsed['recovery-privkey'] as String?) ?? randomAuxHex();
  final posId =
      (parsed['pos-id'] as String?) ??
      'demo-${DateTime.now().millisecondsSinceEpoch ~/ 1000}';
  final profile = _DemoProfile(
    merchantPrivkey: merchantPrivkey,
    merchantPubkey: publicKeyFromPrivateKey(merchantPrivkey),
    recoveryPrivkey: recoveryPrivkey,
    recoveryPubkey: publicKeyFromPrivateKey(recoveryPrivkey),
    posId: posId,
    name: parsed['name'] as String,
    merchantName: parsed['merchant'] as String,
    currency: parsed['currency'] as String,
    network: PosNetwork.fromName(parsed['network'] as String),
    relays: _parseRelays(parsed['relays'] as String),
    store: parsed['store'] as String,
    baseUrl: parsed['base-url'] as String,
    saleBucketSecret: randomAuxHex(),
    saleBucketGeneration: 1,
  );
  await file.parent.create(recursive: true);
  await file.writeAsString(
    '${const JsonEncoder.withIndent('  ').convert(profile.toJson())}\n',
  );

  stdout
    ..writeln('Wrote $profilePath')
    ..writeln('  merchant pubkey:  ${profile.merchantPubkey}')
    ..writeln('  recovery pubkey:  ${profile.recoveryPubkey}')
    ..writeln('  pos id:           ${profile.posId}')
    ..writeln('  network:          ${profile.network.name}')
    ..writeln('  store:            ${profile.store}')
    ..writeln('  relays:           ${profile.relays.join(", ")}')
    ..writeln('')
    ..writeln('Next:')
    ..writeln('  dart run bin/nostr_pos.dart serve-pos')
    ..writeln(
      '  dart run bin/nostr_pos.dart pair-terminal --pairing-code XXXX-XXXX',
    );
}

Future<void> _servePos(List<String> args) async {
  final parser = ArgParser()
    ..addOption('profile', defaultsTo: _profilePath)
    ..addFlag(
      'publish',
      defaultsTo: true,
      help: 'Publish the profile event to the configured relays.',
    );
  final parsed = parser.parse(args);
  final profile = await _requireProfile(parsed['profile'] as String);

  final posProfile = PosProfile(
    name: profile.name,
    merchantName: profile.merchantName,
    currency: profile.currency,
    description: 'Retail counter',
    network: profile.network,
    relays: profile.relays,
  );
  final event = signNostrPosEvent(
    buildPosProfileEvent(
      merchantPubkey: profile.merchantPubkey,
      posId: profile.posId,
      profile: posProfile,
    ),
    profile.merchantPrivkey,
  );
  await LocalEventStore(profile.store).append(event);

  final url = posProfileUrl(
    baseUrl: profile.baseUrl,
    identifier: profile.posId,
    pubkey: profile.merchantPubkey,
    relays: profile.relays,
  );

  stdout
    ..writeln('POS profile event id: ${event.id}')
    ..writeln('Local store:          ${profile.store}');

  if (parsed['publish'] == true) {
    final results = await publishEventToRelays(
      relays: profile.relays,
      event: event,
    );
    final ok = results.where((r) => r.ok).length;
    stdout.writeln('Published profile to $ok/${results.length} relays.');
    for (final result in results.where((r) => !r.ok)) {
      stdout.writeln('  ! ${result.relay}: ${result.message}');
    }
  }

  stdout
    ..writeln('')
    ..writeln('Open this URL on the cashier device to start activation:')
    ..writeln('  $url');
}

Future<void> _pairTerminal(List<String> args) async {
  final parser = ArgParser()
    ..addOption('profile', defaultsTo: _profilePath)
    ..addOption('pairing-code', mandatory: true)
    ..addOption(
      'descriptor',
      mandatory: true,
      help: 'Liquid CT descriptor for this terminal authorization.',
    )
    ..addOption('fingerprint', defaultsTo: 'demo-fingerprint')
    ..addOption('branch', defaultsTo: '17')
    ..addOption('terminal-name', defaultsTo: 'Counter 1')
    ..addOption('terminal-id')
    ..addOption('sale-bucket-secret')
    ..addOption('sale-bucket-generation', defaultsTo: '1')
    ..addOption(
      'timeout-seconds',
      defaultsTo: '60',
      help: 'How long to wait for the pairing announcement on relays.',
    )
    ..addOption(
      'poll-seconds',
      defaultsTo: '2',
      help: 'Polling interval while waiting for the pairing announcement.',
    );
  final parsed = parser.parse(args);
  final profile = await _requireProfile(parsed['profile'] as String);
  final code = (parsed['pairing-code'] as String).trim().toUpperCase();
  final descriptor = (parsed['descriptor'] as String).trim();
  if (descriptor.isEmpty) {
    stderr.writeln('Liquid CT descriptor is required.');
    exitCode = 64;
    return;
  }

  final timeout = Duration(
    seconds: int.parse(parsed['timeout-seconds'] as String),
  );
  final poll = Duration(seconds: int.parse(parsed['poll-seconds'] as String));
  final deadline = DateTime.now().add(timeout);

  stdout.writeln('Watching ${profile.relays.length} relays for $code…');
  NostrPosEvent? pairing;
  while (DateTime.now().isBefore(deadline)) {
    pairing = await findPairingAnnouncement(
      relays: profile.relays,
      pairingCode: code,
    );
    if (pairing != null) break;
    await Future<void>.delayed(poll);
  }
  if (pairing == null) {
    stderr.writeln('Timed out: no pairing announcement for $code.');
    exitCode = 66;
    return;
  }

  final terminalPubkey = pairing.tags.firstWhere((tag) => tag[0] == 'p')[1];
  final terminalId = randomAuxHex().substring(0, 32);
  final store = LocalEventStore(profile.store);
  await store.append(pairing);

  final authorization = TerminalAuthorization(
    posRef: posRef(
      merchantPubkey: profile.merchantPubkey,
      posId: profile.posId,
    ),
    terminalPubkey: terminalPubkey,
    terminalId: terminalId,
    terminalName: parsed['terminal-name'] as String,
    pairingCodeHint: code,
    ctDescriptor: descriptor,
    descriptorFingerprint: parsed['fingerprint'] as String,
    terminalBranch: int.parse(parsed['branch'] as String),
    merchantRecoveryPubkey: profile.recoveryPubkey,
    saleBucketSecret: profile.saleBucketSecret,
    saleBucketGeneration: profile.saleBucketGeneration,
    effectiveFromEpochDay: epochDayFromUnix(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
    ),
    network: profile.network,
    expiresAt:
        DateTime.now().add(const Duration(days: 365)).millisecondsSinceEpoch ~/
        1000,
  );
  final unsigned = buildTerminalAuthorizationEvent(
    merchantPubkey: profile.merchantPubkey,
    posId: profile.posId,
    authorization: authorization,
  );
  final encrypted = replaceEventContent(
    unsigned,
    await nip44EncryptToPubkey(
      plaintext: unsigned.content,
      privateKeyHex: profile.merchantPrivkey,
      publicKeyHex: terminalPubkey,
    ),
  );
  final signed = signNostrPosEvent(encrypted, profile.merchantPrivkey);
  await store.append(signed);

  final results = await publishEventToRelays(
    relays: profile.relays,
    event: signed,
  );
  final ok = results.where((r) => r.ok).length;
  stdout
    ..writeln('Authorized terminal ${terminalPubkey.substring(0, 12)}…')
    ..writeln('Terminal id:          $terminalId')
    ..writeln('Authorization event:  ${signed.id}')
    ..writeln('Published auth to $ok/${results.length} relays.');
  for (final result in results.where((r) => !r.ok)) {
    stdout.writeln('  ! ${result.relay}: ${result.message}');
  }
  if (ok == 0) {
    exitCode = 70;
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
  _addSalesReadOptions(parser);
  final parsed = parser.parse(args);
  final rows = await _salesRows(parsed);
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
  _addSalesReadOptions(parser);
  final parsed = parser.parse(args);
  final rows = await _salesRows(parsed);
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

void _addSalesReadOptions(ArgParser parser) {
  parser
    ..addOption('relays', help: 'Comma-separated relays to read sales from.')
    ..addOption(
      'merchant-recovery-privkey',
      help: 'Private key used to decrypt encrypted sale history.',
    )
    ..addOption('author', help: 'Only include events signed by this pubkey.')
    ..addOption(
      'bucket',
      help: 'Only include events tagged with this sale bucket.',
    )
    ..addOption('days', defaultsTo: '1')
    ..addOption('limit', defaultsTo: '500');
}

Future<List<SaleSummary>> _salesRows(ArgResults parsed) async {
  final events = <NostrPosEvent>[
    ...await LocalEventStore(parsed['store'] as String).readAll(),
  ];
  if (parsed['relays'] != null) {
    events.addAll(
      await queryEventsFromRelays(
        relays: _parseRelays(parsed['relays'] as String),
        filter: {
          'kinds': [
            NostrPosKinds.saleCreated,
            NostrPosKinds.paymentStatus,
            NostrPosKinds.receipt,
          ],
          if (parsed['author'] != null) 'authors': [parsed['author'] as String],
          if (parsed['bucket'] != null) '#x': [parsed['bucket'] as String],
          'limit': int.parse(parsed['limit'] as String),
        },
      ),
    );
  }

  final recoveryPrivkey = parsed['merchant-recovery-privkey'] as String?;
  if (recoveryPrivkey != null && recoveryPrivkey.isNotEmpty) {
    return salesHistoryFromEventsForMerchant(
      events,
      merchantRecoveryPrivkey: recoveryPrivkey,
    );
  }
  return salesHistoryFromEvents(events);
}

Future<void> _recoverSwaps(List<String> args) async {
  final parser = ArgParser()
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl')
    ..addOption(
      'relays',
      help: 'Comma-separated relays to scan for recovery backups.',
    )
    ..addOption('merchant-recovery-pubkey')
    ..addOption(
      'merchant-recovery-privkey',
      help: 'Private key used to unwrap NIP-59 recovery backups.',
    )
    ..addOption(
      'terminal-id',
      help: 'Terminal id to use when decrypting recovery blobs without tags.',
    )
    ..addOption(
      'boltz-api',
      help: 'Boltz API base URL used to check swap status before recovery.',
    )
    ..addOption(
      'liquid-api',
      help: 'Liquid Esplora API base URL used to broadcast prepared claims.',
    )
    ..addFlag(
      'broadcast-prepared',
      defaultsTo: false,
      help: 'Broadcast prepared claim_tx_hex values found in recovery records.',
    )
    ..addFlag('plan', defaultsTo: true);
  final parsed = parser.parse(args);
  final recoveryPrivkey = parsed['merchant-recovery-privkey'] as String?;
  final recoveryPubkey =
      parsed['merchant-recovery-pubkey'] as String? ??
      (recoveryPrivkey == null
          ? null
          : publicKeyFromPrivateKey(recoveryPrivkey));
  final events = <NostrPosEvent>[
    ...await LocalEventStore(parsed['store'] as String).readAll(),
  ];
  if (parsed['relays'] != null) {
    events.addAll(
      await fetchSwapRecoveryBackups(
        relays: _parseRelays(parsed['relays'] as String),
        recoveryPubkey: recoveryPubkey,
        recoveryPrivkey: recoveryPrivkey,
      ),
    );
  }
  final recoveries = swapRecoveriesFromEvents(events);
  if (parsed['broadcast-prepared'] == true) {
    final liquidApi = parsed['liquid-api'] as String?;
    if (liquidApi == null || liquidApi.isEmpty) {
      stderr.writeln('--liquid-api is required with --broadcast-prepared.');
      exitCode = 64;
      return;
    }
    final boltzApi = parsed['boltz-api'] as String?;
    final executor = ControllerRecoveryExecutor(
      swapStatusClient: boltzApi == null || boltzApi.isEmpty
          ? _StaticSwapStatusClient()
          : BoltzSwapStatusClient(apiBase: boltzApi),
      liquidClient: LiquidTransactionClient(apiBase: liquidApi),
      claimBuilder: (_) async => throw UnsupportedError(
        'Dart claim transaction construction is not wired yet.',
      ),
    );
    final results = await executor.recoverClaims(
      recoveries,
      terminalId: parsed['terminal-id'] as String?,
    );
    stdout.writeln(
      const JsonEncoder.withIndent(
        '  ',
      ).convert(results.map((result) => result.toJson()).toList()),
    );
    return;
  }
  final output = parsed['plan'] == true
      ? recoveryClaimPlan(recoveries)
      : recoveries.map((recovery) => recovery.toJson()).toList();
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(output));
}

class _StaticSwapStatusClient implements SwapStatusClient {
  @override
  Future<SwapStatusDetails> getSwapStatusDetails(String swapId) async =>
      SwapStatusDetails(status: 'created');
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
  final events =
      allEvents.where((event) => kind == null || event.kind == kind).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  final selected = events.take(limit).toList();
  final relays = _parseRelays(parsed['relays'] as String);
  final output = <Map<String, Object?>>[];
  for (final event in selected) {
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
    ..addOption(
      'network',
      defaultsTo: 'mainnet',
      allowed: ['mainnet', 'testnet'],
    )
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
    network: PosNetwork.fromName(parsed['network'] as String),
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
    ..addOption('base-url', defaultsTo: _defaultPosBaseUrl);
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
    ..addOption(
      'network',
      defaultsTo: 'mainnet',
      allowed: ['mainnet', 'testnet'],
    )
    ..addOption('terminal-name', defaultsTo: 'Counter 1')
    ..addOption(
      'descriptor',
      mandatory: true,
      help: 'Liquid CT descriptor for this terminal authorization.',
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
        tagName: 'd',
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
  final descriptor = (parsed['descriptor'] as String).trim();
  if (descriptor.isEmpty) {
    stderr.writeln('Liquid CT descriptor is required.');
    exitCode = 64;
    return;
  }
  await store.append(pairing);
  final terminalPubkey = pairing.tags.firstWhere((tag) => tag[0] == 'p')[1];
  final terminalId =
      (parsed['terminal-id'] as String?) ?? randomAuxHex().substring(0, 32);
  final bucketSecret =
      (parsed['sale-bucket-secret'] as String?) ?? randomAuxHex();
  final authorization = TerminalAuthorization(
    posRef: posRef(
      merchantPubkey: merchantPubkey,
      posId: parsed['pos-id'] as String,
    ),
    terminalPubkey: terminalPubkey,
    terminalId: terminalId,
    terminalName: parsed['terminal-name'] as String,
    pairingCodeHint: parsed['pairing-code'] as String,
    ctDescriptor: descriptor,
    descriptorFingerprint: parsed['fingerprint'] as String,
    terminalBranch: int.parse(parsed['branch'] as String),
    merchantRecoveryPubkey: parsed['merchant-recovery-pubkey'] as String,
    saleBucketSecret: bucketSecret,
    saleBucketGeneration: int.parse(parsed['sale-bucket-generation'] as String),
    effectiveFromEpochDay: epochDayFromUnix(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
    ),
    network: PosNetwork.fromName(parsed['network'] as String),
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
          await nip44EncryptToPubkey(
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
    ..addOption('terminal-id', mandatory: true)
    ..addOption('pos-id', defaultsTo: 'seguras-butcher')
    ..addOption('merchant-pubkey', defaultsTo: 'a' * 64)
    ..addOption('merchant-privkey')
    ..addOption('store', defaultsTo: '.nostr-pos/events.jsonl');
  final parsed = parser.parse(args);
  final merchantPrivkey = parsed['merchant-privkey'] as String?;
  final merchantPubkey = merchantPrivkey == null
      ? parsed['merchant-pubkey'] as String
      : publicKeyFromPrivateKey(merchantPrivkey);
  if (merchantPrivkey == null) {
    stderr.writeln('merchant-privkey is required to encrypt v0.3 revocations.');
    exitCode = 64;
    return;
  }
  final event = await buildTerminalRevocationEvent(
    merchantPubkey: merchantPubkey,
    merchantPrivkey: merchantPrivkey,
    posId: parsed['pos-id'] as String,
    terminalPubkey: parsed['terminal-pubkey'] as String,
    terminalId: parsed['terminal-id'] as String,
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
    ..addOption('txid', defaultsTo: 'demo-txid')
    ..addOption('sale-bucket-secret', defaultsTo: '0'.padLeft(64, '0'))
    ..addOption('sale-bucket-generation', defaultsTo: '1');
  final parsed = parser.parse(args);
  final terminalPrivkey = parsed['terminal-privkey'] as String?;
  final terminalPubkey = terminalPrivkey == null
      ? parsed['terminal-pubkey'] as String
      : publicKeyFromPrivateKey(terminalPrivkey);
  final store = LocalEventStore(parsed['store'] as String);
  final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
  final bucket = dailyBucketTag(
    secret: hexToBytes(parsed['sale-bucket-secret'] as String),
    generation: int.parse(parsed['sale-bucket-generation'] as String),
    epochDayUtc: epochDayFromUnix(now),
  );
  final saleId = parsed['sale-id'] as String;
  final sale = buildSaleStreamEvent(
    terminalPubkey: terminalPubkey,
    kind: NostrPosKinds.saleCreated,
    bucket: bucket,
    contentCreatedAt: now,
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
  final status = buildSaleStreamEvent(
    terminalPubkey: terminalPubkey,
    kind: NostrPosKinds.paymentStatus,
    bucket: bucket,
    contentCreatedAt: now,
    content: {
      'sale_id': saleId,
      'status': parsed['status'],
      'method': parsed['method'],
      'updated_at': now,
      'payment': {'settlement_txid': parsed['txid']},
    },
  );
  final receipt = buildSaleStreamEvent(
    terminalPubkey: terminalPubkey,
    kind: NostrPosKinds.receipt,
    bucket: bucket,
    contentCreatedAt: now,
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
