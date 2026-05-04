class AuthorizedTerminals {
  AuthorizedTerminals([Iterable<String> terminalPubkeys = const []])
    : _terminalPubkeys = {...terminalPubkeys};

  final Set<String> _terminalPubkeys;

  Set<String> get terminalPubkeys => Set.unmodifiable(_terminalPubkeys);

  void authorize(String terminalPubkey) {
    _terminalPubkeys.add(terminalPubkey);
  }

  void revoke(String terminalPubkey) {
    _terminalPubkeys.remove(terminalPubkey);
  }

  bool contains(String terminalPubkey) =>
      _terminalPubkeys.contains(terminalPubkey);
}
