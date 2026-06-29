package com.iptvy.app.data

enum class StreamType { LIVE, VOD, SERIES }

data class Category(
    val id: String,
    val name: String
)

/** A browsable item in a grid: a live channel, a movie, or a series. */
data class Stream(
    val id: String,
    val name: String,
    val icon: String?,
    val type: StreamType,
    val containerExt: String? = null
)

data class Episode(
    val id: String,
    val title: String,
    val season: Int,
    val containerExt: String?
)
