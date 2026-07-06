package com.skaphostv.app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Ponte JS → widget "Continue assistindo". O widget não tem acesso ao
 * AsyncStorage do RN, então o JS empurra os itens (nome, legenda, deep link)
 * já prontos toda vez que mudam; aqui só grava em SharedPreferences e manda
 * o Android redesenhar o widget na hora (sem esperar o próximo updatePeriodMillis).
 */
class WidgetBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SkaphosWidget"

  @ReactMethod
  fun updateContinueWatching(json: String) {
    val ctx = reactApplicationContext
    ctx.getSharedPreferences(ContinueWatchingWidgetProvider.PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(ContinueWatchingWidgetProvider.KEY_ITEMS, json)
      .apply()

    val mgr = AppWidgetManager.getInstance(ctx)
    val ids = mgr.getAppWidgetIds(ComponentName(ctx, ContinueWatchingWidgetProvider::class.java))
    if (ids.isNotEmpty()) ContinueWatchingWidgetProvider.updateAll(ctx, mgr, ids)
  }
}
