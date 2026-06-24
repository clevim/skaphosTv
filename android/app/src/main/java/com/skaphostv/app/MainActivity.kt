package com.skaphostv.app

import android.os.Build
import android.os.Bundle
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
    try {
      val reactContext: ReactContext? =
        (application as? ReactApplication)
          ?.reactNativeHost
          ?.reactInstanceManager
          ?.currentReactContext
      reactContext
        ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("SkaphosKeyDown", keyCode)
    } catch (_: Exception) {
      // bridge ainda não pronto — ignora
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
