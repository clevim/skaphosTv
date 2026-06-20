#!/usr/bin/env bash
set -e

VERSION=$(node -e "console.log(require('./app.json').expo.version)")
OUT_DIR="storage/apks"
OUT_FILE="$OUT_DIR/skaphostv-$VERSION.apk"

mkdir -p "$OUT_DIR"

echo "Building SkaphosTV v$VERSION → $OUT_FILE"

rm -rf node_modules/.cache "$TMPDIR/metro-"* "$TMPDIR/haste-map-"*

eas build --platform android --profile firestick --local --output "./$OUT_FILE"

echo ""
echo "✓ APK gerado: $OUT_FILE"
