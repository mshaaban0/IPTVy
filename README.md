# IPTVy

A fast, lightweight IPTV app for **Google TV / Android TV** and **Android phones/tablets**, with **Xtream Codes** support. Built to run on low-resource Google TV sticks.

## Features (v1)
- Xtream Codes login (server URL + username + password)
- **Live TV**, **Movies (VOD)**, and **Series** browsing
- Categories with lazy, per-category loading (handles huge playlists without eating RAM)
- Series → episodes browser
- Hardware-accelerated playback via Media3 / ExoPlayer (HLS + MPEG-TS)
- D-pad / remote friendly UI + works with touch
- Small footprint: ~6 MB APK, minSdk 21 (Android 5.0+), conservative player buffers

## Installable APKs
- `dist/IPTVy-1.0-release.apk` — signed release (recommended for sideloading)
- `dist/IPTVy-1.0-debug.apk` — debug build

### Install on a Google TV / Android TV stick
1. On the device: Settings → System → About → tap *Android version*/*Build* a few times to enable Developer options, then enable **Apps from unknown sources** for your sideload tool (e.g. *Downloader* or *Send Files to TV*).
2. Transfer `IPTVy-1.0-release.apk` to the device (USB, "Send Files to TV", or a URL via the Downloader app) and open it to install.
3. Or via ADB from a computer:
   ```bash
   adb connect <tv-ip>:5555
   adb install -r dist/IPTVy-1.0-release.apk
   ```
The app appears in the Google TV app drawer (it registers a leanback launcher) and on phones in the normal launcher.

## Download
Latest signed APK: **https://iptvy.space/iptvy.apk** (or the [GitHub Releases](../../releases) page).

## Building from source
Requires JDK 17 + Android SDK (compileSdk 34, build-tools 34.0.0).
```bash
./build.sh            # builds signed release into dist/
# or directly:
./gradlew assembleRelease
./gradlew assembleDebug
```

## Releasing & deployment
To cut a release, bump `versionCode`/`versionName` in `app/build.gradle.kts` and push to
`main`. Two automations pick it up: GitHub Actions builds + signs the APK and publishes a
GitHub Release (tag `v<versionName>`), and Vercel's Git integration redeploys the `web/`
download page (which serves the APK from the latest release). No secrets required. See
[DEPLOYMENT.md](DEPLOYMENT.md) for details.

## Architecture
- Kotlin, classic Views + RecyclerView (lighter than Compose on cheap hardware)
- `data/XtreamClient.kt` — OkHttp + `org.json` (no reflection); Xtream `player_api.php`
- `ui/` — `LoginActivity`, `HomeActivity` (tabs + categories + grid), `SeriesDetailActivity`, `PlayerActivity`
- Stream URLs: `live/…/<id>.ts`, `movie/…/<id>.<ext>`, `series/…/<id>.<ext>`

## Roadmap
- EPG / now-next for Live TV
- Favorites + resume playback
- Search
- iOS and LG webOS ports (separate codebases)

## Security note
The release keystore (`iptvy-release.jks`) and its passwords are committed for convenience. Before publishing publicly, regenerate the keystore and move credentials out of `app/build.gradle.kts`.
