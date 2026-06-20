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

A UI e a lógica de D-Pad (setas do teclado = controle) funcionam 100%.

### Limitação de playback no navegador
O player web usa `<video>` puro. Isso significa:
- **MP4 / Direct Play (Jellyfin)** → toca.
- **HLS (`.m3u8`) e MPEG-TS (`.ts`, IPTV live)** → **não tocam** sem `hls.js`/`mpegts.js`.

Ou seja: o webapp é ótimo pra navegar e validar a interface, mas para playback **real de IPTV** o APK no FireStick é o alvo fiel. Dá pra fechar esse gap adicionando `hls.js` ao `Video.web.tsx` + roteando os streams pelo `/proxy` — peça que a gente implementa.

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
