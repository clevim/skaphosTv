package com.skaphostv.app

import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import android.util.Rational
import android.view.KeyEvent

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  companion object {
    private const val ACTION_PIP_CONTROL = "com.skaphostv.app.PIP_CONTROL"
    private const val EXTRA_CONTROL = "control"
  }

  /** Ligado pelo PipModule (JS) enquanto um vídeo não-ao-vivo está em reprodução.
   *  Quando true, sair do app (onUserLeaveHint) entra em Picture-in-Picture. */
  var pipEnabled = false

  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Encaminha as teclas do controle remoto para o JS via RCTDeviceEventEmitter
   * ('SkaphosKeyDown'). Necessário porque a prop onKeyDown da <View> não é suportada
   * em RN puro — o PlayerScreen ouve esse evento para fazer seek/scrubbing no D-pad.
   * dispatchKeyEvent vê toda tecla ANTES do sistema de foco; chamamos super em seguida
   * para preservar a navegação de foco normal.
   */
  // Throttle das REPETIÇÕES de tecla (segurar o D-pad). Sem isso, cada repeat enfileira
  // um evento no bridge e, ao soltar, o JS continua processando os pendentes → o seek
  // "passa do ponto" (overshoot). Limitando a ~1 a cada REPEAT_THROTTLE_MS, a fila fica
  // rasa e o avanço para logo ao soltar. O primeiro toque (repeatCount==0) sempre passa.
  private var lastRepeatEmitMs = 0L
  private val REPEAT_THROTTLE_MS = 130L

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_DOWN) {
      when (event.keyCode) {
        KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
        KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER,
        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, KeyEvent.KEYCODE_MEDIA_REWIND,
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY,
        KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MENU -> {
          if (event.repeatCount == 0) {
            emitKeyEvent(event.keyCode)
          } else {
            val now = android.os.SystemClock.uptimeMillis()
            if (now - lastRepeatEmitMs >= REPEAT_THROTTLE_MS) {
              lastRepeatEmitMs = now
              emitKeyEvent(event.keyCode)
            }
          }
        }
      }
    }
    return super.dispatchKeyEvent(event)
  }

  private fun emitKeyEvent(keyCode: Int) {
    emitEvent("SkaphosKeyDown", keyCode)
  }

  private fun emitEvent(name: String, value: Any) {
    try {
      val reactContext: ReactContext? =
        (application as? ReactApplication)
          ?.reactNativeHost
          ?.reactInstanceManager
          ?.currentReactContext
      reactContext
        ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit(name, value)
    } catch (_: Exception) {
      // bridge ainda não pronto — ignora
    }
  }

  // ── Picture-in-Picture ────────────────────────────────────────────────────────
  // Entra em PiP ao sair do app (Home/recents) enquanto um vídeo não-ao-vivo toca.
  // A janela do PiP ganha um botão de play/pause (RemoteAction) ligado ao player JS;
  // o "expandir" e o "fechar" são providos pelo próprio sistema.
  private var pipIsPlaying = true
  private var pipReceiver: BroadcastReceiver? = null

  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    enterPipNow()
  }

  // Em alguns aparelhos o "X" do PiP chama finish() na Activity; nesses casos
  // isFinishing fica true no onStop e encerramos por aqui. (O botão voltar usa
  // moveTaskToBack, não finish — ver invokeDefaultOnBackPressed.)
  // Na MAIORIA dos aparelhos, porém, o X só descarta a janela e PARA a Activity
  // sem finish() — esse caso é detectado em onPictureInPictureModeChanged pelo
  // estado do lifecycle (ver closePipApp).
  override fun onStop() {
    super.onStop()
    if (isFinishing) closePipApp()
  }

  /** Encerra o app de verdade após o X do PiP: avisa o JS pra pausar o player
   *  (SkaphosPipClosed), remove a task dos recentes e mata o processo — o delay
   *  curto dá tempo do pause do JS rodar antes do killProcess. */
  private fun closePipApp() {
    emitEvent("SkaphosPipClosed", true)
    finishAndRemoveTask()
    android.os.Handler(mainLooper).postDelayed({
      android.os.Process.killProcess(android.os.Process.myPid())
    }, 300)
  }

  /** Monta a action de play/pause exibida na janela do PiP. */
  private fun buildPipActions(): ArrayList<RemoteAction> {
    val actions = ArrayList<RemoteAction>()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return actions
    val iconRes = if (pipIsPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
    val label = if (pipIsPlaying) "Pausar" else "Reproduzir"
    val intent = Intent(ACTION_PIP_CONTROL)
      .setPackage(packageName)
      .putExtra(EXTRA_CONTROL, "playpause")
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or PendingIntent.FLAG_IMMUTABLE
    val pi = PendingIntent.getBroadcast(this, 1, intent, flags)
    actions.add(RemoteAction(Icon.createWithResource(this, iconRes), label, label, pi))
    return actions
  }

  private fun buildPipParams(): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) builder.setActions(buildPipActions())
    return builder.build()
  }

  /** Entra em PiP se habilitado e suportado. Chamado por onUserLeaveHint e pelo PipModule. */
  fun enterPipNow() {
    if (!pipEnabled) return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (!packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) return
    try {
      enterPictureInPictureMode(buildPipParams())
    } catch (_: Exception) {
      // alguns aparelhos recusam PiP em certos estados — ignora
    }
  }

  /** Atualiza o ícone play/pause da janela do PiP (chamado pelo JS quando o estado muda). */
  fun setPipPlaying(playing: Boolean) {
    pipIsPlaying = playing
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isInPictureInPictureMode) {
      try { setPictureInPictureParams(buildPipParams()) } catch (_: Exception) {}
    }
  }

  // Avisa o JS para esconder o OSD/controles em PiP, e (des)registra o receiver da action.
  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    emitEvent("SkaphosPipChanged", isInPictureInPictureMode)
    // Saiu do PiP com a Activity ainda PARADA (onStop rodou antes deste callback)
    // → o usuário fechou pelo "X" do sistema. Se ele expandiu de volta pro app,
    // o lifecycle está STARTED/RESUMED e nada acontece.
    if (!isInPictureInPictureMode &&
        lifecycle.currentState == androidx.lifecycle.Lifecycle.State.CREATED) {
      closePipApp()
    }
    if (isInPictureInPictureMode) {
      if (pipReceiver == null) {
        pipReceiver = object : BroadcastReceiver() {
          override fun onReceive(c: Context?, i: Intent?) {
            if (i?.getStringExtra(EXTRA_CONTROL) == "playpause") emitEvent("SkaphosPipAction", "playpause")
          }
        }
        val filter = IntentFilter(ACTION_PIP_CONTROL)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          registerReceiver(pipReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
          @Suppress("UnspecifiedRegisterReceiverFlag")
          registerReceiver(pipReceiver, filter)
        }
      }
    } else {
      pipReceiver?.let { runCatching { unregisterReceiver(it) } }
      pipReceiver = null
    }
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
