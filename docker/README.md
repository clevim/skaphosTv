# Docker — SkaphosTV

Mesmo codebase, dois alvos:

| Alvo | Para quê | Roda onde |
|------|----------|-----------|
| **APK** (`Dockerfile.android`) | Celular **e FireStick / Android TV** | No aparelho, via sideload |
| **Webapp** (`docker-compose.yml`) | Acesso pelo navegador | Container (nginx) |

> ⚠️ **Importante:** Docker **não roda** o app do FireStick — FireStick é Android e executa o **APK**. O Docker aqui (a) **compila** o APK e (b) **serve** a versão web. São coisas distintas.

---

## 1. Webapp (navegador)

```bash
docker compose up -d --build
# abre em http://localhost:8080
```

Sobe dois serviços:
- **web** — bundle `react-native-web` servido por nginx (porta 8080).
- **proxy** — `proxy-server.js`, reescreve streams em `/proxy?url=...` para contornar CORS.

### Imagens prontas (GHCR)

Publicadas por `bash scripts/docker-release.sh` (ou `release.sh --docker`):

```bash
# num servidor, sem clonar o repo (só o docker-compose.yml):
docker compose pull && docker compose up -d

# ou direto:
docker pull ghcr.io/clevim/skaphostv-web:latest
docker pull ghcr.io/clevim/skaphostv-proxy:latest
```

> O push exige `gh auth refresh -s write:packages` (uma vez). A primeira
> publicação nasce **privada** no GHCR — para `docker pull` anônimo, mude a
> visibilidade em github.com/users/clevim/packages → Package settings → Public.

A UI e a lógica de D-Pad (setas do teclado = controle) funcionam 100%.

### Playback no navegador
O `Video.web.tsx` roteia cada formato pelo player certo, sempre via `/proxy`:
- **MP4 / Direct Play (Jellyfin)** → `<video>` nativo.
- **HLS (`.m3u8`)** → `hls.js`.
- **MPEG-TS (`.ts` / live sem extensão)** → `mpegts.js`.

Ou seja: IPTV ao vivo, filmes e séries tocam no navegador. O que o codec do
navegador não decodificar (ex.: áudio AC3/EAC3 em alguns containers) continua
sendo caso para o APK.

---

## 2. APK (celular + FireStick)

```bash
docker build -f docker/Dockerfile.android -t skaphostv-apk .
docker run --rm -v "$PWD/build-output:/out" skaphostv-apk
# → build-output/app-release.apk
```

O APK release é assinado com a `debug.keystore` do repo (definido em `android/app/build.gradle`),
então instala direto:

```bash
# FireStick: habilite "Apps de fontes desconhecidas" e ADB depuração
adb connect IP_DO_FIRESTICK:5555
adb install -r build-output/app-release.apk
```

Arquiteturas incluídas: `armeabi-v7a` + `arm64-v8a` (igual ao perfil `firestick` do `eas.json`).

> O primeiro build baixa Android SDK + NDK (~alguns GB) e leva vários minutos. Builds seguintes reusam cache de camadas.
