package com.iptvy.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists favorited streams as a JSON array in SharedPreferences. Held in memory
 * for the lifetime of the instance so per-tile lookups stay cheap; the list is
 * small (user-curated) so a linear scan is fine.
 */
class FavoritesStore(context: Context) {
    private val sp = context.getSharedPreferences("iptvy", Context.MODE_PRIVATE)
    private val items: MutableList<Stream> = load()

    private fun load(): MutableList<Stream> {
        val raw = sp.getString(KEY, null) ?: return mutableListOf()
        return try {
            val arr = JSONArray(raw)
            val out = ArrayList<Stream>(arr.length())
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                out.add(
                    Stream(
                        id = o.getString("id"),
                        name = o.getString("name"),
                        icon = o.optString("icon").ifBlank { null },
                        type = StreamType.valueOf(o.getString("type")),
                        containerExt = o.optString("containerExt").ifBlank { null }
                    )
                )
            }
            out
        } catch (e: Exception) {
            mutableListOf()
        }
    }

    private fun persist() {
        val arr = JSONArray()
        for (s in items) {
            arr.put(
                JSONObject()
                    .put("id", s.id)
                    .put("name", s.name)
                    .put("icon", s.icon ?: "")
                    .put("type", s.type.name)
                    .put("containerExt", s.containerExt ?: "")
            )
        }
        sp.edit().putString(KEY, arr.toString()).apply()
    }

    fun isFavorite(s: Stream): Boolean = items.any { it.type == s.type && it.id == s.id }

    /** Toggles favorite state; returns true if the stream is now a favorite. */
    fun toggle(s: Stream): Boolean {
        val idx = items.indexOfFirst { it.type == s.type && it.id == s.id }
        return if (idx >= 0) {
            items.removeAt(idx)
            persist()
            false
        } else {
            items.add(0, s)
            persist()
            true
        }
    }

    fun all(type: StreamType): List<Stream> = items.filter { it.type == type }

    companion object {
        private const val KEY = "favorites"
    }
}
