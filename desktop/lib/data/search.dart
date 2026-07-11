import 'models.dart';

/// Lenient title search, ported verbatim in behavior from `search.js` /
/// `Search.kt`. Matches on a normalized form (lowercased, punctuation → spaces)
/// plus a compact form (spaces removed) so "spider man", "spider-man" and
/// "spiderman" find each other, with a fuzzy Levenshtein fallback for typos.
/// Results are scored, ranked and capped so we never sort a near-full catalog.
class Search {
  static const int maxResults = 300;
  static const int minQuery = 2;

  static String normalize(String s) {
    final buf = StringBuffer();
    var prevSpace = false;
    final lower = s.toLowerCase();
    for (var i = 0; i < lower.length; i++) {
      final c = lower[i];
      if (RegExp(r'[a-z0-9]').hasMatch(c)) {
        buf.write(c);
        prevSpace = false;
      } else if (!prevSpace && buf.isNotEmpty) {
        buf.write(' ');
        prevSpace = true;
      }
    }
    return buf.toString().trim();
  }

  static int _levenshtein(String a, String b, int max) {
    final n = a.length, m = b.length;
    if (n == 0) return m;
    if (m == 0) return n;
    var prev = List<int>.generate(m + 1, (j) => j);
    var curr = List<int>.filled(m + 1, 0);
    for (var i = 1; i <= n; i++) {
      curr[0] = i;
      var rowMin = curr[0];
      final ca = a[i - 1];
      for (var k = 1; k <= m; k++) {
        final cost = ca == b[k - 1] ? 0 : 1;
        curr[k] = [prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + cost]
            .reduce((x, y) => x < y ? x : y);
        if (curr[k] < rowMin) rowMin = curr[k];
      }
      if (rowMin > max) return max + 1;
      final tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[m];
  }

  static bool _closeEnough(String a, String b) {
    final max = a.length <= 4 ? 1 : 2;
    if ((a.length - b.length).abs() > max) return false;
    return _levenshtein(a, b, max) <= max;
  }

  static int _score(String nq, List<String> qTokens, String qCompact, String name) {
    final nn = normalize(name);
    if (nn.isEmpty) return 0;
    final compact = nn.replaceAll(' ', '');
    if (nn.indexOf(nq) == 0) return 1000;
    if (nn.contains(nq)) return 900;
    if (compact.contains(qCompact)) return 800;
    final allTokens =
        qTokens.every((t) => nn.contains(t) || compact.contains(t));
    if (allTokens) return 600;
    final nameTokens = nn.split(' ');
    final fuzzy = qTokens.every((t) =>
        compact.contains(t) || nameTokens.any((w) => _closeEnough(t, w)));
    if (fuzzy) return 300;
    return 0;
  }

  static List<Stream> search(String query, List<Stream> items,
      {int limit = maxResults}) {
    final nq = normalize(query);
    if (nq.length < minQuery) return const [];
    final qTokens = nq.split(' ');
    final qCompact = nq.replaceAll(' ', '');
    final matched = <_Scored>[];
    for (final item in items) {
      final sc = _score(nq, qTokens, qCompact, item.name);
      if (sc > 0) matched.add(_Scored(item, sc));
    }
    matched.sort((a, b) {
      if (b.score != a.score) return b.score - a.score;
      if (a.stream.name.length != b.stream.name.length) {
        return a.stream.name.length - b.stream.name.length;
      }
      return a.stream.name.compareTo(b.stream.name);
    });
    final capped = matched.length > limit ? matched.sublist(0, limit) : matched;
    return capped.map((m) => m.stream).toList();
  }
}

class _Scored {
  final Stream stream;
  final int score;
  _Scored(this.stream, this.score);
}
