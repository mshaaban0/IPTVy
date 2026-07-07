package com.iptvy.app.cast

import android.content.Context
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionProvider

/**
 * Cast framework configuration. Referenced from the manifest via the
 * `OPTIONS_PROVIDER_CLASS_NAME` meta-data; the framework instantiates it the
 * first time a [com.google.android.gms.cast.framework.CastContext] is created.
 *
 * We target the Default Media Receiver, Google's stock receiver app that plays
 * the common streaming formats (MP4/WebM/HLS/DASH) with no receiver to host.
 */
class CastOptionsProvider : OptionsProvider {
    override fun getCastOptions(context: Context): CastOptions =
        CastOptions.Builder()
            .setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)
            .build()

    override fun getAdditionalSessionProviders(context: Context): MutableList<SessionProvider>? = null
}
