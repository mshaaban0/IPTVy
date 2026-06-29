package com.iptvy.app.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.iptvy.app.data.Episode
import com.iptvy.app.data.Prefs
import com.iptvy.app.data.XtreamClient
import com.iptvy.app.databinding.ActivitySeriesBinding
import kotlinx.coroutines.launch

class SeriesDetailActivity : AppCompatActivity() {

    private lateinit var b: ActivitySeriesBinding
    private lateinit var client: XtreamClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        client = XtreamClient(Prefs(this))
        b = ActivitySeriesBinding.inflate(layoutInflater)
        setContentView(b.root)

        val seriesId = intent.getStringExtra("series_id") ?: run { finish(); return }
        b.seriesTitle.text = intent.getStringExtra("series_name") ?: "Series"

        val adapter = EpisodeAdapter { ep -> playEpisode(ep) }
        b.episodeList.layoutManager = LinearLayoutManager(this)
        b.episodeList.adapter = adapter

        b.message.visibility = View.VISIBLE
        b.message.text = "Loading episodes…"
        lifecycleScope.launch {
            try {
                val eps = client.seriesEpisodes(seriesId)
                adapter.submit(eps)
                b.message.visibility = if (eps.isEmpty()) View.VISIBLE else View.GONE
                if (eps.isEmpty()) b.message.text = "No episodes found"
            } catch (e: Exception) {
                b.message.text = "Error: ${e.message}"
            }
        }
    }

    private fun playEpisode(ep: Episode) {
        startActivity(
            Intent(this, PlayerActivity::class.java)
                .putExtra("url", client.seriesUrl(ep.id, ep.containerExt))
                .putExtra("title", ep.title)
        )
    }
}
