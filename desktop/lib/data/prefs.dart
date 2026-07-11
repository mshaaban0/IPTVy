import 'package:shared_preferences/shared_preferences.dart';

/// Local credential storage, ported from the web app's `store.js` Prefs. Nothing
/// leaves the machine — the panel URL/username/password live only in this OS's
/// user preferences (SharedPreferences → registry/plist/XDG under the hood).
class Prefs {
  static const _kServer = 'iptvy.server';
  static const _kUser = 'iptvy.username';
  static const _kPass = 'iptvy.password';

  final SharedPreferences _sp;
  Prefs(this._sp);

  static Future<Prefs> load() async => Prefs(await SharedPreferences.getInstance());

  String get server => _sp.getString(_kServer) ?? '';
  String get username => _sp.getString(_kUser) ?? '';
  String get password => _sp.getString(_kPass) ?? '';
  bool get isLoggedIn => server.isNotEmpty && username.isNotEmpty;

  Future<void> save(String server, String username, String password) async {
    await _sp.setString(_kServer, normalize(server));
    await _sp.setString(_kUser, username.trim());
    await _sp.setString(_kPass, password.trim());
  }

  Future<void> clear() async {
    await _sp.remove(_kServer);
    await _sp.remove(_kUser);
    await _sp.remove(_kPass);
  }

  /// Adds a scheme if missing and strips trailing slashes, matching store.js.
  static String normalize(String raw) {
    var s = raw.trim();
    if (s.isEmpty) return s;
    if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(s)) {
      s = 'http://$s';
    }
    while (s.endsWith('/')) {
      s = s.substring(0, s.length - 1);
    }
    return s;
  }
}
