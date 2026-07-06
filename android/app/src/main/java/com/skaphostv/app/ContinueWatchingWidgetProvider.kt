package com.skaphostv.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray

/**
 * Widget "Continue assistindo" — até 3 itens em progresso, texto simples (sem
 * poster: RemoteViews não tem uma pipeline de bitmap de rede pronta, fica pra
 * uma v2 se fizer falta). Toque abre o app no item certo via o mesmo deep link
 * (com.skaphostv.app://open?...) que os outros fluxos (compartilhar, etc.) já usam
 * — pra série, cai na SeriesScreen, que já resolve sozinha o episódio certo.
 */
class ContinueWatchingWidgetProvider : AppWidgetProvider() {
  companion object {
    const val PREFS = "skaphostv_widget"
    const val KEY_ITEMS = "continue_watching_json"
    private const val MAX_ITEMS = 3
    private val ROW_IDS   = intArrayOf(R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3)
    private val TITLE_IDS = intArrayOf(R.id.widget_title_1, R.id.widget_title_2, R.id.widget_title_3)
    private val SUB_IDS   = intArrayOf(R.id.widget_sub_1, R.id.widget_sub_2, R.id.widget_sub_3)

    fun updateAll(context: Context, mgr: AppWidgetManager, ids: IntArray) {
      val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ITEMS, null)
      val items = parseItems(json)
      val views = buildViews(context, items)
      for (id in ids) mgr.updateAppWidget(id, views)
    }

    private fun parseItems(json: String?): List<Triple<String, String, String>> {
      if (json.isNullOrBlank()) return emptyList()
      return try {
        val arr = JSONArray(json)
        (0 until minOf(arr.length(), MAX_ITEMS)).map { i ->
          val o = arr.getJSONObject(i)
          Triple(o.getString("name"), o.optString("sub", ""), o.getString("deepLink"))
        }
      } catch (_: Exception) {
        emptyList()
      }
    }

    private fun buildViews(context: Context, items: List<Triple<String, String, String>>): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.widget_continue_watching)
      views.setViewVisibility(R.id.widget_empty, if (items.isEmpty()) View.VISIBLE else View.GONE)

      for (i in ROW_IDS.indices) {
        val item = items.getOrNull(i)
        if (item == null) {
          views.setViewVisibility(ROW_IDS[i], View.GONE)
          continue
        }
        views.setViewVisibility(ROW_IDS[i], View.VISIBLE)
        views.setTextViewText(TITLE_IDS[i], item.first)
        views.setTextViewText(SUB_IDS[i], item.second)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(item.third)).setPackage(context.packageName)
        val pi = PendingIntent.getActivity(
          context, i, intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        views.setOnClickPendingIntent(ROW_IDS[i], pi)
      }
      return views
    }
  }

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    updateAll(context, appWidgetManager, appWidgetIds)
  }
}
