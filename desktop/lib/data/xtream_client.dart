import 'dart:convert';
import 'package:http/http.dart' as http;

import 'models.dart';
import 'prefs.dart';

/// Xtream Codes client, ported from `XtreamClient.kt` / `xtream.js`. Same
/// `player_api.php` actions and the same /live, /movie, /series URL builders.
///
/// Unlike the browser build, a desktop app makes plain native HTTP requests, so
/// there is **no CORS and no proxy server** — every call goes straight to the
/// panel. That's the whole reason the web app needed a serverless `/api/proxy`
/// and this one doesn't.
class XtreamClient {
  final Prefs prefs;
  final http.Client _http;

  XtreamClient(this.prefs, {http.Client? httpClient})
      : _http = httpClient ?? http.Client();

  String _enc(String s) => Uri.encodeComponent(s);

  Uri _apiUrl(String action, [String extra = '']) => Uri.parse(
        '${prefs.server}/player_api.php?username=${_enc(prefs.username)}'
        '&password=${_enc(prefs.password)}&action=$action$extra',
      );

  Future<dynamic> _getJson(Uri url) async {
    final resp = await _http.get(url, headers: {
      'User-Agent': 'IPTVy/1.0',
      'Accept': 'application/json',
    });
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw Exception('HTTP ${resp.statusCode}');
    }
    return jsonDecode(utf8.decode(resp.bodyBytes));
  }

  /// Validates credentials. Returns true if the panel reports `auth == 1`.
  Future<bool> login() async {
    try {
      final url = Uri.parse(
        '${prefs.server}/player_api.php?username=${_enc(prefs.username)}'
        '&password=${_enc(prefs.password)}',
      );
      final obj = await _getJson(url);
      final userInfo = obj is Map ? obj['user_info'] : null;
      return userInfo is Map && _asInt(userInfo['auth']) == 1;
    } catch (_) {
      return false;
    }
  }

  Future<List<Category>> categories(StreamType type) async {
    final action = switch (type) {
      StreamType.live => 'get_live_categories',
      StreamType.vod => 'get_vod_categories',
      StreamType.series => 'get_series_categories',
    };
    final arr = await _getJson(_apiUrl(action));
    final out = <Category>[const Category('__all__', 'All')];
    if (arr is List) {
      for (final o in arr) {
        if (o is Map) {
          out.add(Category(
            (o['category_id'] ?? '').toString(),
            (o['category_name'] ?? '').toString(),
          ));
        }
      }
    }
    return out;
  }

  Future<List<Stream>> streams(StreamType type, String categoryId) async {
    final action = switch (type) {
      StreamType.live => 'get_live_streams',
      StreamType.vod => 'get_vod_streams',
      StreamType.series => 'get_series',
    };
    final filter =
        categoryId == '__all__' ? '' : '&category_id=${_enc(categoryId)}';
    final arr = await _getJson(_apiUrl(action, filter));
    if (arr is! List) return const [];
    return arr.whereType<Map>().map((o) => _mapStream(o, type)).toList();
  }

  Stream _mapStream(Map o, StreamType type) {
    switch (type) {
      case StreamType.series:
        return Stream(
          id: (o['series_id'] ?? '').toString(),
          name: (o['name'] ?? '').toString(),
          icon: _blankNull(o['cover']),
          type: type,
        );
      case StreamType.vod:
        return Stream(
          id: (o['stream_id'] ?? '').toString(),
          name: (o['name'] ?? '').toString(),
          icon: _blankNull(o['stream_icon']),
          type: type,
          containerExt: _blankNull(o['container_extension']) ?? 'mp4',
        );
      case StreamType.live:
        return Stream(
          id: (o['stream_id'] ?? '').toString(),
          name: (o['name'] ?? '').toString(),
          icon: _blankNull(o['stream_icon']),
          type: type,
        );
    }
  }

  /// Episodes flattened across seasons, in season then panel order.
  Future<List<Episode>> seriesEpisodes(String seriesId) async {
    final obj = await _getJson(_apiUrl('get_series_info', '&series_id=${_enc(seriesId)}'));
    final episodesObj = obj is Map ? obj['episodes'] : null;
    if (episodesObj is! Map) return const [];
    final seasonKeys = episodesObj.keys.map((e) => e.toString()).toList()
      ..sort((a, b) => (int.tryParse(a) ?? 0).compareTo(int.tryParse(b) ?? 0));
    final out = <Episode>[];
    for (final key in seasonKeys) {
      final seasonNum = int.tryParse(key) ?? 0;
      final eps = episodesObj[key];
      if (eps is! List) continue;
      for (var i = 0; i < eps.length; i++) {
        final e = eps[i];
        if (e is! Map) continue;
        final rawTitle = (e['title'] ?? '').toString().trim();
        final rawExt = (e['container_extension'] ?? '').toString().trim();
        out.add(Episode(
          id: (e['id'] ?? '').toString(),
          title: rawTitle.isNotEmpty ? rawTitle : 'Episode ${i + 1}',
          season: seasonNum,
          containerExt: rawExt.isNotEmpty ? rawExt : 'mp4',
        ));
      }
    }
    return out;
  }

  // ---- Stream URL builders ----

  String liveUrl(String streamId) =>
      '${prefs.server}/live/${_enc(prefs.username)}/${_enc(prefs.password)}/$streamId.ts';

  String vodUrl(String streamId, String? ext) =>
      '${prefs.server}/movie/${_enc(prefs.username)}/${_enc(prefs.password)}/$streamId.${ext ?? 'mp4'}';

  String seriesUrl(String episodeId, String? ext) =>
      '${prefs.server}/series/${_enc(prefs.username)}/${_enc(prefs.password)}/$episodeId.${ext ?? 'mp4'}';

  void dispose() => _http.close();

  static int _asInt(dynamic v) =>
      v is int ? v : (v is String ? int.tryParse(v) ?? 0 : 0);

  static String? _blankNull(dynamic v) {
    if (v == null) return null;
    final s = v.toString();
    return s.trim().isEmpty ? null : s;
  }
}
