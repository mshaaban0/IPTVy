/*
 * Stateless pass-through proxy for the public browser build.
 *
 * Browsers can't call Xtream panels directly (the panels send no CORS headers),
 * so the browser app routes its API calls and live-TS stream through here. This
 * function forwards exactly one user-supplied URL and streams the response back.
 * It stores nothing and logs no credentials, so there is no shared or
 * cross-user state. webOS builds never use this — they call panels directly.
 *
 * Note: relaying live video through a serverless function uses real bandwidth
 * and is bounded by the platform's function timeout. VOD/series play directly
 * from the panel (the browser <video> element isn't CORS-restricted), so only
 * the small JSON API calls and live MPEG-TS pass through here.
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
  try {
    const upstream = await fetch(u.toString(), {
      headers: { 'User-Agent': 'IPTVy/1.0' },
      redirect: 'follow',
      signal: controller.signal
    });
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
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
