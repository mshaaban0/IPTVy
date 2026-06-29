package com.iptvy.app.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.addTextChangedListener
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import com.iptvy.app.R
import com.iptvy.app.data.Category
import com.iptvy.app.data.FavoritesStore
import com.iptvy.app.data.Prefs
import com.iptvy.app.data.Search
import com.iptvy.app.data.Stream
import com.iptvy.app.data.StreamType
import com.iptvy.app.data.XtreamClient
import com.iptvy.app.databinding.ActivityHomeBinding
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class HomeActivity : AppCompatActivity() {

    private lateinit var b: ActivityHomeBinding
    private lateinit var prefs: Prefs
    private lateinit var client: XtreamClient
    private lateinit var favorites: FavoritesStore

    private lateinit var categoryAdapter: CategoryAdapter
    private lateinit var streamAdapter: StreamAdapter

    private var currentType = StreamType.LIVE
    private var currentCategory: Category? = null

    /** All streams of the current tab, loaded lazily the first time a search runs. */
    private var allStreamsCache: List<Stream>? = null
    private var searchJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        if (!prefs.isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        client = XtreamClient(prefs)
        favorites = FavoritesStore(this)
        b = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(b.root)

        categoryAdapter = CategoryAdapter { cat -> loadStreams(cat) }
        b.categoryList.layoutManager = LinearLayoutManager(this)
        b.categoryList.adapter = categoryAdapter
        b.categoryList.setHasFixedSize(true)

        streamAdapter = StreamAdapter(
            onClick = { stream -> onStreamClicked(stream) },
            isFavorite = { stream -> favorites.isFavorite(stream) },
            onLongClick = { stream, position -> toggleFavorite(stream, position) }
        )
        b.streamGrid.layoutManager = GridLayoutManager(this, spanForType())
        b.streamGrid.adapter = streamAdapter
        b.streamGrid.setHasFixedSize(true)

        b.searchInput.addTextChangedListener { text ->
            scheduleSearch(text?.toString().orEmpty())
        }

        b.tabLive.setOnClickListener { switchTab(StreamType.LIVE) }
        b.tabMovies.setOnClickListener { switchTab(StreamType.VOD) }
        b.tabSeries.setOnClickListener { switchTab(StreamType.SERIES) }
        b.logout.setOnClickListener {
            prefs.clear()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }

        switchTab(StreamType.LIVE)
    }

    private fun spanForType(): Int = if (currentType == StreamType.LIVE) 4 else 5

    private fun switchTab(type: StreamType) {
        currentType = type
        currentCategory = null
        allStreamsCache = null
        searchJob?.cancel()
        b.searchInput.text?.clear()
        highlightTab()
        (b.streamGrid.layoutManager as GridLayoutManager).spanCount = spanForType()
        streamAdapter.submit(emptyList())
        loadCategories()
    }

    private fun highlightTab() {
        b.tabLive.isSelected = currentType == StreamType.LIVE
        b.tabMovies.isSelected = currentType == StreamType.VOD
        b.tabSeries.isSelected = currentType == StreamType.SERIES
    }

    private fun loadCategories() {
        setMessage("Loading…")
        lifecycleScope.launch {
            try {
                val favCat = Category(FAVORITES_ID, getString(R.string.favorites))
                val cats = listOf(favCat) + client.categories(currentType)
                // Default landing is "All" (index 1), with Favorites pinned at the top.
                val defaultIndex = if (cats.size > 1) 1 else 0
                categoryAdapter.submit(cats, defaultIndex)
                loadStreams(cats[defaultIndex])
            } catch (e: Exception) {
                setMessage("Error: ${e.message}")
            }
        }
    }

    private fun loadStreams(cat: Category) {
        currentCategory = cat
        if (cat.id == FAVORITES_ID) {
            showFavorites()
            return
        }
        setMessage("Loading ${cat.name}…")
        lifecycleScope.launch {
            try {
                val list = client.streams(currentType, cat.id)
                streamAdapter.submit(list)
                setMessage(if (list.isEmpty()) "Empty category" else null)
            } catch (e: Exception) {
                setMessage("Error: ${e.message}")
            }
        }
    }

    private fun showFavorites() {
        val list = favorites.all(currentType)
        streamAdapter.submit(list)
        setMessage(if (list.isEmpty()) getString(R.string.no_favorites) else null)
    }

    private fun toggleFavorite(stream: Stream, position: Int) {
        val nowFavorite = favorites.toggle(stream)
        Toast.makeText(
            this,
            if (nowFavorite) R.string.added_favorite else R.string.removed_favorite,
            Toast.LENGTH_SHORT
        ).show()
        // Removing from the favorites view changes the list; otherwise just refresh the badge.
        if (currentCategory?.id == FAVORITES_ID) {
            showFavorites()
        } else if (position != androidx.recyclerview.widget.RecyclerView.NO_POSITION) {
            streamAdapter.notifyItemChanged(position)
        }
    }

    private fun scheduleSearch(query: String) {
        searchJob?.cancel()
        val q = query.trim()
        if (q.isEmpty()) {
            // Search cleared: restore the category the user was browsing.
            currentCategory?.let { loadStreams(it) }
            return
        }
        searchJob = lifecycleScope.launch {
            delay(300)
            runSearch(q)
        }
    }

    private suspend fun runSearch(query: String) {
        setMessage(getString(R.string.searching))
        try {
            val all = allStreamsCache
                ?: client.streams(currentType, "__all__").also { allStreamsCache = it }
            val filtered = Search.rank(query, all)
            streamAdapter.submit(filtered)
            setMessage(if (filtered.isEmpty()) getString(R.string.no_results) else null)
        } catch (e: Exception) {
            setMessage("Error: ${e.message}")
        }
    }

    private fun onStreamClicked(stream: Stream) {
        when (stream.type) {
            StreamType.LIVE -> openPlayer(client.liveUrl(stream.id), stream.name)
            StreamType.VOD -> openPlayer(client.vodUrl(stream.id, stream.containerExt), stream.name)
            StreamType.SERIES -> {
                startActivity(
                    Intent(this, SeriesDetailActivity::class.java)
                        .putExtra("series_id", stream.id)
                        .putExtra("series_name", stream.name)
                )
            }
        }
    }

    private fun openPlayer(url: String, title: String) {
        startActivity(
            Intent(this, PlayerActivity::class.java)
                .putExtra("url", url)
                .putExtra("title", title)
        )
    }

    private fun setMessage(text: String?) {
        val tv: TextView = b.message
        if (text == null) {
            tv.visibility = View.GONE
        } else {
            tv.visibility = View.VISIBLE
            tv.text = text
        }
    }

    companion object {
        private const val FAVORITES_ID = "__fav__"
    }
}
