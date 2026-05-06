# 📺 FluxTV — Cliente IPTV para FireStick, Android TV & Android

Aplicativo cliente IPTV completo, construído com **React Native + Expo**.  
Funciona em: **Amazon FireStick**, **Android TV**, **Google TV**, **celulares e tablets Android**.

---

## ✨ Funcionalidades

- ✅ Suporte a **listas M3U / M3U8** via URL
- ✅ Suporte à **Xtream Codes API** (live, VOD, séries)
- ✅ Navegação por **D-pad / controle remoto** (FireStick/Android TV)
- ✅ Categorias automáticas a partir da lista
- ✅ Sistema de **Favoritos** (persistido no dispositivo)
- ✅ **Histórico** dos canais recentes
- ✅ **Busca** em tempo real por nome e categoria
- ✅ Player com OSD (On-Screen Display) com desaparecimento automático
- ✅ Controles: play/pause, anterior/próximo, mudo, volume
- ✅ Badges de qualidade: SD, HD, FHD, 4K
- ✅ Múltiplas fontes IPTV simultâneas
- ✅ Interface escura otimizada para TV
- ✅ Suporte a logos dos canais via tvg-logo
- ✅ Tela sempre ligada durante reprodução (KeepAwake)
- ✅ Orientação forçada landscape

---

## 🏗️ Estrutura do Projeto

```
fluxtv/
├── App.tsx                        # Entrada + navegação
├── app.json                       # Configurações Expo/Android
├── eas.json                       # Perfis de build (APK, AAB)
├── babel.config.js
├── tsconfig.json
├── package.json
├── assets/
│   ├── icon.png                   # Ícone do app (1024x1024)
│   ├── adaptive-icon.png          # Ícone adaptativo Android
│   └── splash.png                 # Tela de splash
└── src/
    ├── screens/
    │   ├── HomeScreen.tsx          # Tela principal com sidebar + grade de canais
    │   ├── PlayerScreen.tsx        # Player de vídeo com OSD
    │   ├── SetupScreen.tsx         # Adicionar fontes M3U / Xtream
    │   ├── SearchScreen.tsx        # Busca de canais
    │   ├── FavoritesScreen.tsx     # Lista de favoritos
    │   └── SettingsScreen.tsx      # Configurações do app
    ├── components/
    │   ├── TVFocusable.tsx         # Componente focável para D-pad
    │   └── ChannelCard.tsx         # Card de canal na grade
    ├── store/
    │   └── useStore.ts             # Estado global com Zustand + AsyncStorage
    └── utils/
        ├── theme.ts                # Cores, espaçamentos, tipografia
        └── m3uParser.ts            # Parser M3U e helpers Xtream
```

---

## 🚀 Como Gerar o APK

### Pré-requisitos

```bash
# Node.js 18+
node --version

# Instalar Expo CLI e EAS CLI globalmente
npm install -g expo-cli eas-cli

# Fazer login no Expo (gratuito)
eas login
```

### 1. Instalar dependências

```bash
cd fluxtv
npm install
```

### 2. Adicionar os assets

Crie ou copie para a pasta `assets/`:
- `icon.png` — 1024×1024 px (ícone do app)
- `adaptive-icon.png` — 1024×1024 px (ícone adaptativo Android)
- `splash.png` — 1284×2778 px (tela de carregamento)

> Dica: use https://www.appicon.co/ para gerar todos os tamanhos a partir de uma imagem.

### 3. Configurar o projeto EAS

```bash
# Inicializar o projeto no EAS (gera projectId)
eas init

# Isso vai preencher o campo "projectId" no app.json automaticamente
```

### 4. Gerar APK para FireStick / Android TV / Mobile

```bash
# APK direto para instalar (sideload) — recomendado para FireStick
eas build --platform android --profile preview

# Ou APK de debug para testes rápidos
eas build --platform android --profile development
```

O EAS vai compilar na nuvem (gratuito para uso básico) e te dar um link para baixar o `.apk`.

---

## 📲 Como Instalar no FireStick

### Método 1: Downloader (mais fácil)

1. No FireStick: **Configurações → Meu Fire TV → Opções do Desenvolvedor**
2. Ative **"Apps de Fontes Desconhecidas"**
3. Instale o app **Downloader** da Amazon Store
4. Abra o Downloader e digite a URL do APK gerado pelo EAS
5. Clique em **Instalar**

### Método 2: ADB via Wi-Fi

```bash
# No FireStick: Configurações → Meu Fire TV → Opções do Desenvolvedor → Depuração ADB → Ligado

# No computador (substitua o IP pelo do seu FireStick)
adb connect 192.168.1.XXX:5555
adb install fluxtv.apk
```

---

## 📺 Como Instalar no Android TV / Google TV

### Via ADB (recomendado para desenvolvedores)

```bash
# Ative Opções do Desenvolvedor na TV e habilite Depuração USB/ADB
adb connect 192.168.1.XXX:5555
adb install fluxtv.apk
```

### Via Pendrive

1. Copie o `.apk` em um pendrive FAT32
2. Use o gerenciador de arquivos da TV para instalar

---

## 📱 Como Instalar no Android (celular/tablet)

1. Copie o `.apk` para o celular
2. Toque no arquivo → **Instalar**
3. Se necessário, permita instalação de fontes desconhecidas em Configurações

---

## 🏗️ Build para Google Play Store (AAB)

```bash
# Gerar AAB para submeter à Google Play
eas build --platform android --profile production
```

---

## ⚙️ Personalização

### Mudar nome e ID do app

Em `app.json`:
```json
{
  "expo": {
    "name": "SeuApp",
    "slug": "seuapp",
    "android": {
      "package": "com.seuapp.tv"
    }
  }
}
```

### Adicionar mais formatos de stream

Em `PlayerScreen.tsx`, o componente `Video` (expo-av) suporta:
- HLS (`.m3u8`)
- HTTP TS (`.ts`)
- MP4

Para suporte a RTMP ou formatos mais complexos, substitua `expo-av` por `react-native-vlc-media-player`:

```tsx
import VLCPlayer from 'react-native-vlc-media-player';
// ...
<VLCPlayer source={{ uri: channel.url }} style={styles.video} />
```

---

## 🎮 Controles do Controle Remoto (FireStick/Android TV)

| Botão | Ação |
|-------|------|
| D-pad ↑↓←→ | Navegar entre canais |
| OK / Enter | Selecionar / Reproduzir |
| Voltar | Voltar à tela anterior |
| Play/Pause | Pausar/retomar |
| Menu | Abrir OSD do player |

---

## 🛠️ Desenvolvimento local

```bash
# Rodar no emulador Android
npm run android

# Rodar via Expo Go (para testes rápidos no celular)
npx expo start
```

---

## 📦 Dependências principais

| Pacote | Função |
|--------|--------|
| `expo-av` | Player de vídeo nativo |
| `expo-keep-awake` | Tela sempre ligada durante reprodução |
| `expo-screen-orientation` | Força modo paisagem |
| `@react-navigation/native` | Navegação entre telas |
| `zustand` | Estado global simples e performático |
| `@react-native-async-storage/async-storage` | Persistência local |
| `axios` | Requisições HTTP para carregar listas |
| `react-native-safe-area-context` | Áreas seguras em TV e mobile |

---

## 🔧 Solução de Problemas

**"Canal não carrega"**
- Verifique se a URL do stream está acessível na rede do dispositivo
- Alguns streams exigem VPN ou estão protegidos por DRM

**"Lista M3U não parseia"**  
- Confirme que a URL retorna texto iniciando com `#EXTM3U`
- Teste a URL no navegador antes

**"App não aparece no launcher da TV"**  
- Verifique que o `app.json` contém `"android.intent.category.LEANBACK_LAUNCHER"` nas intentFilters ✅ (já configurado)

**"Foco D-pad não funciona"**
- O componente `TVFocusable` gerencia o foco automaticamente
- Em telas com FlatList, use `initialNumToRender` adequado para pré-renderizar itens focáveis
