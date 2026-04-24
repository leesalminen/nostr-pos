class NostrPosKinds {
  static const posProfile = 30380;
  static const terminalAuthorization = 30381;
  static const terminalRevocation = 30382;
  static const pairingAnnouncement = 30383;
  static const saleCreated = 9380;
  static const swapRecoveryBackup = 9381;
  static const paymentStatus = 9382;
  static const receipt = 9383;
}

const nostrPosProtocolTag = ['proto', 'nostr-pos', '0.2'];

List<List<String>> defaultRelayTags() => [
      ['relay', 'wss://no.str.cr'],
      ['relay', 'wss://relay.primal.net'],
      ['relay', 'wss://nos.lol'],
    ];
