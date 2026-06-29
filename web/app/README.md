# IPTVy web + webOS app

One codebase, two targets. The UI, Xtream client, search, favorites and D-pad
navigation are shared; only `js/platform.js` differs between platforms.

```
web/app/
  index.html        app shell (login / home / series / player views)
  appinfo.json      webOS manifest (packaging metadata)
  icon.png          80x80  launcher icon (placeholder — replace with art)
  largeIcon.png     130x130 launcher icon (placeholder)
  css/style.css     10-foot dark theme + focus styles
  js/platform.js    THE platform split: HTTP, playback, keep-awake
  js/xtream.js      Xtream Codes client (port of XtreamClient.kt)
  js/store.js       Prefs + Favorites in localStorage (no server state)
  js/search.js      lenient title search (port of Search.kt)
  js/nav.js         spatial D-pad navigation (arrows / OK / Back)
  js/app.js         UI controller (login / browse / series / player)
web/api/proxy.js    stateless CORS proxy — browser build only
```

## Browser (public, hosted on Vercel)
The static files serve from `web/app/`; API calls and live MPEG-TS go through
`/api/proxy` (browsers can't call Xtream panels directly — no CORS). VOD/series
play directly from the panel via `<video>` (media playback isn't CORS-bound).

Each user's credentials and favorites live only in their own browser's
localStorage — nothing is stored server-side, so users never see each other's
playlists.

⚠️ Live TV in the browser relays the `.ts` stream through the serverless proxy:
that uses real bandwidth and is bounded by the function timeout. VOD/series do
not hit the proxy.

## webOS (LG TV)
No proxy, no mpegts.js — the TV calls panels directly and its media pipeline
decodes `.ts` natively.

```
npm i -g @webos-tools/cli        # provides ares-* tools
./webos-build.sh                 # -> dist/com.iptvy.app_1.0.0_all.ipk
./webos-build.sh install tv      # build + install + launch on device "tv"
```
One-time: enable Developer Mode on the TV, then `ares-setup-device` to register
it. Publishing to the LG Content Store is a separate Seller Lounge submission.

## Known TODOs
- Remote-based favorite toggle (currently long-press / right-click only).
- Replace placeholder launcher icons with real artwork.
- Verify cross-origin API access on the target webOS version (packaged apps
  generally allow it; confirm on a real TV).
