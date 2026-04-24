import 'dart:convert';
import 'dart:io';

import '../protocol/event.dart';

class LocalEventStore {
  LocalEventStore(this.path);

  final String path;

  Future<void> append(NostrPosEvent event) async {
    final file = File(path);
    await file.parent.create(recursive: true);
    await file.writeAsString(
      '${jsonEncode(event.toJson())}\n',
      mode: FileMode.append,
    );
  }

  Future<List<NostrPosEvent>> readAll() async {
    final file = File(path);
    if (!await file.exists()) return [];
    final lines = await file.readAsLines();
    return lines.where((line) => line.trim().isNotEmpty).map((line) {
      return NostrPosEvent.fromJson(jsonDecode(line) as Map<String, Object?>);
    }).toList();
  }

  Future<List<NostrPosEvent>> byKind(int kind) async {
    return (await readAll()).where((event) => event.kind == kind).toList();
  }

  Future<NostrPosEvent?> latestByTag({
    required int kind,
    required String tagName,
    required String tagValue,
  }) async {
    final matches = (await readAll()).where((event) {
      return event.kind == kind &&
          event.tags.any(
            (tag) => tag.length > 1 && tag[0] == tagName && tag[1] == tagValue,
          );
    }).toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return matches.isEmpty ? null : matches.first;
  }
}
