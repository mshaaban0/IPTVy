package com.iptvy.app.data

import kotlin.math.abs
import kotlin.math.min

/**
 * Lenient title search for IPTV catalogs, where the same title appears with wildly
 * different punctuation/spacing ("Spider-Man", "Spiderman", "Spider Man 2 (2014)").
 *
 * Matching is done on a normalized form (lowercased, punctuation -> spaces) and a
 * compact form (spaces removed), so "spider man", "spider-man" and "spiderman" all
 * find each other. A query matches when every query word is found in the title, and
 * a final fuzzy pass tolerates small typos ("spidrman"). Results are scored so the
 * tightest matches sort first.
 */
object Search {

    /** Lowercase; every run of non-alphanumeric chars becomes a single space. */
    fun normalize(s: String): String {
        val sb = StringBuilder(s.length)
        var prevSpace = false
        for (c in s.lowercase()) {
            if (c.isLetterOrDigit()) {
                sb.append(c)
                prevSpace = false
            } else if (!prevSpace && sb.isNotEmpty()) {
                sb.append(' ')
                prevSpace = true
            }
        }
        return sb.toString().trim()
    }

    /** Filters and ranks [items] by [query], best matches first. */
    fun rank(query: String, items: List<Stream>): List<Stream> {
        val nq = normalize(query)
        if (nq.isEmpty()) return items
        val qTokens = nq.split(' ')
        val qCompact = nq.replace(" ", "")

        val scored = ArrayList<Pair<Stream, Int>>(items.size)
        for (item in items) {
            val s = score(nq, qTokens, qCompact, item.name)
            if (s > 0) scored.add(item to s)
        }
        scored.sortWith(
            compareByDescending<Pair<Stream, Int>> { it.second }
                .thenBy { it.first.name.length }
                .thenBy { it.first.name }
        )
        return scored.map { it.first }
    }

    /** Higher is a tighter match; 0 means no match. */
    private fun score(nq: String, qTokens: List<String>, qCompact: String, name: String): Int {
        val nn = normalize(name)
        if (nn.isEmpty()) return 0
        val compact = nn.replace(" ", "")

        // Whole query appears verbatim (ignoring punctuation) — strongest signal.
        if (nn.startsWith(nq)) return 1000
        if (nn.contains(nq)) return 900
        if (compact.contains(qCompact)) return 800

        val nameTokens = nn.split(' ')

        // Every query word is a substring of some part of the title.
        if (qTokens.all { t -> nn.contains(t) || compact.contains(t) }) return 600

        // Fuzzy fallback: every query word is within a small edit distance of a title word.
        if (qTokens.all { t -> compact.contains(t) || nameTokens.any { w -> closeEnough(t, w) } }) {
            return 300
        }
        return 0
    }

    private fun closeEnough(a: String, b: String): Boolean {
        val max = if (a.length <= 4) 1 else 2
        if (abs(a.length - b.length) > max) return false
        return levenshtein(a, b, max) <= max
    }

    /** Levenshtein distance, abandoning early once it exceeds [max]. */
    private fun levenshtein(a: String, b: String, max: Int): Int {
        val n = a.length
        val m = b.length
        if (n == 0) return m
        if (m == 0) return n
        var prev = IntArray(m + 1) { it }
        var curr = IntArray(m + 1)
        for (i in 1..n) {
            curr[0] = i
            var rowMin = curr[0]
            val ca = a[i - 1]
            for (j in 1..m) {
                val cost = if (ca == b[j - 1]) 0 else 1
                curr[j] = min(min(prev[j] + 1, curr[j - 1] + 1), prev[j - 1] + cost)
                if (curr[j] < rowMin) rowMin = curr[j]
            }
            if (rowMin > max) return max + 1
            val tmp = prev; prev = curr; curr = tmp
        }
        return prev[m]
    }
}
