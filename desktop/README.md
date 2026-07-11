# IPTVy Desktop

A fast, native **desktop** IPTV player (Xtream Codes) for **Windows, macOS and
Linux**, built with **Flutter**. It mirrors the Android app's flow — login →
Live TV / Movies / Series → categories → player — with favorites and lenient
search, and shares the same "warm risograph" look as the web and Android builds.

Playback uses **libmpv** (via [media_kit](https://pub.dev/packages/media_kit)),
so live MPEG-TS, HEVC, AC3, MKV and HLS all decode with hardware acceleration —
none of the webview codec limits the browser build has to work around. And
because a desktop app makes plain native HTTP requests, there is **no CORS and
no proxy server**: every call goes straight to the panel.

## Status
Feature parity with the web app: login, Live/Movies/Series tabs, per-category
lazy loading, series→episodes, favorites (right-click a tile), debounced fuzzy
search, and a custom player (play/pause, seek for VOD, mute; keyboard: Space =
play/pause, ←/→ = seek 10s, Esc = back). Casting is not included on desktop.

## Requirements
- [Flutter](https://docs.flutter.dev/get-started/install) 3.44+ (Dart 3.12+)
- **Linux:** `clang cmake ninja-build pkg-config libgtk-3-dev libmpv-dev mpv`
- **Windows:** Visual Studio 2022 with "Desktop development with C++"
- **macOS:** Xcode + CocoaPods

media_kit bundles the mpv libraries into the Windows/macOS builds automatically;
on Linux the system `libmpv` is used (install `libmpv-dev`/`mpv`).

## Run (dev)
```bash
cd desktop
flutter pub get
flutter run -d windows   # or: -d macos, -d linux
```

## Build (release)
```bash
flutter build windows    # build/windows/x64/runner/Release/
flutter build macos      # build/macos/Build/Products/Release/iptvy.app
flutter build linux      # build/linux/x64/release/bundle/
```
Each desktop platform must be built **on that OS** (a Windows `.exe` needs a
Windows build host, etc.). See `../DEPLOYMENT.md` for the release/versioning
conventions shared with the mobile builds.

## Architecture
Ports the same layers as the Android/web apps, in Dart:
- `lib/data/` — `models.dart`, `prefs.dart`, `favorites.dart`, `search.dart`,
  and `xtream_client.dart` (the `player_api.php` client + stream-URL builders).
- `lib/ui/` — `login_page`, `home_page` (tabs + category rail + grid),
  `series_page`, `player_page` (media_kit), and `widgets/stream_tile.dart`.
- `lib/theme.dart` — the risograph palette/typography, translated from the web
  app's `style.css`.
- `lib/main.dart` — boots libmpv, loads on-device prefs/favorites, and exposes
  them via an `AppScope` inherited widget.
