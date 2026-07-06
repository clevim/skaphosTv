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
