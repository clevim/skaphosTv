package com.skaphostv.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Ponte JS → nativo para a permissão de INSTALAR APK.
 *
 * `REQUEST_INSTALL_PACKAGES` está no manifesto desde sempre, mas do Android 8 em
 * diante ela não é concedida na instalação: é uma permissão especial que o
 * usuário precisa ligar por app, em "Instalar apps desconhecidos". Sem ela, o
 * Intent do instalador simplesmente não instala nada — em alguns aparelhos nem
 * diálogo aparece.
 *
 * Era isso que fazia a atualização automática "não funcionar" numa Fire Stick
 * recém-configurada: o app baixava o APK inteiro, abria o instalador e o
 * usuário não via nada acontecer. Aqui o app pergunta ANTES de baixar e sabe
 * levar o usuário à tela certa.
 */
class InstallerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SkaphosInstaller"

  /**
   * O app pode instalar APKs agora?
   *
   * Abaixo do Android 8 a permissão é global (Fontes desconhecidas nos Ajustes)
   * e não há API para consultá-la por app — resolve true e deixa o Intent do
   * instalador falar por si, que é o comportamento que sempre valeu ali.
   */
  @ReactMethod
  fun canInstallPackages(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.resolve(true)
      return
    }
    promise.resolve(
      try { reactApplicationContext.packageManager.canRequestPackageInstalls() }
      catch (_: Exception) { false },
    )
  }

  /**
   * Abre a tela onde o usuário liga a permissão.
   *
   * A tela por app (MANAGE_UNKNOWN_APP_SOURCES) é a certa e já vem com o
   * SkaphosTV selecionado. Nem toda build de Fire OS a expõe, então há queda
   * para os ajustes de segurança e, no limite, para os ajustes gerais — melhor
   * abrir a tela errada que não abrir nada.
   *
   * @return true se alguma tela abriu.
   */
  @ReactMethod
  fun openInstallPermissionSettings(promise: Promise) {
    val ctx = reactApplicationContext
    val candidates = mutableListOf<Intent>()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      candidates += Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:${ctx.packageName}"),
      )
    }
    candidates += Intent(Settings.ACTION_SECURITY_SETTINGS)
    candidates += Intent(Settings.ACTION_SETTINGS)

    for (intent in candidates) {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      // resolveActivity antes de startActivity: um Intent sem quem o atenda
      // derruba o app com ActivityNotFoundException em vez de cair no próximo.
      if (intent.resolveActivity(ctx.packageManager) == null) continue
      try {
        ctx.startActivity(intent)
        promise.resolve(true)
        return
      } catch (_: Exception) {
        // tenta o próximo candidato
      }
    }
    promise.resolve(false)
  }
}
