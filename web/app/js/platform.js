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

  // A direct call from an HTTPS page to an http:// panel is always blocked by the
  // browser as mixed content, so there's no point probing it — go straight to the
  // proxy. (Production serves over HTTPS while most panels are plain http.)
  function isMixedContent(url) {
    return window.location.protocol === 'https:' && /^http:\/\//i.test(url);
  }

  async function fetchJson(target) {
    var resp = await fetch(target, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  }

  async function apiGetJson(url) {
    // Skip the doomed direct probe when it would only trip a mixed-content block
    // (HTTPS page → http panel); the proxy (same-origin HTTPS) always works.
    if (httpMode === null && isMixedContent(url)) httpMode = 'proxy';
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

  // Resolves a live channel's panel .m3u8 (which the panel 302-redirects to a
  // load-balanced CDN node) to the concrete node URL, and returns the proxied URL
  // to poll. hls.js reloads the URL it was handed verbatim, so handing it the
  // panel URL would land every refresh on a different node and make the sequence
  // oscillate (replay, then stall). We pin one node client-side instead — resolve
  // once here, poll that node directly, and re-resolve only when it dies. Falls
  // back to the proxied panel URL if the resolve endpoint is unavailable.
  async function resolveLiveNode(panelM3u8) {
    try {
      var r = await fetch(proxied(panelM3u8) + '&resolve=1', { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        var j = await r.json();
        if (j && j.url) return proxied(j.url);
      }
    } catch (e) { /* fall back to the panel URL below */ }
    return proxied(panelM3u8);
  }

  // Bumped on every playStream so a call that's still awaiting (script load, node
  // resolve) can bail out if the user has since started another stream.
  var playGen = 0;

  var activeMpegts = null, activeHls = null, activeVideoCleanup = null;
  function destroyPlayer() {
    if (activeVideoCleanup) {
      try { activeVideoCleanup(); } catch (e) {}
      activeVideoCleanup = null;
    }
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
    var gen = ++playGen;
    function stale() { return gen !== playGen; }
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
      //
      // Pin to one CDN node client-side (see resolveLiveNode): resolve the panel's
      // load-balancer redirect once and poll that node URL directly, so the live
      // sequence stays monotonic across refreshes. Handing hls.js the panel URL
      // instead makes every refresh land on a different node — the stream plays
      // for a few seconds, then oscillates and stalls.
      var panelM3u8 = url.replace(/\.ts(\?|$)/, '.m3u8$1');
      var hlsSrc = await resolveLiveNode(panelM3u8);
      if (stale()) return;

      // Safari (and iOS) plays HLS natively — no library needed. Re-pin on error:
      // when the node's token dies the <video> errors, so resolve a fresh node and
      // swap the source (throttled so a truly dead channel doesn't spin).
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsSrc;
        video.play().catch(function () {});
        var lastRepin = 0;
        var onNativeError = function () {
          if (stale() || Date.now() - lastRepin < 3000) return;
          lastRepin = Date.now();
          resolveLiveNode(panelM3u8).then(function (fresh) {
            if (stale()) return;
            video.src = fresh;
            video.play().catch(function () {});
          });
        };
        video.addEventListener('error', onNativeError);
        activeVideoCleanup = function () { video.removeEventListener('error', onNativeError); };
        return;
      }
      try {
        await ensureHls();
      } catch (e) { /* fall through to the mpegts path below */ }
      if (stale()) return;
      if (window.Hls && window.Hls.isSupported()) {
        var hls = new window.Hls({ lowLatencyMode: false });
        activeHls = hls;
        var lastResolve = 0, resolving = false;
        hls.on(window.Hls.Events.ERROR, function (evt, data) {
          if (!data || !data.fatal) return;         // non-fatal: hls.js self-heals
          console.error('[IPTVy] hls fatal error', data.type, data.details);
          if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
          if (data.type !== window.Hls.ErrorTypes.NETWORK_ERROR) { destroyPlayer(); return; }
          // Network error: the pinned node likely died / its token expired. Pin a
          // fresh node rather than hammering the dead URL. Throttle so a genuinely
          // unreachable channel backs off instead of spinning.
          if (resolving) return;
          if (Date.now() - lastResolve < 3000) { hls.startLoad(); return; }
          lastResolve = Date.now(); resolving = true;
          resolveLiveNode(panelM3u8).then(function (fresh) {
            resolving = false;
            if (activeHls !== hls) return;           // player was stopped/replaced
            hls.loadSource(fresh);
            hls.startLoad();
          }).catch(function () {
            resolving = false;
            if (activeHls === hls) hls.startLoad();
          });
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
