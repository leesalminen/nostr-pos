import 'dart:math';

import 'bucket_tag.dart';

class BucketGeneration {
  BucketGeneration({
    required this.secretHex,
    required this.generation,
    required this.effectiveFromEpochDay,
  });

  final String secretHex;
  final int generation;
  final int effectiveFromEpochDay;

  bool isEffectiveForDay(int epochDayUtc) {
    return epochDayUtc >= effectiveFromEpochDay;
  }
}

BucketGeneration nextBucketGeneration({
  required BucketGeneration current,
  required int currentEpochDayUtc,
  int graceDays = 1,
  Random? random,
}) {
  return BucketGeneration(
    secretHex: randomSecretHex(random: random),
    generation: current.generation + 1,
    effectiveFromEpochDay: currentEpochDayUtc + graceDays,
  );
}

BucketGeneration generationForDay({
  required int epochDayUtc,
  required BucketGeneration current,
  BucketGeneration? previous,
}) {
  if (current.isEffectiveForDay(epochDayUtc)) return current;
  if (previous != null) return previous;
  return current;
}

String randomSecretHex({Random? random}) {
  final rng = random ?? Random.secure();
  return bytesToHex(List<int>.generate(32, (_) => rng.nextInt(256)));
}
