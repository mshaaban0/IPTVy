/*
 * Pass-through proxy for the public browser build.
 *
 * Browsers can't call Xtream panels directly (the panels send no CORS headers),
 * so the browser app routes its API calls and live HLS through here. This
 * function forwards one user-supplied URL and streams the response back. It logs
 * nothing, and its only state is an ephemeral, in-memory HLS node pin (see
 * nodePins) — no persistence, no logging of the credentialed URLs.
 *
 * Note: relaying live video through a serverless function uses real bandwidth
 * and is bounded by the platform's function timeout. VOD/series play directly
 * from the panel (the browser <video> element isn't CORS-restricted), so only
 * the small JSON API calls and live HLS (playlist + segments) pass through here.
 */

// Per-channel HLS node pin. The panel load-balances every .m3u8 request to a
// different CDN node, and those nodes' live windows are a segment or two out of
// sync — so re-resolving on every playlist refresh makes EXT-X-MEDIA-SEQUENCE
// jump backwards and the player replays a few seconds. We stick to the node we
// first resolved (its sequence is monotonic) and only resolve a fresh one when
// its short-lived token stops working. Key = panel .m3u8 URL, value = node URL.
const nodePins = new Map();

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
    // A .m3u8 target is a live playlist poll: resolve it through the node pin so
    // the app keeps hitting one node (see nodePins) and rewrite its URIs. Any
    // other target (segment, JSON, …) is fetched and relayed straight through.
    const wantsPlaylist = u.pathname.toLowerCase().endsWith('.m3u8');
    const upstream = wantsPlaylist
      ? await getPlaylistUpstream(u.toString(), fetchOpts)
      : await fetch(u.toString(), fetchOpts);
    const ct = upstream.headers.get('content-type') || '';

    // HLS playlists get rewritten so every segment/variant/key URI points back at
    // this proxy (absolute, resolved against the playlist's own node). Only rewrite
    // a healthy playlist; relay error responses as-is so the player can retry.
    const isPlaylist = wantsPlaylist || /mpegurl/i.test(ct);
    if (isPlaylist && upstream.ok) {
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

// Resolves a live playlist while sticking to one CDN node. Tries the pinned node
// first (keeps EXT-X-MEDIA-SEQUENCE monotonic); if its token has expired (non-2xx)
// it re-resolves through the panel URL, which 302s to a fresh load-balanced node,
// and pins that. `panelUrl` is the credentialed …/<id>.m3u8; the pin holds the
// resolved node URL (with its own token) only in memory.
async function getPlaylistUpstream(panelUrl, fetchOpts) {
  const pinned = nodePins.get(panelUrl);
  if (pinned) {
    try {
      if (!isPrivateHost(new URL(pinned).hostname)) {
        const up = await fetch(pinned, fetchOpts);
        if (up.ok) return up;          // node still serving — sequence stays monotonic
      }
    } catch (e) { /* fall through and re-resolve */ }
    nodePins.delete(panelUrl);
  }
  const up = await fetch(panelUrl, fetchOpts);   // panel 302s to a fresh node
  if (up.ok && up.url && up.url !== panelUrl) {
    try { if (!isPrivateHost(new URL(up.url).hostname)) nodePins.set(panelUrl, up.url); }
    catch (e) { /* leave unpinned */ }
  }
  return up;
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
