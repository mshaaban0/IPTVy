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
 * Live HLS is pinned to a single CDN node by the CLIENT, not here: the panel
 * load-balances each .m3u8 to a different node whose live windows are a segment
 * or two out of sync, which would make EXT-X-MEDIA-SEQUENCE jump around and the
 * player replay/stall. The client resolves the panel's redirect once (?resolve=1
 * → the concrete node URL) and then polls that node URL directly, so it stays on
 * one node; it re-resolves only when the node's short-lived token dies. This
 * proxy just (a) resolves on request and (b) fetches whatever URL it's given.
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
    // ?resolve=1 on a live .m3u8: follow the panel's load-balancer redirect and
    // hand the client back the concrete node URL to pin (see the file header).
    if (req.query.resolve && u.pathname.toLowerCase().endsWith('.m3u8')) {
      const probe = await fetch(u.toString(), fetchOpts);
      const nodeUrl = probe.url || u.toString();
      if (!probe.ok) { res.status(probe.status).json({ error: 'resolve failed' }); return; }
      if (!isPublicUrl(nodeUrl)) { res.status(403).json({ error: 'forbidden host' }); return; }
      res.status(200);
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify({ url: nodeUrl }));
      return;
    }

    const upstream = await fetch(u.toString(), fetchOpts);
    const ct = upstream.headers.get('content-type') || '';

    // A live playlist (by path or content type) gets its segment/variant/key URIs
    // rewritten to point back at this proxy, resolved against the URL that served
    // it (so relative paths hit the right node). Only rewrite a healthy playlist;
    // relay error responses as-is so the client can react (re-resolve on token
    // expiry).
    const isPlaylist = u.pathname.toLowerCase().endsWith('.m3u8') || /mpegurl/i.test(ct);
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
