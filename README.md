<div align="center">

<img src="./assets/icon.png" width="100" alt="SkaphosTV" />

# SkaphosTV

**Player IPTV moderno para Android TV, Firestick e Mobile**

[![React Native](https://img.shields.io/badge/React%20Native-0.74-61DAFB?style=flat-square&logo=react)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-51-000020?style=flat-square&logo=expo)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Platform](https://img.shields.io/badge/Platform-AndroidTV%20%7C%20Firestick%20%7C%20Mobile-3DDC84?style=flat-square&logo=android)](https://github.com/clevim/skaphosTv)

</div>

---

## Sobre

SkaphosTV é um player IPTV completo construído com **React Native + Expo**, projetado especificamente para **Android TV e Firestick**, com suporte total a mobile. Interface escura com tema roxo/violeta, navegação por controle remoto, EPG, catálogo de filmes e séries, e muito mais.

---

## Funcionalidades

| Categoria | Detalhes |
|-----------|----------|
| **Fontes IPTV** | Xtream Codes (usuário/senha) e lista M3U por URL |
| **Ao Vivo** | Canais em tempo real com guia EPG |
| **Filmes** | Catálogo VOD com posters, badges de qualidade e lançamentos |
| **Séries** | Navegação por temporada e episódio, progresso individual |
| **Busca** | Busca em tempo real com card de "Melhor Resultado" |
| **Favoritos** | Minha Lista, Histórico, Gravações e Baixados |
| **Player** | Vídeo full-screen com OSD, sidebar de canais e controle de qualidade |
| **TV Focus** | Navegação por D-pad com anel de foco animado em todos os elementos |
| **EPG** | Grade de canais × horários com programação atual e futura |
| **Temas** | Suporte a temas customizados persistidos no dispositivo |
| **Deep Links** | Abertura direta de séries/canais por URI externa |

---

## Telas

```
Home         →  Hero dinâmico + seções (Ao Vivo / Filmes / Séries / Lançamentos)
Player       →  Player full-screen com OSD e sidebar de canais
Setup        →  Configuração de lista Xtream ou M3U, toggles de opções
Search       →  Busca com melhor resultado + lista de matches
Favorites    →  Minha Lista / Gravações / Histórico / Baixados
Series       →  Hero da série, temporadas, grade de episódios
Detail       →  Detalhes de VOD, tabs Sobre / Mais como este
EPG          →  Grade de programação (TV only)
Settings     →  Preferências visuais e de conta
```

---

## Stack

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| React Native | 0.74 | Base do app |
| Expo | 51 | Build e módulos nativos |
| TypeScript | 5.3 | Tipagem completa |
| Zustand | 4.5 | Estado global |
| React Navigation | 6 | Navegação entre telas |
| react-native-video | 6.0 | Player de vídeo |
| Expo Linear Gradient | 13 | Gradientes |
| Geist Font | 1.7 | Tipografia |
| react-native-reanimated | 3.10 | Animações |
| expo-screen-orientation | 7 | Landscape na TV |

---

## Instalação

### Pré-requisitos

- Node.js 18+
- npm
- Conta [Expo](https://expo.dev) (para builds via EAS)

```bash
# Clonar o repositório
git clone https://github.com/clevim/skaphosTv.git
cd skaphosTv

# Instalar dependências
npm install

# Iniciar em modo desenvolvimento
npm start
```

### Build APK (Android TV / Firestick)

```bash
# Login no Expo (necessário para EAS)
eas login

# APK para sideload (Firestick / AndroidTV)
npm run build:apk

# AAB para Google Play
npm run build:aab
```

---

## Configuração da Lista IPTV

Na tela de **Setup**, escolha o tipo de fonte:

**Xtream Codes**
```
Servidor:  http://seu-servidor.com
Usuário:   seu_usuario
Senha:     sua_senha
```

**M3U**
```
URL:  http://seu-servidor.com/lista.m3u
```

---

## Instalação nos Dispositivos

### Firestick

1. **Configurações → Meu Fire TV → Opções do Desenvolvedor** → Ative "Apps de Fontes Desconhecidas"
2. Instale o app **Downloader** da Amazon Store
3. Abra o Downloader, insira a URL do APK gerado pelo EAS e instale

```bash
# Ou via ADB Wi-Fi
adb connect 192.168.1.XXX:5555
adb install skaphostv.apk
```

### Android TV / Google TV

```bash
# Ative Depuração ADB nas Opções do Desenvolvedor da TV
adb connect 192.168.1.XXX:5555
adb install skaphostv.apk
```

### Android Mobile

Copie o `.apk` para o celular e toque em **Instalar** (permita fontes desconhecidas se solicitado).

---

## Controles do Controle Remoto

| Botão | Ação |
|-------|------|
| D-pad ↑↓←→ | Navegar entre elementos |
| OK / Enter | Selecionar / Reproduzir |
| Voltar | Tela anterior |
| Play/Pause | Pausar / Retomar |
| Menu | Abrir OSD do player |

---

## Estrutura do Projeto

```
skaphostv/
├── src/
│   ├── screens/          # Telas da aplicação
│   ├── components/       # Componentes reutilizáveis
│   ├── store/            # Zustand stores (canais, tema, favoritos)
│   ├── hooks/            # Custom hooks (fontes, filtros, EPG)
│   ├── utils/            # Helpers (tvDetect, formatação)
│   └── types/            # Tipos TypeScript globais
├── modules/
│   └── tv-focus/         # Módulo nativo de foco para TV
├── assets/               # Ícones, splash, fontes
└── App.tsx               # Entry point + navegação + deep links
```

---

## Compatibilidade

| Plataforma | Suporte |
|------------|---------|
| Android TV | Completo — D-pad, focus ring, layout two-panel |
| Firestick | Completo |
| Android Mobile | Layout adaptativo completo |
| iOS | Parcial — player pode exigir ajustes |
| Web | Experimental |

---

<div align="center">

Feito com escuridão, roxo e caffeine ☕

</div>
