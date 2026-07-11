import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';

import 'data/favorites.dart';
import 'data/prefs.dart';
import 'data/xtream_client.dart';
import 'theme.dart';
import 'ui/home_page.dart';
import 'ui/login_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Boots libmpv for native playback across Windows/macOS/Linux.
  MediaKit.ensureInitialized();

  final prefs = await Prefs.load();
  final favorites = await Favorites.load();

  runApp(IptvyApp(prefs: prefs, favorites: favorites));
}

/// Ambient access to the on-device services. The [XtreamClient] is rebuilt on
/// each login/logout (credentials change), so it lives in mutable app state and
/// is republished here; [reauth] triggers that rebuild.
class AppScope extends InheritedWidget {
  final Prefs prefs;
  final Favorites favorites;
  final XtreamClient client;
  final VoidCallback reauth;

  const AppScope({
    super.key,
    required this.prefs,
    required this.favorites,
    required this.client,
    required this.reauth,
    required super.child,
  });

  static AppScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope not found in the widget tree');
    return scope!;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) => client != oldWidget.client;
}

class IptvyApp extends StatefulWidget {
  final Prefs prefs;
  final Favorites favorites;
  const IptvyApp({super.key, required this.prefs, required this.favorites});

  @override
  State<IptvyApp> createState() => _IptvyAppState();
}

class _IptvyAppState extends State<IptvyApp> {
  late XtreamClient _client;

  @override
  void initState() {
    super.initState();
    _client = XtreamClient(widget.prefs);
  }

  /// Swap in a fresh client bound to the current credentials (after login or
  /// logout, when username/password/server may have changed).
  void _reauth() {
    setState(() {
      _client.dispose();
      _client = XtreamClient(widget.prefs);
    });
  }

  @override
  void dispose() {
    _client.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      prefs: widget.prefs,
      favorites: widget.favorites,
      client: _client,
      reauth: _reauth,
      child: MaterialApp(
        title: 'IPTVy',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: widget.prefs.isLoggedIn ? const HomePage() : const LoginPage(),
      ),
    );
  }
}
