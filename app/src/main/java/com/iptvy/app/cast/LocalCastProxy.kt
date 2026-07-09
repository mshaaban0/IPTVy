package com.iptvy.app.cast

import android.util.Base64
import fi.iki.elonen.NanoHTTPD
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * A tiny on-device HTTP proxy that makes authenticated Xtream live streams
 * castable to a Chromecast.
 *
 * The Cast Default Media Receiver refuses HLS whose playlist/segments lack CORS
 * headers, and Xtream panels don't send them — so live channels fail to cast even
 * though single-file MP4 movies (which need no CORS) work. This proxy runs on the
 * phone, fetches the stream from the Xtream server, and re-serves it to the TV
 * with CORS headers. HLS playlists are rewritten so their variants/segments are
 * pulled back through the proxy too, giving every request the CORS headers it needs.
 *
 * Bound to an ephemeral port on the device's LAN address; the Chromecast (on the
 * same network) connects back to it. Only reachable on the local network.
 */
class LocalCastProxy : NanoHTTPD(0) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /** Wraps an upstream HLS playlist URL as a proxied URL the Chromecast can load. */
    fun hlsUrl(upstream: String): String {
        val host = lanIp() ?: "127.0.0.1"
        return "http://$host:$listeningPort/p?u=${encode(upstream)}"
    }

    override fun serve(session: IHTTPSession): Response {
        if (session.method == Method.OPTIONS) {
            return cors(newFixedLengthResponse(Response.Status.OK, "text/plain", ""))
        }
        val upstream = session.parameters["u"]?.firstOrNull()?.let { decode(it) }
            ?: return cors(newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "missing u"))
        return try {
            proxy(upstream, session)
        } catch (e: Exception) {
            cors(newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "proxy error"))
        }
    }

    private fun proxy(upstream: String, session: IHTTPSession): Response {
        val path = upstream.substringBefore('?')
        val isPlaylist = path.endsWith(".m3u8", true) || path.endsWith(".m3u", true)

        val builder = Request.Builder().url(upstream).header("User-Agent", "IPTVy/1.0")
        // Forward the range only for media segments; a range on a playlist could
        // return a truncated, unparseable list.
        if (!isPlaylist) session.headers["range"]?.let { builder.header("Range", it) }

        val resp = http.newCall(builder.build()).execute()
        val contentType = resp.header("Content-Type").orEmpty()

        if (isPlaylist || contentType.contains("mpegurl", true)) {
            val text = resp.body?.string().orEmpty()
            resp.close()
            val rewritten = rewritePlaylist(text, upstream)
            return cors(newFixedLengthResponse(Response.Status.OK, "application/vnd.apple.mpegurl", rewritten))
        }

        // Stream the segment straight through. NanoHTTPD reads and closes the body.
        val body = resp.body ?: return cors(newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "no body"))
        val status = if (resp.code == 206) Response.Status.PARTIAL_CONTENT else Response.Status.OK
        val mime = contentType.ifBlank { "video/mp2t" }
        val length = resp.header("Content-Length")?.toLongOrNull()
        val out = if (length != null) {
            newFixedLengthResponse(status, mime, body.byteStream(), length)
        } else {
            newChunkedResponse(status, mime, body.byteStream())
        }
        resp.header("Content-Range")?.let { out.addHeader("Content-Range", it) }
        out.addHeader("Accept-Ranges", "bytes")
        return cors(out)
    }

    /**
     * Rewrites every URL in an HLS playlist to point back at this proxy, so the
     * receiver fetches variants, keys and segments through us (and gets CORS on
     * each). Handles both bare URI lines and URI="..." attributes on tags.
     */
    private fun rewritePlaylist(text: String, playlistUrl: String): String {
        val sb = StringBuilder(text.length + 256)
        for (line in text.split("\n")) {
            val trimmed = line.trim()
            when {
                trimmed.isEmpty() -> sb.append('\n')
                trimmed.startsWith("#") -> sb.append(rewriteUriAttr(trimmed, playlistUrl)).append('\n')
                else -> sb.append(proxied(resolve(playlistUrl, trimmed))).append('\n')
            }
        }
        return sb.toString()
    }

    private val uriAttr = Regex("""URI="([^"]*)"""")

    private fun rewriteUriAttr(tagLine: String, playlistUrl: String): String =
        uriAttr.replace(tagLine) { m ->
            "URI=\"" + proxied(resolve(playlistUrl, m.groupValues[1])) + "\""
        }

    /** A same-host absolute path back to the proxy, so no LAN IP is needed here. */
    private fun proxied(absoluteUrl: String): String = "/p?u=${encode(absoluteUrl)}"

    /** Resolves [ref] (absolute or relative) against the playlist's URL. */
    private fun resolve(base: String, ref: String): String =
        try { URL(URL(base), ref).toString() } catch (e: Exception) { ref }

    private fun cors(r: Response): Response {
        r.addHeader("Access-Control-Allow-Origin", "*")
        r.addHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
        r.addHeader("Access-Control-Allow-Headers", "Content-Type, Range, Accept-Encoding")
        r.addHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
        return r
    }

    private fun encode(s: String): String =
        Base64.encodeToString(s.toByteArray(), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

    private fun decode(s: String): String =
        String(Base64.decode(s, Base64.URL_SAFE))

    /** First non-loopback site-local IPv4 address — the LAN IP the TV can reach. */
    private fun lanIp(): String? {
        return try {
            NetworkInterface.getNetworkInterfaces().asSequence()
                .filter { it.isUp && !it.isLoopback }
                .flatMap { it.inetAddresses.asSequence() }
                .firstOrNull { !it.isLoopbackAddress && it is Inet4Address && it.isSiteLocalAddress }
                ?.hostAddress
        } catch (e: Exception) {
            null
        }
    }
}
