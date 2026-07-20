package expo.modules.tvfocus

import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewTreeObserver
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerModule
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TvFocusModule : Module() {

  // Uma janela (rootView) → um listener. A Activity é uma janela; cada Modal do
  // RN abre um Dialog com decorView PRÓPRIA — sem observar cada root, o foco
  // dentro de modais nunca chegava ao JS (o "sem highlight" nos modais da TV).
  private val watched = HashMap<View, ViewTreeObserver.OnGlobalFocusChangeListener>()
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("TvFocus")

    Events("onTvFocusChanged")

    // Called from JS after Activity is ready
    Function("activate") {
      mainHandler.post { watchActivityRootWithRetry(0) }
    }

    // Garante o observer na janela onde a view `viewTag` vive. Para views da
    // Activity é no-op (root já observado); para views dentro de um Modal
    // registra o observer na decorView do Dialog.
    Function("watchView") { viewTag: Int ->
      mainHandler.post { watchRootOf(viewTag) }
    }

    OnDestroy {
      mainHandler.post {
        for ((root, listener) in watched) {
          try { root.viewTreeObserver.removeOnGlobalFocusChangeListener(listener) } catch (_: Exception) {}
        }
        watched.clear()
      }
    }
  }

  private fun watchActivityRootWithRetry(attempt: Int) {
    if (attempt > 10) return // Give up after ~5 seconds

    val root = appContext.currentActivity?.window?.decorView?.rootView
    if (root == null) {
      // Activity not ready yet, retry in 500ms
      mainHandler.postDelayed({ watchActivityRootWithRetry(attempt + 1) }, 500)
      return
    }
    attach(root)
  }

  private fun watchRootOf(viewTag: Int) {
    val reactContext = appContext.reactContext as? ReactContext ?: return
    // resolveView precisa da UI thread — estamos nela (mainHandler)
    val view = try {
      reactContext.getNativeModule(UIManagerModule::class.java)?.resolveView(viewTag)
    } catch (_: Exception) { null } ?: return
    attach(view.rootView ?: return)
  }

  private fun attach(root: View) {
    if (watched.containsKey(root)) return

    // Sem animação nativa aqui: o TVFocusable (JS) já anima o foco. As duas
    // juntas disputavam scaleX/scaleY da MESMA view a cada movimento do D-pad
    // (nativo ia a 1.08, o spring do JS a 1.05) — trabalho dobrado e visual
    // inconsistente.
    val listener = ViewTreeObserver.OnGlobalFocusChangeListener { oldFocus, newFocus ->
      try {
        sendEvent("onTvFocusChanged", mapOf(
          "oldViewTag" to (if (oldFocus != null && oldFocus.id > 0) oldFocus.id else -1),
          "newViewTag" to (if (newFocus != null && newFocus.id > 0) newFocus.id else -1)
        ))
      } catch (_: Exception) {
        // Ignore if JS bridge isn't ready
      }
    }
    root.viewTreeObserver.addOnGlobalFocusChangeListener(listener)
    watched[root] = listener

    // Modal fechado → decorView sai da janela → remove o observer sozinho
    root.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
      override fun onViewAttachedToWindow(v: View) {}
      override fun onViewDetachedFromWindow(v: View) {
        watched.remove(v)?.let { l ->
          try { v.viewTreeObserver.removeOnGlobalFocusChangeListener(l) } catch (_: Exception) {}
        }
        v.removeOnAttachStateChangeListener(this)
      }
    })
  }
}
