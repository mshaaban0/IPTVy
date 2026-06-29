package com.iptvy.app.data

import android.content.Context

/** Stores Xtream credentials. Server is normalized to scheme://host[:port] with no trailing slash. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("iptvy", Context.MODE_PRIVATE)

    var server: String
        get() = sp.getString("server", "") ?: ""
        set(v) = sp.edit().putString("server", v).apply()

    var username: String
        get() = sp.getString("username", "") ?: ""
        set(v) = sp.edit().putString("username", v).apply()

    var password: String
        get() = sp.getString("password", "") ?: ""
        set(v) = sp.edit().putString("password", v).apply()

    val isLoggedIn: Boolean
        get() = server.isNotEmpty() && username.isNotEmpty()

    fun save(server: String, username: String, password: String) {
        sp.edit()
            .putString("server", normalize(server))
            .putString("username", username)
            .putString("password", password)
            .apply()
    }

    fun clear() = sp.edit().clear().apply()

    companion object {
        fun normalize(raw: String): String {
            var s = raw.trim()
            if (s.isEmpty()) return s
            if (!s.startsWith("http://", true) && !s.startsWith("https://", true)) {
                s = "http://$s"
            }
            while (s.endsWith("/")) s = s.dropLast(1)
            return s
        }
    }
}
