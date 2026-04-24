import 'dart:convert';
import 'dart:io';

import 'package:args/args.dart';
import 'package:nostr_pos/nostr_pos.dart';

void main(List<String> args) async {
  final parser = ArgParser()
    ..addCommand('create-pos')
    ..addCommand('pairing-code')
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
      _createPos(rest);
    case 'pairing-code':
      _pairingCode(rest);
    case 'quote':
      await _quote(rest);
    default:
      stdout.writeln(parser.usage);
      exitCode = 64;
  }
}

void _createPos(List<String> args) {
  final parser = ArgParser()
    ..addOption('name', defaultsTo: 'Counter 1')
    ..addOption('merchant', defaultsTo: 'Seguras Butcher')
    ..addOption('currency', defaultsTo: 'CRC');
  final parsed = parser.parse(args);
  final profile = PosProfile(
    name: parsed['name'] as String,
    merchantName: parsed['merchant'] as String,
    currency: parsed['currency'] as String,
    description: 'Retail counter',
  );
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(profile.toJson()));
}

void _pairingCode(List<String> args) {
  final parser = ArgParser()..addOption('terminal-pubkey', mandatory: true);
  final parsed = parser.parse(args);
  stdout.writeln(pairingCodeFromPubkey(parsed['terminal-pubkey'] as String));
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
