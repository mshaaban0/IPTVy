/*
 * Platform shim — the ONLY place browser and webOS behaviour diverge.
 *
 * Talking to an Xtream panel from a browser is blocked by CORS unless the panel
 * sends Access-Control-Allow-Origin (most don't). webOS packaged apps aren't
 * subject to CORS, so they always go direct. For the browser we go DIRECT FIRST
 * and only fall back to /api/proxy if the browser blocks the direct call — so a
 * CORS-friendly panel uses no server at all, and VOD/series video always plays
 * straight from the panel via <video> (media playback isn't CORS-restricted).
 *
 * The only thing that can ever transit the proxy is the small API JSON and, on
 * non-CORS panels, the live MPEG-TS stream. Set PROXY_LIVE=false to refuse to
 * relay live video through the server entirely (live then needs a CORS panel).
 */
(function (IPTVy) {
  var PROXY_LIVE = true;

  var isWebOS = (typeof window.webOS !== 'undefined') ||
                (typeof window.webOSSystem !== 'undefined') ||
                (typeof window.PalmSystem !== 'undefined') ||
                / Web0S|webOS/i.test(navigator.userAgent);

  // null until the first API call decides; then 'direct' or 'proxy' for the
  // rest of the session so we never double-request.
  var httpMode = isWebOS ? 'direct' : null;

  function proxied(url) {
    // Absolute so it resolves to the serverless function regardless of the base
    // path the app is served from (production serves the app under /app/).
    return '/api/proxy?url=' + encodeURIComponent(url);
  }

  async function fetchJson(target) {
    var resp = await fetch(target, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  }

  async function apiGetJson(url) {
    if (httpMode === 'direct') return fetchJson(url);
    if (httpMode === 'proxy') return fetchJson(proxied(url));
    // First call: probe the panel directly. Success (it sends CORS) => stay
    // fully serverless. Failure (CORS-blocked / unreachable) => use the proxy.
    try {
      var r = await fetchJson(url);
      httpMode = 'direct';
      return r;
    } catch (e) {
      httpMode = 'proxy';
      return fetchJson(proxied(url));
    }
  }

  var mpegtsLoading = null;
  function ensureMpegts() {
    if (window.mpegts) return Promise.resolve();
    if (mpegtsLoading) return mpegtsLoading;
    mpegtsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return mpegtsLoading;
  }

  var hlsLoading = null;
  function ensureHls() {
    if (window.Hls) return Promise.resolve();
    if (hlsLoading) return hlsLoading;
    hlsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return hlsLoading;
  }

  var activeMpegts = null, activeHls = null;
  function destroyPlayer() {
    if (activeMpegts) {
      try { activeMpegts.destroy(); } catch (e) {}
      activeMpegts = null;
    }
    if (activeHls) {
      try { activeHls.destroy(); } catch (e) {}
      activeHls = null;
    }
  }

  async function playStream(video, url, isLive) {
    destroyPlayer();
    if (isWebOS) {
      // webOS media pipeline plays both MPEG-TS (live) and MP4 (vod) natively.
      video.src = url;
      video.play().catch(function () {});
      return;
    }
    if (!isLive) {
      // VOD / series episode: direct MP4 playback, no proxy ever.
      video.src = url;
      video.play().catch(function () {});
      return;
    }
    // Browser live TV. Xtream serves each channel two ways: a raw MPEG-TS stream
    // (…/<id>.ts) and HLS (…/<id>.m3u8). The .ts endpoint 302-redirects to a CDN
    // node that delivers a short burst then closes the socket; mpegts.js reports
    // that close as end-of-stream, so the <video> ends and every reconnect has to
    // rebuild the MediaSource — the visible stutter/stall. HLS is segmented and
    // plays continuously (hls.js keeps appending segments to one MediaSource), so
    // we use it whenever we can reach the panel directly. Only a CORS-blocked
    // panel (proxy mode) falls back to relaying raw MPEG-TS through /api/proxy —
    // proxying HLS would mean rewriting every segment URL through the proxy too.
    if (PROXY_LIVE) {
      // Play the channel as HLS through /api/proxy. Xtream serves each channel as
      // HLS (…/<id>.m3u8) as well as raw MPEG-TS (…/<id>.ts). Raw TS closes the
      // socket every few seconds, forcing a MediaSource rebuild (stutter/stall);
      // HLS is segmented and plays continuously. We route it through the proxy so
      // it can resolve the panel's rotating redirect/token and rewrite the (root-
      // relative, single-node) segment URLs — playing the CDN playlist directly
      // fails on token refresh (406) and cross-host segment paths (403).
      var hlsSrc = proxied(url.replace(/\.ts(\?|$)/, '.m3u8$1'));
      // Safari (and iOS) plays HLS natively — no library needed.
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsSrc;
        video.play().catch(function () {});
        return;
      }
      try {
        await ensureHls();
      } catch (e) { /* fall through to the mpegts path below */ }
      if (window.Hls && window.Hls.isSupported()) {
        var hls = new window.Hls({ lowLatencyMode: false });
        activeHls = hls;
        hls.on(window.Hls.Events.ERROR, function (evt, data) {
          if (!data || !data.fatal) return;         // non-fatal: hls.js self-heals
          console.error('[IPTVy] hls fatal error', data.type, data.details);
          // Recover where we can rather than dropping to a paused <video>.
          if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else destroyPlayer();
        });
        hls.loadSource(hlsSrc);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
          video.play().catch(function () {});
        });
        return;
      }
      // No HLS support at all: let the raw-TS path below have a go.
    }

    // Fallback: raw MPEG-TS via mpegts.js (used when PROXY_LIVE is off, or the
    // browser lacks MSE-based HLS). Reconnect on close so a burst-closing node
    // keeps playing, accepting the reconnect hitch.
    var liveSrc = (httpMode === 'proxy' && PROXY_LIVE) ? proxied(url) : url;
    try {
      await ensureMpegts();
    } catch (e) { /* fall through to a direct attempt below */ }
    if (window.mpegts && window.mpegts.isSupported()) {
      var mediaConfig = { type: 'mpegts', isLive: true, url: liveSrc };
      var mpegtsConfig = {
        liveBufferLatencyChasing: false,
        enableStashBuffer: true,
        stashInitialSize: 384 * 1024,   // ~384 KB primed before playback
        autoCleanupSourceBuffer: true   // reclaim buffer over long live sessions
      };
      var p = window.mpegts.createPlayer(mediaConfig, mpegtsConfig);
      activeMpegts = p;

      p.on(window.mpegts.Events.ERROR, function (type, detail, info) {
        console.error('[IPTVy] mpegts error', type, detail, info);
      });
      // Reconnect throttle: if the node closes almost immediately and repeatedly,
      // back off instead of hammering it in a tight loop.
      var reconnects = 0, lastReconnect = 0;
      p.on(window.mpegts.Events.LOADING_COMPLETE, function () {
        if (activeMpegts !== p) return;            // player was stopped/replaced
        var now = Date.now();
        if (now - lastReconnect < 1000) { reconnects++; } else { reconnects = 0; }
        lastReconnect = now;
        if (reconnects > 20) {
          console.error('[IPTVy] live stream keeps closing immediately; giving up');
          return;
        }
        try { p.unload(); p.load(); p.play(); }
        catch (e) { console.error('[IPTVy] live reconnect failed', e); }
      });

      p.attachMediaElement(video);
      p.load();
      p.play();
    } else {
      video.src = liveSrc;
      video.play().catch(function () {});
    }
  }

  function stop(video) {
    destroyPlayer();
    if (video) { try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {} }
  }

  var wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on) {
        if (navigator.wakeLock && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
      } else if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { /* unsupported; webOS keeps the screen on during fullscreen video anyway */ }
  }

  IPTVy.platform = {
    isWebOS: isWebOS,
    apiGetJson: apiGetJson,
    playStream: playStream,
    stop: stop,
    keepAwake: keepAwake
  };
})(window.IPTVy = window.IPTVy || {});
