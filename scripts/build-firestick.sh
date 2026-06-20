#!/usr/bin/env bash
set -e

VERSION=$(node -e "console.log(require('./app.json').expo.version)")
OUT_DIR="storage/apks"
OUT_FILE="$OUT_DIR/skaphostv-$VERSION.apk"

mkdir -p "$OUT_DIR"

echo "Building SkaphosTV v$VERSION → $OUT_FILE"

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
