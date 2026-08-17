#!/usr/bin/env bash
set -e

# Sincroniza a versão (app.json → build.gradle / strings.xml / package.json)
node scripts/sync-version.js

VERSION=$(node -e "console.log(require('./app.json').expo.version)")
OUT_DIR="storage/apks"
# Com EXPO_PUBLIC_DEV_UPDATE_URL setado, o nome sai FIXO (skaphostv-dev.apk,
# sempre o mesmo, sobrescrevendo o anterior) — o servidor de dev local serve
# sempre esse arquivo e a tela de Ajustes aponta pra ele via "Forçar
# atualização" (que reinstala mesmo com versão igual). Isso evita ter que
# bumpar app.json a cada build de teste. `npm run release` usa o caminho
# versionado sem sufixo, então nunca pega este arquivo.
if [ -n "$EXPO_PUBLIC_DEV_UPDATE_URL" ]; then
  OUT_FILE="$OUT_DIR/skaphostv-dev.apk"
else
  OUT_FILE="$OUT_DIR/skaphostv-$VERSION.apk"
fi

mkdir -p "$OUT_DIR"

echo "Building SkaphosTV v$VERSION → $OUT_FILE"
if [ -n "$EXPO_PUBLIC_DEV_UPDATE_URL" ]; then
  echo "⚠️  EXPO_PUBLIC_DEV_UPDATE_URL setado — este build sai COM as ferramentas de dev/debug"
  echo "   (log em tela, campo de servidor de update em Ajustes). Pra um build de produção,"
  echo "   rode 'unset EXPO_PUBLIC_DEV_UPDATE_URL' antes, ou use 'npm run release'."
else
  echo "✓ Build de produção — sem ferramentas de dev/debug."
fi

# Limpa caches do Metro
rm -rf node_modules/.cache "$TMPDIR/metro-"* "$TMPDIR/haste-map-"*

# Assets gerados pelo bundle (fontes, imagens): o Metro ESCREVE aqui mas nunca
# apaga o que sobrou de um build anterior, e o Gradle empacota o diretório
# inteiro. Sem esta limpeza, um asset que deixou de ser referenciado continua
# viajando dentro do APK para sempre — foi assim que 19 fontes de ícone não
# usadas (~3,4 MB) sobreviveram à troca para o import direto do Ionicons.
rm -rf android/app/build/generated/res/createBundleReleaseJsAndAssets \
       android/app/build/generated/assets/createBundleReleaseJsAndAssets

# O app.manifest do expo-updates (lista de assets EMBUTIDOS) sai de OUTRA task,
# e ela não enxerga que o bundle mudou de assets — fica marcada como up-to-date
# e o manifesto envelhece. Some junto, senão as duas metades discordam:
#
#   res/raw          → só as fontes que o bundle usa de verdade (5)
#   app.manifest     → as 23 de quando o app importava @expo/vector-icons inteiro
#
# E discordar aí não é cosmético: no boot o expo-updates copia cada asset do
# manifesto por getIdentifier(); quem não existe volta id 0 e o app morre com
# "Resource ID #0x0" ANTES de desenhar qualquer coisa. Só detona no caminho de
# fallback (LoaderTask.launchFallbackUpdateFromDisk), que é o que roda quando a
# checagem de update não responde — por isso passava despercebido com rede boa.
rm -rf android/app/build/generated/assets/createReleaseUpdatesResources \
       android/app/build/generated/res/createReleaseUpdatesResources

# Build via Gradle (o RNGP faz o bundle JS automaticamente)
cd android
./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
cd ..

# Copia APK para storage/apks/ com nome versionado
APK_SRC=$(find android/app/build/outputs/apk/release -name "*.apk" | head -1)
if [ -z "$APK_SRC" ]; then
  echo "✗ APK não encontrado em android/app/build/outputs/apk/release/"
  exit 1
fi

cp "$APK_SRC" "$OUT_FILE"

echo ""
echo "✓ APK gerado: $OUT_FILE"
echo "  Tamanho: $(du -sh "$OUT_FILE" | cut -f1)"
