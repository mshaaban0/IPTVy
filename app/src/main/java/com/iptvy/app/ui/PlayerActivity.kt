package com.iptvy.app.ui

import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.cast.CastPlayer
import androidx.media3.cast.SessionAvailabilityListener
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.CastContext
import com.iptvy.app.cast.LocalCastProxy
import com.iptvy.app.databinding.ActivityPlayerBinding
import fi.iki.elonen.NanoHTTPD

/**
 * Full-screen player that plays locally via Media3/ExoPlayer and can hand playback
 * off to a TV over Google Cast. When a Cast session connects, the current position
 * is transferred to a [CastPlayer]; when it disconnects, playback resumes locally.
 *
 * The local player keeps a small buffer tuned for low-RAM TV sticks. Cast is only
 * wired up where Google Play services exist, so bare TV sticks are unaffected.
 * Live channels are cast as HLS through an on-device CORS proxy (see [LocalCastProxy]).
 */
class PlayerActivity : AppCompatActivity() {

    private lateinit var b: ActivityPlayerBinding

    private var localPlayer: ExoPlayer? = null
    private var castPlayer: CastPlayer? = null
    private var currentPlayer: Player? = null

    private var castContext: CastContext? = null

    // On-device HLS proxy that adds CORS headers so a Chromecast can play live
    // channels from an Xtream server. Started lazily, only when casting live.
    private var castProxy: LocalCastProxy? = null

    private var streamUrl: String? = null
    private var streamTitle: String = ""

    // Local and remote can need different sources for the same channel: the Cast
    // receiver can't play raw MPEG-TS, so live is cast as HLS while local stays on .ts.
    private var localMediaItem: MediaItem? = null
    private var castMediaItem: MediaItem? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(b.root)
        hideSystemBars()

        // Initialising the Cast framework touches Google Play services, which may be
        // missing or out of date on cheap TV sticks. Guard it so playback still works.
        castContext = try {
            CastContext.getSharedInstance(this)
        } catch (e: Exception) {
            null
        }
        castContext?.let {
            CastButtonFactory.setUpMediaRouteButton(applicationContext, b.castButton)
            b.castButton.visibility = View.VISIBLE
        }
    }

    override fun onStart() {
        super.onStart()
        initPlayers()
    }

    override fun onStop() {
        super.onStop()
        releasePlayers()
    }

    override fun onDestroy() {
        super.onDestroy()
        // Kept alive across onStop so casting survives brief backgrounding; torn
        // down only when the player screen is actually finished.
        castProxy?.stop()
        castProxy = null
    }

    private fun initPlayers() {
        val url = intent.getStringExtra("url") ?: run { finish(); return }
        streamTitle = intent.getStringExtra("title") ?: ""
        streamUrl = url
        b.title.text = streamTitle

        // Local plays the URL as-is (ExoPlayer has a TS extractor and handles it well).
        localMediaItem = MediaItem.fromUri(url)
        // The cast source is built lazily on first cast (see castItem()), so the proxy
        // only spins up when a stream is actually sent to a TV.

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
        exo.addListener(playerListener)
        localPlayer = exo

        val cast = castContext?.let { CastPlayer(it) }
        cast?.addListener(playerListener)
        cast?.setSessionAvailabilityListener(object : SessionAvailabilityListener {
            override fun onCastSessionAvailable() = setCurrentPlayer(cast)
            override fun onCastSessionUnavailable() = setCurrentPlayer(exo)
        })
        castPlayer = cast

        // Start on whichever surface is already active: an existing Cast session wins.
        setCurrentPlayer(if (cast?.isCastSessionAvailable == true) cast else exo)
    }

    /** Moves playback (and the current position) onto [player], swapping the UI to match. */
    private fun setCurrentPlayer(player: Player) {
        if (currentPlayer === player) return

        var position = 0L
        var playWhenReady = true
        currentPlayer?.let { old ->
            if (old.playbackState != Player.STATE_IDLE && old.playbackState != Player.STATE_ENDED) {
                position = old.currentPosition
                playWhenReady = old.playWhenReady
            }
            old.stop()
            old.clearMediaItems()
        }

        currentPlayer = player
        b.playerView.player = player

        val casting = player === castPlayer
        b.castOverlay.visibility = if (casting) View.VISIBLE else View.GONE
        // The video surface is meaningless while casting; keep controls for transport.
        b.playerView.controllerAutoShow = !casting
        // Casting no longer needs this device's screen awake.
        if (casting) window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val item = if (casting) castItem() else localMediaItem
        item?.let { player.setMediaItem(it, position) }
        player.playWhenReady = playWhenReady
        player.prepare()
    }

    private val playerListener = object : Player.Listener {
        override fun onPlayerError(error: PlaybackException) {
            Toast.makeText(this@PlayerActivity, "Playback error: ${error.errorCodeName}", Toast.LENGTH_LONG).show()
        }

        override fun onPlaybackStateChanged(state: Int) {
            b.buffering.visibility = if (state == Player.STATE_BUFFERING) View.VISIBLE else View.GONE
        }

        // Keep the screen awake only while playing locally, so the TV stick's
        // screensaver/daydream can't kick in mid-stream. Casting doesn't need it.
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying && currentPlayer === localPlayer) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    private fun releasePlayers() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        b.playerView.player = null

        localPlayer?.let {
            it.removeListener(playerListener)
            it.release()
        }
        localPlayer = null

        // Releasing the CastPlayer leaves the remote Cast session (and playback on
        // the TV) intact — closing this screen doesn't stop what's on the television.
        castPlayer?.let {
            it.setSessionAvailabilityListener(null)
            it.removeListener(playerListener)
            it.release()
        }
        castPlayer = null
        currentPlayer = null
    }

    /**
     * Builds (and caches) the media item for casting.
     *
     * Live channels come from Xtream as raw MPEG-TS (…/live/…/<id>.ts), which the
     * Default Media Receiver can't decode, so we cast the HLS (.m3u8) variant Xtream
     * serves at the same path. That HLS is routed through an on-device proxy that
     * adds the CORS headers the receiver requires (Xtream sends none) — without it,
     * the receiver silently refuses the playlist. VOD/series play directly.
     */
    private fun castItem(): MediaItem? {
        castMediaItem?.let { return it }
        val url = streamUrl ?: return null
        val base = url.substringBefore('?')
        val isLive = base.contains("/live/") && base.endsWith(".ts")

        val castUrl: String
        val mime: String
        if (isLive) {
            val hls = base.removeSuffix(".ts") + ".m3u8"
            castUrl = ensureProxy()?.hlsUrl(hls) ?: hls
            mime = MimeTypes.APPLICATION_M3U8
        } else {
            castUrl = url
            mime = guessMimeType(url)
        }

        return MediaItem.Builder()
            .setUri(castUrl)
            .setMimeType(mime)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(streamTitle).build())
            .build()
            .also { castMediaItem = it }
    }

    /** Lazily starts the local cast proxy; returns null if it can't bind a socket. */
    private fun ensureProxy(): LocalCastProxy? {
        castProxy?.let { return it }
        return try {
            LocalCastProxy().also {
                it.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
                castProxy = it
            }
        } catch (e: Exception) {
            null
        }
    }

    /** Best-effort MIME hint so the Cast receiver picks the right pipeline. */
    private fun guessMimeType(url: String): String {
        val path = url.substringBefore('?').substringAfterLast('/').lowercase()
        return when {
            path.endsWith(".m3u8") -> MimeTypes.APPLICATION_M3U8
            path.endsWith(".mpd") -> MimeTypes.APPLICATION_MPD
            path.endsWith(".ts") -> MimeTypes.VIDEO_MP2T
            path.endsWith(".mkv") -> MimeTypes.VIDEO_MATROSKA
            path.endsWith(".webm") -> MimeTypes.VIDEO_WEBM
            else -> MimeTypes.VIDEO_MP4
        }
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
