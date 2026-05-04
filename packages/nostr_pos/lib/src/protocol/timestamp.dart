import 'dart:math';

int jitteredCreatedAt({
  int? baseCreatedAt,
  int spreadSeconds = 300,
  Random? random,
}) {
  if (spreadSeconds < 0) throw ArgumentError.value(spreadSeconds);
  final base = baseCreatedAt ?? DateTime.now().millisecondsSinceEpoch ~/ 1000;
  final rng = random ?? Random.secure();
  final offset = spreadSeconds == 0
      ? 0
      : rng.nextInt(spreadSeconds * 2 + 1) - spreadSeconds;
  return max(0, base + offset);
}
