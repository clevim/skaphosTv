package expo.modules.tvfocus

import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewParent
import android.view.ViewTreeObserver
import android.view.Window
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.ScrollView
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
        removeRowTrap()
      }
    }
  }

  // ── Navegação por D-pad em fileiras ─────────────────────────────────────────
  // O FocusFinder do Android resolve TODA direção por busca geométrica na janela
  // inteira, entregando a view mais bem pontuada. Numa UI de fileiras isso erra
  // dos dois jeitos:
  //
  //   horizontal — na borda da fileira ele não para, escapa pra um card de outra
  //                fileira (o pulo "pra lugar nenhum" ao segurar direita);
  //   vertical   — pula pro card geometricamente melhor, que numa fileira rolada
  //                pro lado é qualquer um, não o que está sob a coluna atual.
  //
  // Aqui o evento é interceptado antes da Activity: borda de fileira vira beco sem
  // saída na horizontal (troca de fileira é cima/baixo, padrão de UI de TV), e o
  // salto vertical é realinhado com a coluna de origem. Só vale onde existe um
  // scroller horizontal como ancestral — grades verticais (FlatList com
  // numColumns), sidebars e listas verticais seguem com o comportamento nativo.
  private var trappedWindow: Window? = null
  private var originalCallback: Window.Callback? = null

  companion object {
    // Faixa de conteúdo mantida visível além do item focado. Horizontal: ~40% de um
    // card de 160dp, o "espia o próximo" dos trilhos de streaming. Vertical: o bastante
    // para o título da seção acompanhar a fileira em vez de ficar cortado.
    // São os dois números para calibrar se o movimento parecer curto ou exagerado.
    private const val PEEK_ROW_DP = 64
    private const val PEEK_COLUMN_DP = 48
  }

  private fun installRowTrap() {
    val window = appContext.currentActivity?.window ?: return
    val base = window.callback ?: return
    if (base is RowTrapCallback) return
    originalCallback = base
    trappedWindow = window
    window.callback = RowTrapCallback(base, window)
  }

  private fun removeRowTrap() {
    val window = trappedWindow ?: return
    if (window.callback is RowTrapCallback) window.callback = originalCallback
    trappedWindow = null
    originalCallback = null
  }

  private class RowTrapCallback(
    private val base: Window.Callback,
    private val window: Window,
  ) : Window.Callback by base {

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
      // Só ACTION_DOWN: repetição de tecla também chega como DOWN, e consumir o
      // UP de um direcional não muda nada (não há semântica de "clique" nele).
      // Campo de texto fica de fora inteiro: lá os direcionais movem o CURSOR.
      val focused = window.currentFocus
      if (event.action == KeyEvent.ACTION_DOWN && focused != null && focused !is EditText) {
        val dir = directionOf(event.keyCode)
        if (dir != null) {
          val move = resolveMove(focused, dir)
          if (move.consume) return true
          // A folga é calculada aqui, mas APLICADA num post. Este callback roda
          // ANTES de ViewRootImpl.performFocusNavigation — no caminho normal o foco
          // ainda nem se moveu neste ponto, e a rolagem nativa (animada) começa
          // depois. O plano usa coordenadas de conteúdo, que não dependem da
          // rolagem, então continua válido no frame seguinte.
          val breathing = move.destination?.let { planBreathingRoom(it, dir) }
          val handled = if (move.retarget) move.destination!!.requestFocus(dir)
                        else base.dispatchKeyEvent(event)
          if (breathing != null) focused.post(breathing)
          return handled
        }
      }
      return base.dispatchKeyEvent(event)
    }

    /**
     * `consume`     — fica onde está, evento morre aqui.
     * `destination` — view que VAI receber o foco (para calcular a folga de rolagem).
     * `retarget`    — o destino difere do que o Android escolheria; pedimos o foco nós.
     */
    private class Move(val consume: Boolean, val destination: View?, val retarget: Boolean)

    // ── Memória de coluna ───────────────────────────────────────────────────
    // O Android não lembra de qual coluna o foco saiu. Sem isso: você está no 5º
    // card de uma fileira, sobe pro menu do topo, desce de novo — e cai no card
    // embaixo do ITEM DE MENU, não no 5º. É a sensação de "apertei pra baixo e
    // ele foi pro lado". Guardamos o centro horizontal ao sair de uma fileira e
    // usamos ele ao entrar em outra vindo de fora (menu, hero, botão).
    private var columnX = -1
    // Página onde a coluna foi anotada (o scroller vertical que a contém): impede
    // que uma coluna da Home mande o foco pro meio do rail de outra tela.
    private var columnPage: java.lang.ref.WeakReference<View>? = null

    private fun rememberColumn(focused: View) {
      columnX = centerX(focused)
      // Página sem scroller vertical (layout fixo, ex.: tela de série) fica com
      // referência nula — e casa com outro destino também sem scroller.
      columnPage = nearestVerticalScroller(focused)?.let { java.lang.ref.WeakReference<View>(it) }
    }

    private fun columnFor(destinationRow: View, focused: View): Int {
      if (columnX < 0) return centerX(focused)
      val savedPage = columnPage?.get()
      return if (savedPage === nearestVerticalScroller(destinationRow)) columnX
             else centerX(focused)
    }

    private fun resolveMove(focused: View, dir: Int): Move {
      val currentRow = nearestHorizontalScroller(focused)
      // focusSearch é exatamente o que o ViewRootImpl chamaria — prevê o destino
      // real em vez de adivinhar.
      val next = try { focused.focusSearch(dir) } catch (_: Exception) { null }

      if (dir == View.FOCUS_LEFT || dir == View.FOCUS_RIGHT) {
        // Fora de fileira (grade vertical, sidebar, barra de topo): comportamento
        // nativo, que ali já é o certo. Andar de lado FORA de fileira é troca de
        // contexto (outra aba do topo, outro painel) — a coluna velha não vale
        // mais e insistir nela seria pior que não lembrar de nada.
        if (currentRow == null) { columnX = -1; return Move(false, next, false) }
        if (next == null) return Move(true, null, false)
        if (!isDescendantOf(next, currentRow)) {
          // Escapou da fileira. Cair em OUTRA fileira é o pulo diagonal que não
          // queremos (troca de fileira é cima/baixo) — vira beco sem saída. Mas
          // sair para o que está ao lado e não é fileira (a coluna de canais do
          // guia, uma sidebar) é navegação legítima e continua valendo.
          return if (nearestHorizontalScroller(next) != null) Move(true, null, false)
                 else Move(false, next, false)
        }
        // Mesmo DENTRO do scroller o destino pode estar em outra linha: a grade do
        // guia é uma timeline única com todos os canais, então o FocusFinder acha
        // "à direita" um programa de outro canal e a seta anda na diagonal. Andar
        // de lado tem que ficar na linha; trocar de linha é cima/baixo.
        if (overlapsVertically(focused, next)) return Move(false, next, false)
        val sameLine = nearestOnSameLine(currentRow, focused, dir)
        return if (sameLine != null) Move(false, sameLine, true) else Move(true, null, false)
      }

      // Vertical: o destino nativo é o "melhor" geometricamente, o que numa fileira
      // rolada para o lado vira um card qualquer. Corrige para o card da fileira de
      // destino ALINHADO com a coluna de onde o usuário saiu — a memória de coluna
      // que o Android não tem e que faz a navegação parecer previsível.
      if (currentRow != null) rememberColumn(focused)
      if (next == null) return Move(false, null, false)
      val nextRow = nearestHorizontalScroller(next) ?: return Move(false, next, false)
      if (nextRow === currentRow) return Move(false, next, false)
      // Saindo de uma fileira: a coluna é a atual. Entrando vindo de fora (menu,
      // hero, botão): a última coluna usada nesta mesma página, se houver.
      val targetX = if (currentRow != null) centerX(focused) else columnFor(nextRow, focused)
      val aligned = alignedChild(nextRow, targetX, dir)
      if (aligned == null || aligned === next) return Move(false, next, false)
      return Move(false, aligned, true)
    }

    // ── Folga de rolagem ("peek") ───────────────────────────────────────────
    // O Android rola o mínimo para o item focado ficar visível — ou seja, colado
    // na borda da tela. Numa UI de trilhos isso custa duas coisas: o usuário perde
    // a pista de que existe mais conteúdo adiante, e ao descer a fileira nova nasce
    // grudada no rodapé, com o título da seção fora da tela. Aqui o destino é
    // reposicionado deixando uma faixa de respiro — o acabamento que separa um
    // trilho de streaming de uma lista rolando.
    private fun planBreathingRoom(target: View, dir: Int): (() -> Unit)? {
      val horizontal = dir == View.FOCUS_LEFT || dir == View.FOCUS_RIGHT
      val scroller = (if (horizontal) nearestHorizontalScroller(target)
                      else nearestVerticalScroller(target)) ?: return null
      val peek = dp(if (horizontal) PEEK_ROW_DP else PEEK_COLUMN_DP, target)

      val loc = IntArray(2); target.getLocationOnScreen(loc)
      val sLoc = IntArray(2); scroller.getLocationOnScreen(sLoc)

      // Posição do alvo no espaço do CONTEÚDO (independe da rolagem atual)
      val scroll    = if (horizontal) scroller.scrollX else scroller.scrollY
      val start     = (if (horizontal) loc[0] - sLoc[0] else loc[1] - sLoc[1]) + scroll
      val size      = if (horizontal) target.width else target.height
      val viewport  = if (horizontal) scroller.width else scroller.height
      if (viewport <= 0) return null

      val newScroll = when {
        start + size > scroll + viewport - peek -> start + size - viewport + peek
        start < scroll + peek                   -> start - peek
        else                                    -> return null
      }
      // smoothScrollTo já satura nos limites do conteúdo — a folga simplesmente
      // desaparece no primeiro e no último item, que é o comportamento desejado.
      return {
        // Confere que o foco realmente parou onde previmos: se a navegação tomou
        // outro rumo, rolar até aqui só desorientaria.
        if (window.currentFocus === target) {
          if (horizontal) (scroller as HorizontalScrollView).smoothScrollTo(newScroll, 0)
          else (scroller as ScrollView).smoothScrollTo(0, newScroll)
        }
      }
    }

    private fun dp(value: Int, view: View) =
      (value * view.resources.displayMetrics.density).toInt()

    /** Focável da fileira cujo centro horizontal é o mais próximo de `targetX`. */
    private fun alignedChild(row: ViewGroup, targetX: Int, dir: Int): View? {
      val candidates = ArrayList<View>()
      row.addFocusables(candidates, dir, View.FOCUSABLES_ALL)
      var best: View? = null
      var bestDist = Int.MAX_VALUE
      for (v in candidates) {
        if (!v.isShown || v === row) continue
        val d = kotlin.math.abs(centerX(v) - targetX)
        if (d < bestDist) { bestDist = d; best = v }
      }
      return best
    }

    private val tmpLoc = IntArray(2)
    private fun centerX(view: View): Int {
      view.getLocationOnScreen(tmpLoc)
      return tmpLoc[0] + view.width / 2
    }

    private fun top(view: View): Int {
      view.getLocationOnScreen(tmpLoc)
      return tmpLoc[1]
    }

    /** Duas views dividem a mesma linha? (faixas verticais se cruzam na tela) */
    private fun overlapsVertically(a: View, b: View): Boolean {
      val aTop = top(a); val aBottom = aTop + a.height
      val bTop = top(b); val bBottom = bTop + b.height
      return aTop < bBottom && bTop < aBottom
    }

    /** Focável mais próximo na MESMA linha, no sentido pedido. */
    private fun nearestOnSameLine(row: ViewGroup, focused: View, dir: Int): View? {
      val candidates = ArrayList<View>()
      row.addFocusables(candidates, dir, View.FOCUSABLES_ALL)
      val fromX = centerX(focused)
      var best: View? = null
      var bestDist = Int.MAX_VALUE
      for (v in candidates) {
        if (v === row || v === focused || !v.isShown) continue
        if (!overlapsVertically(focused, v)) continue
        val d = centerX(v) - fromX
        val forward = if (dir == View.FOCUS_RIGHT) d > 0 else d < 0
        if (!forward) continue
        val dist = kotlin.math.abs(d)
        if (dist < bestDist) { bestDist = dist; best = v }
      }
      return best
    }

    private fun directionOf(keyCode: Int): Int? = when (keyCode) {
      KeyEvent.KEYCODE_DPAD_LEFT  -> View.FOCUS_LEFT
      KeyEvent.KEYCODE_DPAD_RIGHT -> View.FOCUS_RIGHT
      KeyEvent.KEYCODE_DPAD_UP    -> View.FOCUS_UP
      KeyEvent.KEYCODE_DPAD_DOWN  -> View.FOCUS_DOWN
      else -> null
    }

    /** ScrollView horizontal mais próximo acima do item focado (null = não é fileira). */
    private fun nearestHorizontalScroller(view: View): HorizontalScrollView? {
      var parent: ViewParent? = view.parent
      while (parent != null) {
        // ReactHorizontalScrollView (ScrollView horizontal e FlatList horizontal)
        // estende HorizontalScrollView — cobre os dois com um só teste.
        if (parent is HorizontalScrollView) return parent
        parent = parent.parent
      }
      return null
    }

    /** ScrollView vertical mais próximo — ReactScrollView e FlatList vertical. */
    private fun nearestVerticalScroller(view: View): ScrollView? {
      var parent: ViewParent? = view.parent
      while (parent != null) {
        if (parent is ScrollView) return parent
        parent = parent.parent
      }
      return null
    }

    private fun isDescendantOf(view: View, ancestor: ViewGroup): Boolean {
      var parent: ViewParent? = view.parent
      while (parent != null) {
        if (parent === ancestor) return true
        parent = parent.parent
      }
      return false
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
    // Mesma janela do observer — instala junto, já com a Activity garantida
    installRowTrap()
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
