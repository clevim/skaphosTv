package com.skaphostv.app

import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Ponte JS → nativo para o Picture-in-Picture (Android).
 * O PlayerScreen liga o PiP ao entrar num vídeo (não ao vivo) e desliga ao sair;
 * o MainActivity entra em PiP automaticamente quando o usuário sai do app
 * (onUserLeaveHint) e este flag está ligado.
 */
class PipModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SkaphosPip"

  /** Liga/desliga a entrada automática em PiP ao sair do app. */
  @ReactMethod
  fun setEnabled(enabled: Boolean) {
    val activity = currentActivity as? MainActivity ?: return
    activity.runOnUiThread { activity.pipEnabled = enabled }
  }

  /** Entra em PiP imediatamente (uso opcional, ex.: botão dedicado). */
  @ReactMethod
  fun enter() {
    val activity = currentActivity as? MainActivity ?: return
    activity.runOnUiThread { activity.enterPipNow() }
  }

  /** Atualiza o ícone play/pause da janela do PiP conforme o estado do player. */
  @ReactMethod
  fun setPlaying(playing: Boolean) {
    val activity = currentActivity as? MainActivity ?: return
    activity.runOnUiThread { activity.setPipPlaying(playing) }
  }

  /** Resolve true se o aparelho suporta PiP (SDK >= 26 e feature presente). */
  @ReactMethod
  fun isSupported(promise: Promise) {
    val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      reactApplicationContext.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
    promise.resolve(supported)
  }

  // Necessários para o NativeEventEmitter do JS não reclamar (eventos vêm via
  // RCTDeviceEventEmitter 'SkaphosPipChanged', emitido pelo MainActivity).
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}
