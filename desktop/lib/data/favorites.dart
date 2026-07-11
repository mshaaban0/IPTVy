import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

/// Favorites store, ported from `store.js`. Newest-first list persisted as JSON
/// in the OS user preferences. Identity is (type, id), matching the other apps.
class Favorites {
  static const _key = 'iptvy.favorites';
  final SharedPreferences _sp;
  final List<Stream> _items;

  Favorites._(this._sp, this._items);

  static Future<Favorites> load() async {
    final sp = await SharedPreferences.getInstance();
    return Favorites._(sp, _read(sp));
  }

  static List<Stream> _read(SharedPreferences sp) {
    try {
      final raw = sp.getString(_key);
      if (raw == null) return [];
      final list = jsonDecode(raw);
      if (list is! List) return [];
      return list
          .whereType<Map>()
          .map((e) => Stream.fromJson(e.cast<String, dynamic>()))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _persist() async {
    await _sp.setString(_key, jsonEncode(_items.map((s) => s.toJson()).toList()));
  }

  bool isFavorite(Stream s) =>
      _items.any((it) => it.type == s.type && it.id == s.id);

  /// Toggles favorite state; returns true if the stream is now a favorite.
  Future<bool> toggle(Stream s) async {
    final idx = _items.indexWhere((it) => it.type == s.type && it.id == s.id);
    if (idx >= 0) {
      _items.removeAt(idx);
      await _persist();
      return false;
    }
    _items.insert(0, s);
    await _persist();
    return true;
  }

  List<Stream> all(StreamType type) =>
      _items.where((it) => it.type == type).toList();
}
