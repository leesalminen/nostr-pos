import 'package:nostr_pos/nostr_pos.dart';
import 'package:test/test.dart';

void main() {
  test('encodes naddr links compatible with nostr-tools', () {
    expect(
      naddrEncode(
        identifier: 'seguras-butcher',
        pubkey: 'a' * 64,
        relays: ['wss://one'],
      ),
      'naddr1qvzqqqrk4spzp242424242424242424242424242424242424242424242424242qyyhwumn8ghj7mmwv5qq7um9va6hyctn94382arrdpjhy5ckald',
    );
  });

  test('decodes naddr link fields', () {
    final pointer = naddrDecode(
      'naddr1qvzqqqrk4spzpwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamqy8hwumn8ghj7mn09eehgu3wvdeqz9nhwden5te0wfjkccte9ec8y6tdv9kzumn9wsqs6amnwvaz7tmwdaejumr0dsqqwum9va6hyctn5ug68n',
    );

    expect(pointer.identifier, 'seguras');
    expect(pointer.pubkey, 'b' * 64);
    expect(pointer.kind, NostrPosKinds.posProfile);
    expect(pointer.relays, [
      'wss://no.str.cr',
      'wss://relay.primal.net',
      'wss://nos.lol',
    ]);
  });

  test('builds POS profile URLs for the PWA route', () {
    final url = posProfileUrl(
      baseUrl: 'https://nostr-pos.vercel.app/#/pos',
      identifier: 'seguras',
      pubkey: 'a' * 64,
      relays: ['wss://one'],
    );

    expect(url, startsWith('https://nostr-pos.vercel.app/#/pos/naddr1'));
    expect(naddrDecode(url.split('/').last).identifier, 'seguras');
    final parsed = PosProfileUrl.parse(url);
    expect(parsed.posId, 'seguras');
    expect(parsed.merchantPubkey, 'a' * 64);
    expect(parsed.relays, ['wss://one']);
    expect(parsed.baseUrl, 'https://nostr-pos.vercel.app/#/pos');
  });

  test('round-trips POS profile URLs without fragment routes', () {
    final url = posProfileUrl(
      baseUrl: 'https://cashier.example/pos',
      identifier: 'main-counter',
      pubkey: 'b' * 64,
      relays: ['wss://one', 'wss://two'],
    );

    final parsed = PosProfileUrl.parse(url);

    expect(parsed.posId, 'main-counter');
    expect(parsed.merchantPubkey, 'b' * 64);
    expect(parsed.relays, ['wss://one', 'wss://two']);
    expect(parsed.baseUrl, 'https://cashier.example/pos');
  });
}
