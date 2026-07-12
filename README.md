# IPTVy

A fast, lightweight **Xtream Codes** IPTV player that runs almost everywhere:
**Android phones/tablets**, **Google TV / Android TV**, the **web browser**,
**Windows / macOS / Linux desktop**, and **LG webOS TVs** — one login, the same
Live TV / Movies / Series flow on every screen. Built to stay light enough for
cheap Google TV sticks while still decoding everything a desktop can.

## Get IPTVy

| Platform | How to get it | Built from |
| --- | --- | --- |
| **Web browser** | Open **[iptvy.space/app](https://iptvy.space/app/)** — nothing to install | `web/app` |
| **Android / Google TV / Fire TV** | **[iptvy.space/iptvy.apk](https://iptvy.space/iptvy.apk)** (sideload APK) | `app/` (Kotlin) |
| **Windows** | **[iptvy.space/iptvy-windows.zip](https://iptvy.space/iptvy-windows.zip)** — unzip, run `iptvy.exe` | `desktop/` (Flutter) |
| **macOS** | **[iptvy.space/iptvy-macos.zip](https://iptvy.space/iptvy-macos.zip)** — unzip `iptvy.app`* | `desktop/` (Flutter) |
| **Linux** | **[iptvy.space/iptvy-linux.tar.gz](https://iptvy.space/iptvy-linux.tar.gz)** — extract, run `./iptvy`† | `desktop/` (Flutter) |
| **LG webOS TV** | Sideload the `.ipk` (see [`web/app/README.md`](web/app/README.md)) | `web/app` |

Every binary above lives on the **[GitHub Releases](../../releases)** page — the
download links just redirect to `releases/latest/download/…`, so they always
point at the newest build.

<sub>*macOS: the app is unsigned, so on first launch right-click → Open (or
`xattr -dr com.apple.quarantine iptvy.app`). †Linux: needs a recent `libmpv`
(`sudo apt install libmpv2` or `mpv`).</sub>

## Features
- Xtream Codes login (server URL + username + password)
- **Live TV**, **Movies (VOD)**, and **Series → episodes** browsing
- Categories with lazy, per-category loading (handles huge playlists without eating RAM)
- Favorites and lenient/fuzzy title search
- Hardware-accelerated playback:
  - **Android** — Media3 / ExoPlayer (HLS + MPEG-TS)
  - **Desktop** — libmpv via [media_kit](https://pub.dev/packages/media_kit), so live MPEG-TS, HEVC, AC3 and MKV all decode natively (no CORS, no proxy — desktop makes plain native HTTP calls)
  - **Web / webOS** — the browser/TV media pipeline (`<video>` + a small proxy for live TV in the browser)
- **Cast to TVs (Google Cast / Chromecast)** — *Android only*; see below
- D-pad / remote friendly UI (Android TV, webOS) that also works with touch and mouse/keyboard
- Small footprint: ~8 MB Android APK, minSdk 21 (Android 5.0+), conservative player buffers

Feature parity is close across platforms; the main differences are **casting**
(Android only) and **live-TV handling in the browser** (relayed through a proxy —
see below).

## Casting to a TV (Android)
On a phone or tablet with Google Play services, a Cast button appears in the top-right of the
player whenever a Chromecast/Google TV is on the same network. Tap it to pick a device: the video
transfers to the TV (resuming at the current position) and the phone shows a "Casting to TV" status.
Disconnecting the Cast session brings playback back to the device. Casting uses Google's Default
Media Receiver, which handles the common streaming formats (VOD MP4, HLS).

**Live TV casting.** Live channels are trickier: the receiver can't decode raw MPEG-TS (`.ts`), and
it *also* refuses HLS whose playlist/segments lack CORS headers — which Xtream servers don't send.
So single-file movies cast fine but live channels wouldn't play. To fix this, live is cast as HLS
through a **tiny HTTP proxy that runs inside the app on the phone**: it fetches the channel's
`.m3u8` from Xtream and re-serves it to the TV with the required CORS headers, rewriting the
playlist so segments route back through the proxy too. Local playback keeps using the direct `.ts`
stream. This means:
- The phone must stay on the same Wi-Fi/LAN as the TV while casting live (it relays the stream).
- The panel must expose HLS for live (`…/live/<id>.m3u8`), which most Xtream panels do.
- Leaving the player screen entirely stops a live cast (the proxy shuts down); backgrounding the
  app briefly is fine.

On devices without Google Play services (e.g. bare TV sticks) the Cast button is hidden and
playback stays local — nothing else changes. Casting is not implemented on desktop, web, or webOS.

### Sideloading the APK on a Google TV / Android TV stick
1. On the device: Settings → System → About → tap *Android version*/*Build* a few times to enable Developer options, then enable **Apps from unknown sources** for your sideload tool (e.g. *Downloader* or *Send Files to TV*).
2. In the **Downloader** app enter `iptvy.space/iptvy.apk` (or transfer the APK via USB / "Send Files to TV") and open it to install.
3. Or via ADB from a computer:
   ```bash
   adb connect <tv-ip>:5555
   adb install -r IPTVy-<version>-release.apk   # download from the Releases page
   ```
The app appears in the Google TV app drawer (it registers a leanback launcher) and on phones in the normal launcher.

## Building from source
Each target builds from its own subproject:

| Target | Toolchain | Command |
| --- | --- | --- |
| Android | JDK 17 + Android SDK (compileSdk 34, build-tools 34.0.0) | `./build.sh` (signed → `dist/`) or `./gradlew assembleRelease` |
| Desktop (Windows/macOS/Linux) | Flutter 3.44+ (see [`desktop/README.md`](desktop/README.md)) | `cd desktop && flutter build <windows\|macos\|linux> --release` |
| Web | none — static files | serve `web/app/` (or `node web/dev-server.mjs` for the live-TV proxy) |
| webOS | `@webos-tools/cli` | `./webos-build.sh` |

Each desktop platform must be built **on that OS** (a Windows `.exe` needs a Windows host, etc.).

## Releasing & deployment
To cut a release, bump `versionCode`/`versionName` in `app/build.gradle.kts` (the single source of
truth) and push to `main`. Two automations pick it up:

1. **GitHub Actions** (`.github/workflows/release.yml`) builds the signed Android APK on every push
   as a check, and — when `v<versionName>` is a **new** tag — publishes a **GitHub Release** with the
   APK **and** the native Flutter desktop builds for Windows, macOS and Linux attached. Each asset
   ships under both a versioned name (`IPTVy-<ver>-<os>.<ext>`) and a stable name (`iptvy-<os>.<ext>`)
   that the download page links to.
2. **Vercel** redeploys the `web/` download page (which serves every binary from the latest release
   via `releases/latest/download/…` redirects — nothing is committed to git).

No secrets required. See [DEPLOYMENT.md](DEPLOYMENT.md) for details.

## Architecture
The same layers (login → tabs/categories → grid → player, with a shared Xtream `player_api.php`
client and stream-URL builders) are ported to each stack:
- **Android** — Kotlin, classic Views + RecyclerView (lighter than Compose on cheap hardware); `app/`
- **Desktop** — Flutter/Dart + media_kit (libmpv); `desktop/`
- **Web / webOS** — vanilla JS, one shared codebase with a `js/platform.js` split; `web/app/`

Stream URLs everywhere: `live/…/<id>.ts`, `movie/…/<id>.<ext>`, `series/…/<id>.<ext>`.

## Roadmap
- EPG / now-next for Live TV
- Resume playback across sessions
- Casting on more than just Android
- iOS port

## Security note
The release keystore (`iptvy-release.jks`) and its passwords are committed for convenience. Before publishing publicly, regenerate the keystore and move credentials out of `app/build.gradle.kts`.
