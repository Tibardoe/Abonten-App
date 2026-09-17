package expo.modules.volumeobserver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Reports changes to the media (music) stream volume. It only OBSERVES:
// the hardware keys keep doing exactly what Android does with them, and the
// app decides what a change means (the Spotlight feed unmutes on "up").
// While observed, the activity's volume keys are pointed at the media
// stream — what any video app does — so a press adjusts video volume rather
// than the ringer even while the video is muted.
//
// The change arrives as the system VOLUME_CHANGED_ACTION broadcast. (A
// ContentObserver on Settings.System, the older approach, is no longer
// notified for volume changes on current Android — measured on API 36.)
class VolumeObserverModule : Module() {
  private var receiver: BroadcastReceiver? = null
  private var last = -1
  private var previousControlStream: Int? = null

  private val audio: AudioManager?
    get() = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  override fun definition() = ModuleDefinition {
    Name("VolumeObserver")
    Events("onVolumeChange")

    Function("getVolume") { fraction() }

    OnStartObserving { start() }
    OnStopObserving { stop() }
    OnActivityEntersForeground { pointKeysAtMedia() }
    OnDestroy { stop() }
  }

  private fun fraction(): Double {
    val a = audio ?: return 0.0
    val max = a.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    return if (max > 0) a.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max else 0.0
  }

  private fun pointKeysAtMedia() {
    if (receiver == null) return
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread {
      if (previousControlStream == null) previousControlStream = activity.volumeControlStream
      activity.volumeControlStream = AudioManager.STREAM_MUSIC
    }
  }

  private fun start() {
    val context = appContext.reactContext ?: return
    if (receiver != null) return
    last = audio?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: -1
    val r = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        val stream = intent?.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1) ?: -1
        if (stream != AudioManager.STREAM_MUSIC) return
        val now = audio?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: return
        if (now == last) return
        val previous = last
        last = now
        sendEvent(
          "onVolumeChange",
          mapOf("volume" to fraction(), "direction" to if (now > previous) "up" else "down")
        )
      }
    }
    val filter = IntentFilter("android.media.VOLUME_CHANGED_ACTION")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      context.registerReceiver(r, filter)
    }
    receiver = r
    pointKeysAtMedia()
  }

  private fun stop() {
    receiver?.let {
      try {
        appContext.reactContext?.unregisterReceiver(it)
      } catch (_: IllegalArgumentException) {
      }
    }
    receiver = null
    val restore = previousControlStream ?: return
    previousControlStream = null
    appContext.currentActivity?.let { activity ->
      activity.runOnUiThread { activity.volumeControlStream = restore }
    }
  }
}
