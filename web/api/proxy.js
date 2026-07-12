/*
 * Stateless pass-through proxy for the public browser build.
 *
 * Browsers can't call Xtream panels directly (the panels send no CORS headers),
 * so the browser app routes its API calls and live HLS through here. This
 * function forwards one user-supplied URL and streams the response back. It keeps
 * no state and logs nothing — every request stands alone, which is what lets it
 * run correctly as a serverless function (requests fan out across many ephemeral
 * instances, so nothing in-process can be relied on between calls).
 *
 * Live HLS is pinned to a single CDN node without any shared state: the panel
 * load-balances each .m3u8 to a different node whose live windows are a segment
 * or two out of sync, which would make EXT-X-MEDIA-SEQUENCE jump around and the
 * player replay. We resolve the panel's redirect once and 302 the client to a
 * node-specific proxy URL; hls.js adopts that redirected URL and re-polls it, so
 * the channel stays on one node. The panel URL rides along as a ?panel= param so
 * we can re-resolve to a fresh node when the node's short-lived token expires.
 * See servePlaylist().
 *
 * Note: relaying live video through a serverless function uses real bandwidth
 * and is bounded by the platform's function timeout. VOD/series play directly
 * from the panel (the browser <video> element isn't CORS-restricted), so only
 * the small JSON API calls and live HLS (playlist + segments) pass through here.
 */

export default async function handler(req, res) {
  const target = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  if (!target) { res.status(400).json({ error: 'missing url' }); return; }

  let u;
  try { u = new URL(target); } catch (e) { res.status(400).json({ error: 'bad url' }); return; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    res.status(400).json({ error: 'unsupported protocol' });
    return;
  }
  if (isPrivateHost(u.hostname)) { res.status(403).json({ error: 'forbidden host' }); return; }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const fetchOpts = {
    headers: { 'User-Agent': 'IPTVy/1.0' },
    redirect: 'follow',
    signal: controller.signal
  };
  try {
    // A .m3u8 target is a live playlist: resolve it to one CDN node and redirect
    // the client so it stays pinned there (see servePlaylist). Anything else
    // (segment, JSON, …) is fetched and relayed straight through.
    if (u.pathname.toLowerCase().endsWith('.m3u8')) {
      await servePlaylist(u, req, res, fetchOpts);
      return;
    }

    const upstream = await fetch(u.toString(), fetchOpts);
    const ct = upstream.headers.get('content-type') || '';

    // Safety net: a playlist served without a .m3u8 path (detected by content
    // type). Rewrite its URIs but skip the node-pin redirect — it's a rare edge.
    if (/mpegurl/i.test(ct) && upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('content-type', 'application/vnd.apple.mpegurl');
      res.setHeader('cache-control', 'no-store');
      res.end(rewritePlaylist(text, upstream.url || u.toString()));
      return;
    }

    res.status(upstream.status);
    if (ct) res.setHeader('content-type', ct);
    res.setHeader('cache-control', 'no-store'); // never cache personal catalog data

    if (!upstream.body) { res.end(); return; }
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(502).json({ error: 'upstream error' });
    else { try { res.end(); } catch (e2) {} }
  } finally {
    clearTimeout(timer);
  }
}

// Serves a live HLS playlist while keeping the channel pinned to one CDN node —
// statelessly, so it survives serverless fan-out. The pin lives in the client's
// poll URL, not in this process:
//
//   1. First hit: `url` is the panel .m3u8. Fetching it 302s to a load-balanced
//      node; we 302 the client to /api/proxy?url=<node>&panel=<panel>. hls.js
//      adopts that redirected URL and re-polls it, so it sticks to this node.
//   2. Refreshes: `url` is the node .m3u8. We fetch it directly (no redirect) and
//      return the rewritten playlist — same node every time, monotonic sequence.
//   3. Token expiry: the node stops serving (non-2xx). We re-resolve through the
//      `panel` param (302s to a fresh node) and redirect the client to pin that.
async function servePlaylist(u, req, res, fetchOpts) {
  const requested = u.toString();
  const panelParam = Array.isArray(req.query.panel) ? req.query.panel[0] : req.query.panel;
  const panelUrl = panelParam || requested;
  if (panelParam && !isPublicUrl(panelUrl)) {
    res.status(403).json({ error: 'forbidden host' }); return;
  }

  // Poll what the client asked for (the pinned node on refreshes, the panel on
  // the first hit). If a pinned node has stopped serving, re-resolve via panel.
  let up = await fetch(requested, fetchOpts);
  if (!up.ok && panelUrl !== requested) {
    up = await fetch(panelUrl, fetchOpts);
  }

  // A followed redirect means we landed on a node different from the poll URL —
  // pin the client to it. `up.redirected` (not URL string comparison) is what
  // distinguishes this from a node serving its own URL directly, so there's no
  // redirect loop when fetch normalises the URL.
  if (up.ok && up.redirected) {
    const nodeUrl = up.url;
    if (!isPublicUrl(nodeUrl)) { res.status(403).json({ error: 'forbidden host' }); return; }
    res.statusCode = 302;
    res.setHeader('location', '/api/proxy?url=' + encodeURIComponent(nodeUrl) +
      '&panel=' + encodeURIComponent(panelUrl));
    res.setHeader('cache-control', 'no-store');
    res.end();
    return;
  }

  if (up.ok) {
    const text = await up.text();
    res.status(up.status);
    res.setHeader('content-type', 'application/vnd.apple.mpegurl');
    res.setHeader('cache-control', 'no-store');
    res.end(rewritePlaylist(text, up.url || requested));
    return;
  }

  // Upstream error (panel/node down) — relay the status so the player can retry.
  res.status(up.status);
  const ct = up.headers.get('content-type');
  if (ct) res.setHeader('content-type', ct);
  res.setHeader('cache-control', 'no-store');
  res.end();
}

// Rewrites an HLS playlist so every segment/variant/key URI points back at this
// proxy as an absolute, proxied URL. Relative URIs are resolved against `base`
// (the playlist's final URL after redirects) so they hit the node that served it.
function rewritePlaylist(text, base) {
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (t === '') return line;
    if (t[0] === '#') {
      // Tag line: only URI="…" attributes (EXT-X-KEY, -MAP, -MEDIA, …) are URLs.
      return line.replace(/URI="([^"]*)"/g, (_m, uri) => `URI="${proxify(uri, base)}"`);
    }
    return proxify(t, base);       // resource line: a segment or a variant playlist
  }).join('\n');
}

function proxify(uri, base) {
  let abs;
  try { abs = new URL(uri, base).toString(); } catch (e) { return uri; }
  return '/api/proxy?url=' + encodeURIComponent(abs);
}

function isPublicUrl(s) {
  try { return !isPrivateHost(new URL(s).hostname); } catch (e) { return false; }
}

// Blocks the obvious SSRF targets so the public proxy can't be aimed at
// internal/loopback addresses. Panels live on arbitrary public hosts, so we
// can't allow-list — we just deny private ranges.
function isPrivateHost(host) {
  const h = (host || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (h === '::1' || h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
}
