/*
 * Client-side persistence. Everything lives in this browser/TV's localStorage —
 * credentials, favorites — and nothing is ever sent to or stored on our server.
 * That's what keeps a public deployment isolated: there is no shared state.
 */
(function (IPTVy) {
  var KEY_PREFS = 'iptvy.prefs';
  var KEY_FAV = 'iptvy.favorites';

  function normalize(raw) {
    var s = (raw || '').trim();
    if (!s) return s;
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    while (s.charAt(s.length - 1) === '/') s = s.slice(0, -1);
    return s;
  }

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(KEY_PREFS)) || {}; }
    catch (e) { return {}; }
  }

  var Prefs = {
    get server() { return loadPrefs().server || ''; },
    get username() { return loadPrefs().username || ''; },
    get password() { return loadPrefs().password || ''; },
    get isLoggedIn() { var d = loadPrefs(); return !!(d.server && d.username); },
    save: function (server, username, password) {
      localStorage.setItem(KEY_PREFS, JSON.stringify({
        server: normalize(server),
        username: (username || '').trim(),
        password: (password || '').trim()
      }));
    },
    clear: function () { localStorage.removeItem(KEY_PREFS); },
    normalize: normalize
  };

  function loadFav() {
    try { return JSON.parse(localStorage.getItem(KEY_FAV)) || []; }
    catch (e) { return []; }
  }
  function persistFav(items) { localStorage.setItem(KEY_FAV, JSON.stringify(items)); }

  var favItems = loadFav();
  var Favorites = {
    isFavorite: function (s) {
      return favItems.some(function (it) { return it.type === s.type && it.id === s.id; });
    },
    // Toggles favorite state; returns true if the stream is now a favorite.
    toggle: function (s) {
      var i = -1;
      favItems.some(function (it, idx) {
        if (it.type === s.type && it.id === s.id) { i = idx; return true; }
        return false;
      });
      if (i >= 0) { favItems.splice(i, 1); persistFav(favItems); return false; }
      favItems.unshift({ id: s.id, name: s.name, icon: s.icon || null, type: s.type, containerExt: s.containerExt || null });
      persistFav(favItems);
      return true;
    },
    all: function (type) { return favItems.filter(function (it) { return it.type === type; }); }
  };

  IPTVy.Prefs = Prefs;
  IPTVy.Favorites = Favorites;
})(window.IPTVy = window.IPTVy || {});
