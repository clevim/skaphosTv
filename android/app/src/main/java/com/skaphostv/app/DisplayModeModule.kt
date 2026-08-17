package com.skaphostv.app

import android.os.Build
import android.view.Display
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlin.math.abs

/**
 * AFR — casa a taxa de atualização da TV com a do vídeo.
 *
 * O problema: filme a 23,976 fps numa saída travada em 60 Hz não divide certo.
 * O aparelho repete quadros em 3:2 (um quadro dura 3 atualizações, o próximo 2)
 * e o movimento ganha um solavanco periódico — o "microtravamento" que nenhum
 * ajuste de buffer resolve, porque não falta dado nenhum: é a saída de vídeo.
 *
 * A correção é trocar o modo do display para um múltiplo do fps do conteúdo
 * (24p → 24/48/120 Hz; 25p/PAL → 50 Hz; 30p → 60 Hz) e restaurar ao sair. A TV
 * pisca uma vez durante a troca — por isso é opcional nos Ajustes, e por isso
 * trocamos apenas quando o ganho é real (ver [refreshScore]).
 *
 * Só mexe na taxa: mantém resolução e proporção do modo atual, que é o que
 * evita a maioria dos problemas de HDMI/TV com modos exóticos.
 */
class DisplayModeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SkaphosDisplay"

  /** Modo em que a TV estava antes da primeira troca — restaurado ao sair do player. */
  private var originalModeId: Int? = null

  /**
   * Quão bem uma taxa de atualização serve um conteúdo de `fps`.
   * Menor é melhor; [Float.MAX_VALUE] = não serve.
   *
   * O critério é o resto da divisão: 59,94 Hz para 23,976 fps dá 2,5 quadros por
   * atualização — cadência quebrada. 47,952 Hz dá exatamente 2. Toleramos 1 % de
   * desvio porque as taxas reais são 59,94/23,976 e afins, nunca redondas.
   *
   * Comportamento resultante (conferido caso a caso):
   *   60 Hz, filme 24p, TV com 24     → troca pra 24     (tira o 3:2)
   *   60 Hz, filme 24p, TV só 50/60   → NÃO troca        (nada serve; 3:2 fica)
   *   60 Hz, série PAL 25p            → troca pra 50
   *   60 Hz, conteúdo 30p ou 60p      → NÃO troca        (já é múltiplo inteiro)
   *   48 Hz, filme 24p                → NÃO troca        (2:1 já está certo)
   *   60 Hz, 24p, TV com 24/48/120    → troca pra 24     (menor múltiplo)
   */
  private fun refreshScore(refreshRate: Float, fps: Float): Float {
    if (refreshRate <= 0f || fps <= 0f) return Float.MAX_VALUE
    val ratio = refreshRate / fps
    if (ratio < 0.99f) return Float.MAX_VALUE          // TV mais lenta que o conteúdo
    val nearest = Math.round(ratio).toFloat()
    val error = abs(ratio - nearest) / nearest
    if (error > 0.01f) return Float.MAX_VALUE          // cadência quebrada (ex.: 2,5)
    // Empate entre múltiplos válidos: prefere o menor (24 Hz antes de 120 Hz) —
    // menos trabalho pro painel e menos chance de interpolação da TV entrar no meio.
    return nearest + error * 100f
  }

  /**
   * Troca o modo do display para o melhor múltiplo de `fps`.
   * Resolve o Hz efetivo, ou 0 se nada mudou (sem suporte, sem modo melhor, já ok).
   */
  @ReactMethod
  fun matchFrameRate(fps: Double, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || fps <= 0.0) {
      promise.resolve(0.0)
      return
    }
    val activity = currentActivity
    if (activity == null) { promise.resolve(0.0); return }

    activity.runOnUiThread {
      try {
        val window = activity.window
        val display = window?.decorView?.display
        if (window == null || display == null) { promise.resolve(0.0); return@runOnUiThread }

        val current = display.mode
        // Só modos com a MESMA resolução: trocar resolução junto é o que costuma
        // brigar com o HDMI da TV (e o upscale do aparelho já está calibrado).
        val candidates = display.supportedModes.filter {
          it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight
        }
        if (candidates.size <= 1) { promise.resolve(0.0); return@runOnUiThread }

        // Modo atual JÁ entrega cadência inteira (24p em 48 Hz, 25p em 50 Hz…):
        // não há judder pra corrigir, e trocar só piscaria a tela de graça.
        if (refreshScore(current.refreshRate, fps.toFloat()) != Float.MAX_VALUE) {
          promise.resolve(0.0); return@runOnUiThread
        }

        val target = candidates.minByOrNull { refreshScore(it.refreshRate, fps.toFloat()) }
        if (target == null || refreshScore(target.refreshRate, fps.toFloat()) == Float.MAX_VALUE) {
          // Nenhum modo serve (ex.: filme 24p numa TV que só faz 50/60 Hz) —
          // fica como está: 3:2 é ruim, mas piscar a tela sem ganho é pior.
          promise.resolve(0.0); return@runOnUiThread
        }

        if (originalModeId == null) originalModeId = current.modeId
        window.attributes = window.attributes.apply { preferredDisplayModeId = target.modeId }
        promise.resolve(target.refreshRate.toDouble())
      } catch (_: Exception) {
        promise.resolve(0.0)
      }
    }
  }

  /** Volta ao modo em que a TV estava antes do player. */
  @ReactMethod
  fun restore() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val activity = currentActivity ?: return
    val modeId = originalModeId ?: return
    originalModeId = null
    activity.runOnUiThread {
      try {
        val window = activity.window ?: return@runOnUiThread
        window.attributes = window.attributes.apply { preferredDisplayModeId = modeId }
      } catch (_: Exception) {
      }
    }
  }

  /**
   * true se a TV expõe mais de uma taxa na resolução atual. Serve pra tela de
   * Ajustes explicar que o aparelho não suporta, em vez de deixar um botão morto.
   */
  @ReactMethod
  fun isSupported(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) { promise.resolve(false); return }
    val activity = currentActivity
    if (activity == null) { promise.resolve(false); return }
    activity.runOnUiThread {
      try {
        val display = activity.window?.decorView?.display
        if (display == null) { promise.resolve(false); return@runOnUiThread }
        val current = display.mode
        val rates = display.supportedModes
          .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
          .map { Math.round(it.refreshRate * 1000f) }   // milihertz: 59.94 e 59.940002 são a mesma taxa
          .toSet()
        promise.resolve(rates.size >= 2)
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }
}
