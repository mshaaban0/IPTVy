package com.iptvy.app.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import com.iptvy.app.data.Category
import com.iptvy.app.data.Prefs
import com.iptvy.app.data.Stream
import com.iptvy.app.data.StreamType
import com.iptvy.app.data.XtreamClient
import com.iptvy.app.databinding.ActivityHomeBinding
import kotlinx.coroutines.launch

class HomeActivity : AppCompatActivity() {

    private lateinit var b: ActivityHomeBinding
    private lateinit var prefs: Prefs
    private lateinit var client: XtreamClient

    private lateinit var categoryAdapter: CategoryAdapter
    private lateinit var streamAdapter: StreamAdapter

    private var currentType = StreamType.LIVE

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        if (!prefs.isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        client = XtreamClient(prefs)
        b = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(b.root)

        categoryAdapter = CategoryAdapter { cat -> loadStreams(cat) }
        b.categoryList.layoutManager = LinearLayoutManager(this)
        b.categoryList.adapter = categoryAdapter
        b.categoryList.setHasFixedSize(true)

        streamAdapter = StreamAdapter { stream -> onStreamClicked(stream) }
        b.streamGrid.layoutManager = GridLayoutManager(this, spanForType())
        b.streamGrid.adapter = streamAdapter
        b.streamGrid.setHasFixedSize(true)

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
                val cats = client.categories(currentType)
                categoryAdapter.submit(cats)
                if (cats.isNotEmpty()) loadStreams(cats.first())
                else setMessage("No categories")
            } catch (e: Exception) {
                setMessage("Error: ${e.message}")
            }
        }
    }

    private fun loadStreams(cat: Category) {
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
}
