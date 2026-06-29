package com.iptvy.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Lightweight Xtream Codes client. No reflection-based JSON, minimal allocations,
 * per-category lazy loading so huge playlists never load all at once. Designed to
 * stay light on cheap Google TV sticks.
 */
class XtreamClient(private val prefs: Prefs) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private fun apiUrl(action: String, extra: String = ""): String {
        val u = enc(prefs.username)
        val p = enc(prefs.password)
        return "${prefs.server}/player_api.php?username=$u&password=$p&action=$action$extra"
    }

    private fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")

    private suspend fun getString(url: String): String = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(url)
            .header("User-Agent", "IPTVy/1.0")
            .build()
        http.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw RuntimeException("HTTP ${resp.code}")
            resp.body?.string() ?: ""
        }
    }

    /** Validates credentials. Returns true if the panel reports auth = 1. */
    suspend fun login(): Boolean {
        val body = getString("${prefs.server}/player_api.php?username=${enc(prefs.username)}&password=${enc(prefs.password)}")
        return try {
            val obj = JSONObject(body)
            val user = obj.optJSONObject("user_info")
            user != null && user.optInt("auth", 0) == 1
        } catch (e: Exception) {
            false
        }
    }

    suspend fun categories(type: StreamType): List<Category> {
        val action = when (type) {
            StreamType.LIVE -> "get_live_categories"
            StreamType.VOD -> "get_vod_categories"
            StreamType.SERIES -> "get_series_categories"
        }
        val arr = JSONArray(getString(apiUrl(action)))
        val out = ArrayList<Category>(arr.length() + 1)
        out.add(Category("__all__", "All"))
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.add(Category(o.optString("category_id"), o.optString("category_name")))
        }
        return out
    }

    suspend fun streams(type: StreamType, categoryId: String): List<Stream> {
        val action = when (type) {
            StreamType.LIVE -> "get_live_streams"
            StreamType.VOD -> "get_vod_streams"
            StreamType.SERIES -> "get_series"
        }
        val filter = if (categoryId == "__all__") "" else "&category_id=$categoryId"
        val arr = JSONArray(getString(apiUrl(action, filter)))
        val out = ArrayList<Stream>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            when (type) {
                StreamType.LIVE -> out.add(
                    Stream(
                        id = o.opt("stream_id").toString(),
                        name = o.optString("name"),
                        icon = o.optString("stream_icon").ifBlank { null },
                        type = StreamType.LIVE
                    )
                )
                StreamType.VOD -> out.add(
                    Stream(
                        id = o.opt("stream_id").toString(),
                        name = o.optString("name"),
                        icon = o.optString("stream_icon").ifBlank { null },
                        type = StreamType.VOD,
                        containerExt = o.optString("container_extension").ifBlank { "mp4" }
                    )
                )
                StreamType.SERIES -> out.add(
                    Stream(
                        id = o.opt("series_id").toString(),
                        name = o.optString("name"),
                        icon = o.optString("cover").ifBlank { null },
                        type = StreamType.SERIES
                    )
                )
            }
        }
        return out
    }

    /** Returns episodes grouped by season, ordered. */
    suspend fun seriesEpisodes(seriesId: String): List<Episode> {
        val body = getString(apiUrl("get_series_info", "&series_id=$seriesId"))
        val obj = JSONObject(body)
        val episodesObj = obj.optJSONObject("episodes") ?: return emptyList()
        val out = ArrayList<Episode>()
        val seasonKeys = episodesObj.keys().asSequence().toList().sortedBy { it.toIntOrNull() ?: 0 }
        for (key in seasonKeys) {
            val seasonNum = key.toIntOrNull() ?: 0
            val eps = episodesObj.optJSONArray(key) ?: continue
            for (i in 0 until eps.length()) {
                val e = eps.getJSONObject(i)
                out.add(
                    Episode(
                        id = e.opt("id").toString(),
                        title = e.optString("title").ifBlank { "Episode ${i + 1}" },
                        season = seasonNum,
                        containerExt = e.optString("container_extension").ifBlank { "mp4" }
                    )
                )
            }
        }
        return out
    }

    // ---- Stream URL builders ----

    fun liveUrl(streamId: String): String =
        "${prefs.server}/live/${enc(prefs.username)}/${enc(prefs.password)}/$streamId.ts"

    fun vodUrl(streamId: String, ext: String?): String =
        "${prefs.server}/movie/${enc(prefs.username)}/${enc(prefs.password)}/$streamId.${ext ?: "mp4"}"

    fun seriesUrl(episodeId: String, ext: String?): String =
        "${prefs.server}/series/${enc(prefs.username)}/${enc(prefs.password)}/$episodeId.${ext ?: "mp4"}"
}
