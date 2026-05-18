package expo.modules.tvfocus

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewTreeObserver
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TvFocusModule : Module() {

  private var focusListener: ViewTreeObserver.OnGlobalFocusChangeListener? = null
  private var lastFocusedView: View? = null
  private var isSetup = false
  private val mainHandler = Handler(Looper.getMainLooper())

  private val SCALE_FOCUSED = 1.0f
  private val SCALE_NORMAL = 1.0f
  private val ANIM_DURATION = 150L

  override fun definition() = ModuleDefinition {
    Name("TvFocus")

    Events("onTvFocusChanged")

    // Called from JS after Activity is ready
    Function("activate") {
      mainHandler.post { setupFocusListenerWithRetry(0) }
    }

    OnDestroy {
      mainHandler.post { removeFocusListener() }
    }
  }

  private fun setupFocusListenerWithRetry(attempt: Int) {
    if (isSetup) return
    if (attempt > 10) return // Give up after ~5 seconds

    val activity = appContext.currentActivity
    val rootView = activity?.window?.decorView?.rootView

    if (rootView == null) {
      // Activity not ready yet, retry in 500ms
      mainHandler.postDelayed({ setupFocusListenerWithRetry(attempt + 1) }, 500)
      return
    }

    setupFocusListener(rootView)
  }

  private fun setupFocusListener(rootView: View) {
    removeFocusListener()

    focusListener = ViewTreeObserver.OnGlobalFocusChangeListener { oldFocus, newFocus ->
      // Animate old focused view back to normal
      if (oldFocus != null && oldFocus.id > 0) {
        oldFocus.animate()
          .scaleX(SCALE_NORMAL)
          .scaleY(SCALE_NORMAL)
          .translationZ(0f)
          .setDuration(ANIM_DURATION)
          .start()
      }

      // Animate new focused view (scale up + elevation)
      if (newFocus != null && newFocus.id > 0) {
        newFocus.animate()
          .scaleX(SCALE_FOCUSED)
          .scaleY(SCALE_FOCUSED)
          .translationZ(8f)
          .setDuration(ANIM_DURATION)
          .start()
      }

      lastFocusedView = newFocus

      // Emit event to JS for overlay/ring effects
      try {
        val oldTag = if (oldFocus != null && oldFocus.id > 0) oldFocus.id else -1
        val newTag = if (newFocus != null && newFocus.id > 0) newFocus.id else -1

        sendEvent("onTvFocusChanged", mapOf(
          "oldViewTag" to oldTag,
          "newViewTag" to newTag
        ))
      } catch (_: Exception) {
        // Ignore if JS bridge isn't ready
      }
    }

    rootView.viewTreeObserver.addOnGlobalFocusChangeListener(focusListener)
    isSetup = true
  }

  private fun removeFocusListener() {
    if (!isSetup) return

    try {
      val rootView = appContext.currentActivity?.window?.decorView?.rootView
      focusListener?.let { listener ->
        rootView?.viewTreeObserver?.removeOnGlobalFocusChangeListener(listener)
      }
    } catch (_: Exception) {
      // Activity might already be destroyed
    }

    focusListener = null
    lastFocusedView = null
    isSetup = false
  }
}
