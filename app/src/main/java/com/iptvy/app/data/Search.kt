package com.iptvy.app.data

import kotlin.math.abs
import kotlin.math.min

/**
 * Lenient, allocation-light title search for IPTV catalogs, where the same title
 * appears with wildly different punctuation/spacing ("Spider-Man", "Spiderman",
 * "Spider Man 2 (2014)").
 *
 * Matching uses a normalized form (lowercased, punctuation -> spaces) and a compact
 * form (spaces removed), so "spider man", "spider-man" and "spiderman" all find each
 * other. Every query word must appear in the title; a final fuzzy pass tolerates small
 * typos. Titles are normalized on the fly here (no retained per-item index) so a huge
 * catalog doesn't balloon memory on cheap TV sticks. Results are scored, ranked and
 * capped so we never sort or render a near-full catalog.
 */
object Search {

    const val MAX_RESULTS = 300
    const val MIN_QUERY = 2

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

    /** Filters and ranks [items] by [query], best matches first, capped at [limit]. */
    fun search(query: String, items: List<Stream>, limit: Int = MAX_RESULTS): List<Stream> {
        val nq = normalize(query)
        if (nq.length < MIN_QUERY) return emptyList()
        val qTokens = nq.split(' ')
        val qCompact = nq.replace(" ", "")

        val matched = ArrayList<Scored>()
        for (item in items) {
            val s = score(nq, qTokens, qCompact, item.name)
            if (s > 0) matched.add(Scored(item, s))
        }
        matched.sortWith(
            compareByDescending<Scored> { it.score }
                .thenBy { it.stream.name.length }
                .thenBy { it.stream.name }
        )
        val take = if (matched.size > limit) matched.subList(0, limit) else matched
        return take.map { it.stream }
    }

    private class Scored(val stream: Stream, val score: Int)

    /** Higher is a tighter match; 0 means no match. */
    private fun score(nq: String, qTokens: List<String>, qCompact: String, name: String): Int {
        val nn = normalize(name)
        if (nn.isEmpty()) return 0
        val compact = nn.replace(" ", "")

        // Whole query appears verbatim (ignoring punctuation) — strongest signal.
        if (nn.startsWith(nq)) return 1000
        if (nn.contains(nq)) return 900
        if (compact.contains(qCompact)) return 800

        // Every query word is a substring of some part of the title.
        if (qTokens.all { t -> nn.contains(t) || compact.contains(t) }) return 600

        // Fuzzy fallback: every query word is within a small edit distance of a title word.
        val nameTokens = nn.split(' ')
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
