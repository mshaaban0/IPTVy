package com.iptvy.app.ui

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import com.iptvy.app.databinding.ActivityPlayerBinding

/**
 * Full-screen Media3 player. Uses hardware decoding by default and a small buffer
 * tuned for low-RAM TV sticks so memory stays modest while still surviving jitter.
 */
class PlayerActivity : AppCompatActivity() {

    private lateinit var b: ActivityPlayerBinding
    private var player: ExoPlayer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(b.root)
        hideSystemBars()
    }

    override fun onStart() {
        super.onStart()
        initPlayer()
    }

    override fun onStop() {
        super.onStop()
        releasePlayer()
    }

    private fun initPlayer() {
        val url = intent.getStringExtra("url") ?: run { finish(); return }
        val title = intent.getStringExtra("title") ?: ""

        // Conservative buffer sizes keep memory low on cheap sticks.
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs */ 5_000,
                /* maxBufferMs */ 20_000,
                /* bufferForPlaybackMs */ 1_500,
                /* bufferForPlaybackAfterRebufferMs */ 3_000
            )
            .build()

        val exo = ExoPlayer.Builder(this)
            .setLoadControl(loadControl)
            .build()
        b.playerView.player = exo
        b.title.text = title

        exo.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                Toast.makeText(this@PlayerActivity, "Playback error: ${error.errorCodeName}", Toast.LENGTH_LONG).show()
            }

            override fun onIsLoadingChanged(isLoading: Boolean) {
                b.buffering.visibility = if (isLoading && exo.playbackState != Player.STATE_READY) View.VISIBLE else View.GONE
            }

            override fun onPlaybackStateChanged(state: Int) {
                b.buffering.visibility = if (state == Player.STATE_BUFFERING) View.VISIBLE else View.GONE
            }
        })

        exo.setMediaItem(MediaItem.fromUri(url))
        exo.playWhenReady = true
        exo.prepare()
        player = exo
    }

    private fun releasePlayer() {
        player?.release()
        player = null
    }

    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }
}
