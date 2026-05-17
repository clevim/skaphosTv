# SkaphosTV — Design Implementation TODO

Referência: design bundle `/tmp/skaphostv/project/` (tv.jsx, mobile.jsx, styles.css)

---

## ✅ Concluído

- [x] `SetupScreen` — remover stepper multi-passo, tela única com tabs Xtream / M3U
- [x] `TVTopBar` — corrigir key `'films'→'movies'`, adicionar categoria `year` (2026)
- [x] `BottomTabBar` — adicionar Filmes, Séries, 2026 com scroll horizontal
- [x] `HomeContent` — seções Ao Vivo / Filmes / Séries / Lançamentos 2026
- [x] `HomeContent` — `PulsingDot` animado no badge LIVE (LiveCard + hero)
- [x] `HomeContent` — progress bar determinístico (sem Math.random)
- [x] `HomeContent` — hero aparece mesmo sem recentChannels (fallback para channels[0])
- [x] `HomeContent` — hero TV full-bleed + gradiente horizontal (esquerda → direita)
- [x] `HomeContent` — hero badge diferente por tipo (AO VIVO / FILME / SÉRIE)
- [x] `HomeContent` — botões hero com texto "Lista" + "Detalhes" no TV
- [x] `HomeContent` — hero TV: conteúdo posicionado à esquerda (52% da largura, justifyContent: flex-end)
- [x] `SetupScreen` — seção de opções/toggles (Sincronizar EPG, Backup, Filtrar adultos) com toggle animado
- [x] `HomeContent` — `VodCard` com badge "NOVO" (isLaunchYear) e badge de qualidade nos posters
- [x] `RemoteHints` — componente criado e conectado no HomeScreen (TV only, bottom-right)

---

## 📋 Pendente — Visual / UI

- [x] `HomeContent` — hero mobile: gradiente horizontal sutil (esquerda→direita, 50% largura)
- [x] `LiveCard` — borda vertical accent (#ef4444) no lado esquerdo do card
- [x] `TVTopBar` — `position: 'absolute'` + `zIndex: 10`, hero bleeding por baixo; `paddingTop: 88` no scroll

- [x] `PulsingDot` — extraído para componente compartilhado (`src/components/PulsingDot.tsx`)
- [x] `TVFocusable` — `borderWidth` animado (0→2.5px) + `borderColor` `transparent→accent` no focus
- [x] `PlayerOSD` — live dot substituído por `PulsingDot` animado
- [x] `SearchContent` — redesign completo: card "Melhor resultado" + lista de rows com tipo/nome/sub
- [x] `HomeContent` — chips de categoria clicáveis (detecta tipo do grupo → navega para live/movies/series)

### Baixa prioridade
- [x] Botões secundários — `GlassButton`: `backdropFilter: blur(12px)` no web, `rgba(255,255,255,0.06)` no RN
- [x] Fonte Geist — `geist` npm instalado, TTFs em `assets/fonts/`, `useGeistFonts` hook, `fontFamily` exportado do tema, aplicado nos títulos principais

---

## 📺 Telas TV faltando (do design)

- [x] TV EPG — `TVEPGScreen`: grid canais × horários, placeholder de programação, botão no TVTopBar
- [x] TV Channel Switcher — `PlayerSidebar` cobre o caso (lista esquerda + vídeo direita no Player)
- [x] TV Catalog — `TVCatalogLayout`: dois painéis (sidebar com grupos + grid FlatList), usado no HomeScreen TV
- [x] TV Detail Screen — `DetailScreen` com branch IS_TV: backdrop 60% + painel metadata 40%
- [x] TV Voice Search — `TVSearchContent`: pulsing rings Animated + input + lista de resultados à direita
- [x] TV Settings Screen — `SettingsScreen` com branch IS_TV: sidebar categorias + painel direito

---

## 📱 Telas Mobile faltando/incompletas

- [x] Detail Screen — `DetailScreen`: tabs (Sobre / Mais como este) + grid de relacionados
- [x] Library Screen — `FavoritesScreen` já tem tabs (Minha Lista / Gravações / Histórico / Baixados)
- [x] Settings Screen — toggles de aparência implementados (`SettingsScreen` + `SetupScreen`)

---

## 🔧 Fixes de responsividade e UX

- [x] `adaptive-icon.png` — fundo branco substituído por `#0a0810` (cor de fundo do app)
- [x] `HomeScreen` — `Dimensions.get` estático substituído por `useWindowDimensions` (reativo a rotação/resize)
- [x] `HomeScreen` — chips de categoria envolvidos em `ScrollView` horizontal (sem truncar grupos)
- [x] `SeriesScreen` — tabs de temporada com `ScrollView` horizontal (suporta muitas temporadas)

---

## 📺 Navegação TV (Firestick / AndroidTV)

- [x] `TVFocusable` — prop `borderRadius` adicionada para anel de foco respeitar a forma do elemento (botão circular, card, tab, etc.)
- [x] `FormField` — `onFocus`/`onBlur` no `TextInput`: borda accent + glow quando o campo está ativo (TV e mobile)
- [x] `FormField` TV — wrapper `TVFocusable` com `onPress → inputRef.focus()` + badge "digitando" quando ativo
- [x] `SetupScreen` TV — layout **two-panel** (formulário esquerda 60% / opções+fontes direita 40%), sem `maxWidth 480`
- [x] `SetupScreen` TV — tabs com ícone + texto, padding maior, texto 16–20px para distância de visualização
- [x] `SetupScreen` TV — `RemoteHints` no rodapé com dicas contextuais (OK / ↑↓←→ / ⬅)
- [x] `SetupScreen` TV — `SetupOptionRow` maior (toggle 52×30, fonte 16px)
- [x] `SetupScreen` TV — campo APELIDO (xName) adicionado ao form Xtream para identificar a fonte

---

## 🐛 Bugs conhecidos

- [x] `useChannelFilter` — `isLaunchYear` agora aceita `group` como 2º argumento; filtro checa nome E grupo do canal
- [x] Hero badge cor — `heroVodBadge` (purple) já sobrescreve o red para filmes/séries ✓

---

## ✅ SeriesScreen (implementado a partir do design)

- [x] **Mobile**: hero 420px + gradiente + botão de navegação flutuante + badge "SÉRIE ORIGINAL"
- [x] **Mobile**: botão "Continuar / Assistir T1·E01" full-width + barra de progresso
- [x] **Mobile**: ações secundárias com `GlassButton` (Lista, Baixar, Gravar, Indicar)
- [x] **Mobile**: sinopse + grade de metadados (Gênero, Temporadas, Episódios)
- [x] **Mobile**: tabs de temporada (estilo pill group) + contagem de episódios
- [x] **Mobile**: lista de episódios com thumb 110×64 + badge "EM CURSO" + progresso no episódio atual
- [x] **TV**: backdrop full-bleed + gradiente vertical + gradiente horizontal (esquerda → direita)
- [x] **TV**: bloco de título à esquerda (badge, título Geist-SemiBold 52px, meta, sinopse)
- [x] **TV**: pills de temporada + contagem de episódios
- [x] **TV**: rail horizontal de episódios na base (card 268×150, play overlay no focado, sinopse expandida)
