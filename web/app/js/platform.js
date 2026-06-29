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

  var activeMpegts = null;
  function destroyPlayer() {
    if (activeMpegts) {
      try { activeMpegts.destroy(); } catch (e) {}
      activeMpegts = null;
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
    // Browser live TV (raw MPEG-TS): decode with mpegts.js. Go direct if the
    // panel allows it; only relay through the proxy when CORS forces us to.
    var liveSrc = (httpMode === 'proxy' && PROXY_LIVE) ? proxied(url) : url;
    try {
      await ensureMpegts();
    } catch (e) { /* fall through to a direct attempt below */ }
    if (window.mpegts && window.mpegts.isSupported()) {
      activeMpegts = window.mpegts.createPlayer(
        { type: 'mpegts', isLive: true, url: liveSrc },
        { liveBufferLatencyChasing: true }
      );
      activeMpegts.attachMediaElement(video);
      activeMpegts.load();
      activeMpegts.play();
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
