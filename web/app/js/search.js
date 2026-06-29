/*
 * Lenient title search, ported from the Android app's Search.kt. Matches on a
 * normalized form (lowercased, punctuation -> spaces) plus a compact form
 * (spaces removed) so "spider man", "spider-man" and "spiderman" find each
 * other, with a fuzzy fallback for small typos. Results are scored, ranked and
 * capped so we never sort or render a near-full catalog.
 */
(function (IPTVy) {
  var MAX_RESULTS = 300;
  var MIN_QUERY = 2;

  function normalize(s) {
    var out = '';
    var prevSpace = false;
    s = (s || '').toLowerCase();
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (/[a-z0-9]/.test(c)) { out += c; prevSpace = false; }
      else if (!prevSpace && out.length) { out += ' '; prevSpace = true; }
    }
    return out.trim();
  }

  function levenshtein(a, b, max) {
    var n = a.length, m = b.length;
    if (n === 0) return m;
    if (m === 0) return n;
    var prev = new Array(m + 1), curr = new Array(m + 1);
    for (var j = 0; j <= m; j++) prev[j] = j;
    for (var i = 1; i <= n; i++) {
      curr[0] = i;
      var rowMin = curr[0];
      var ca = a[i - 1];
      for (var k = 1; k <= m; k++) {
        var cost = ca === b[k - 1] ? 0 : 1;
        curr[k] = Math.min(prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + cost);
        if (curr[k] < rowMin) rowMin = curr[k];
      }
      if (rowMin > max) return max + 1;
      var tmp = prev; prev = curr; curr = tmp;
    }
    return prev[m];
  }

  function closeEnough(a, b) {
    var max = a.length <= 4 ? 1 : 2;
    if (Math.abs(a.length - b.length) > max) return false;
    return levenshtein(a, b, max) <= max;
  }

  function score(nq, qTokens, qCompact, name) {
    var nn = normalize(name);
    if (!nn) return 0;
    var compact = nn.replace(/ /g, '');
    if (nn.indexOf(nq) === 0) return 1000;
    if (nn.indexOf(nq) >= 0) return 900;
    if (compact.indexOf(qCompact) >= 0) return 800;
    var allTokens = qTokens.every(function (t) { return nn.indexOf(t) >= 0 || compact.indexOf(t) >= 0; });
    if (allTokens) return 600;
    var nameTokens = nn.split(' ');
    var fuzzy = qTokens.every(function (t) {
      return compact.indexOf(t) >= 0 || nameTokens.some(function (w) { return closeEnough(t, w); });
    });
    if (fuzzy) return 300;
    return 0;
  }

  function search(query, items, limit) {
    limit = limit || MAX_RESULTS;
    var nq = normalize(query);
    if (nq.length < MIN_QUERY) return [];
    var qTokens = nq.split(' ');
    var qCompact = nq.replace(/ /g, '');
    var matched = [];
    for (var i = 0; i < items.length; i++) {
      var sc = score(nq, qTokens, qCompact, items[i].name);
      if (sc > 0) matched.push({ stream: items[i], score: sc });
    }
    matched.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.stream.name.length !== b.stream.name.length) return a.stream.name.length - b.stream.name.length;
      return a.stream.name < b.stream.name ? -1 : a.stream.name > b.stream.name ? 1 : 0;
    });
    if (matched.length > limit) matched = matched.slice(0, limit);
    return matched.map(function (m) { return m.stream; });
  }

  IPTVy.Search = { normalize: normalize, search: search, MIN_QUERY: MIN_QUERY, MAX_RESULTS: MAX_RESULTS };
})(window.IPTVy = window.IPTVy || {});
