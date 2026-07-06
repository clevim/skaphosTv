#!/usr/bin/env bash
set -euo pipefail

# release.sh — publica um release no GitHub com o APK, para o updater do app.
#
# O app (src/utils/appUpdate.ts) lê o release MAIS RECENTE do GitHub, pega o asset
# que termina em ".apk" e usa o corpo do release como notas. Como o runtimeVersion
# muda a cada versão nativa, o upgrade entre versões exige o APK (OTA não cobre).
#
# Fluxo:
#   1. Resolve a versão (arg ou app.json) e valida semver.
#   2. Garante o APK em storage/apks/skaphostv-<versão>.apk (builda se faltar).
#   3. Cria a release vX.Y.Z anexando o APK + notas (git log desde a última tag).
#
# Pré-requisitos: GitHub CLI (`gh`) instalado e autenticado (`gh auth login`).
#
# Uso:
#   bash scripts/release.sh                 # versão do app.json; builda se faltar APK
#   bash scripts/release.sh 1.2.0           # versão explícita
#   bash scripts/release.sh --rebuild       # força rebuild do APK
#   bash scripts/release.sh --no-build      # exige APK já existente (não builda)
#   bash scripts/release.sh --notes notas.md# usa um arquivo de notas
#   bash scripts/release.sh --draft         # cria como rascunho (revisar antes de publicar)
#   bash scripts/release.sh --allow-dirty   # pula a checagem de árvore limpa / versão no HEAD

cd "$(dirname "$0")/.."

# Um release público NUNCA pode sair com as ferramentas de dev/debug habilitadas
# (log em tela, "Servidor de update (dev)" em Ajustes) — e ambas são controladas
# só por esta env var estar ou não setada no shell no momento do build (ver
# src/utils/debugLog.ts). Se sobrou setada de uma sessão de teste anterior, o
# build ia sair "de dev" sem nenhum aviso. Zera aqui, sempre, sem exceção.
unset EXPO_PUBLIC_DEV_UPDATE_URL

REPO="clevim/skaphosTv"
VERSION=""
REBUILD=0
NO_BUILD=0
DRAFT=0
ALLOW_DIRTY=0
NOTES_FILE=""

# ── Args ─────────────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --rebuild)     REBUILD=1 ;;
    --no-build)    NO_BUILD=1 ;;
    --draft)       DRAFT=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --notes)       NOTES_FILE="${2:-}"; shift ;;
    -h|--help)     sed -n '3,30p' "$0"; exit 0 ;;
    -*)            echo "✗ opção desconhecida: $1"; exit 1 ;;
    *)             VERSION="$1" ;;
  esac
  shift
done

# ── Pré-requisitos ───────────────────────────────────────────────────────────
if ! command -v gh >/dev/null 2>&1; then
  echo "✗ GitHub CLI (gh) não encontrado."
  echo "  Instale: https://cli.github.com  (Arch: sudo pacman -S github-cli)"
  echo "  Depois autentique: gh auth login"
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "✗ gh não autenticado. Rode: gh auth login"
  exit 1
fi

# ── Versão ───────────────────────────────────────────────────────────────────
if [ -z "$VERSION" ]; then
  VERSION="$(node -e "console.log(require('./app.json').expo.version)")"
fi
if ! echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "✗ versão inválida: \"$VERSION\" (use M.m.p, ex.: 1.2.0)"
  exit 1
fi
TAG="v$VERSION"
APK="storage/apks/skaphostv-$VERSION.apk"

echo "▶ Release $TAG  (repo: $REPO)"

# ── Segurança: tag inexistente, árvore limpa, versão batendo no HEAD ──────────
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "✗ release $TAG já existe no GitHub. Aborte ou apague antes de recriar."
  exit 1
fi

if [ "$ALLOW_DIRTY" -eq 0 ]; then
  # Só checa arquivos RASTREADOS — untracked (notas, docs, este script) não afetam
  # o conteúdo do commit que a tag aponta, então não devem bloquear a release.
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "✗ há mudanças rastreadas não commitadas. Commite-as antes de publicar"
    echo "  (a release cria a tag $TAG apontando para o HEAD), ou use --allow-dirty."
    echo "  Pendências:"
    git status --porcelain --untracked-files=no | sed 's/^/    /'
    exit 1
  fi
  HEAD_VERSION="$(git show HEAD:app.json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).expo.version)}catch{console.log('')}})")"
  if [ "$HEAD_VERSION" != "$VERSION" ]; then
    echo "✗ a versão no HEAD ($HEAD_VERSION) difere de $VERSION."
    echo "  Rode 'npm run set-version $VERSION' e commite, ou use --allow-dirty."
    exit 1
  fi
fi

# ── APK ──────────────────────────────────────────────────────────────────────
if [ "$REBUILD" -eq 1 ] || [ ! -f "$APK" ]; then
  if [ "$NO_BUILD" -eq 1 ]; then
    echo "✗ APK não encontrado em $APK e --no-build foi passado."
    exit 1
  fi
  echo "▶ Buildando APK (build:firestick)…"
  bash scripts/build-firestick.sh
fi
if [ ! -f "$APK" ]; then
  echo "✗ APK ainda ausente após o build: $APK"
  exit 1
fi
echo "✓ APK: $APK ($(du -sh "$APK" | cut -f1))"

# ── Notas ────────────────────────────────────────────────────────────────────
NOTES=""
if [ -n "$NOTES_FILE" ]; then
  [ -f "$NOTES_FILE" ] || { echo "✗ arquivo de notas não encontrado: $NOTES_FILE"; exit 1; }
  NOTES="$(cat "$NOTES_FILE")"
else
  LAST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
  if [ -n "$LAST_TAG" ]; then
    CHANGES="$(git log --no-merges --pretty='- %s' "${LAST_TAG}..HEAD" 2>/dev/null || true)"
    RANGE_LABEL="desde $LAST_TAG"
  else
    CHANGES="$(git log --no-merges --pretty='- %s' -n 30 2>/dev/null || true)"
    RANGE_LABEL="últimos commits"
  fi
  [ -n "$CHANGES" ] || CHANGES="- (sem mudanças listadas)"
  NOTES=$(printf 'SkaphosTV v%s\n\n## Mudanças (%s)\n%s\n' "$VERSION" "$RANGE_LABEL" "$CHANGES")
fi

# ── Cria a release ───────────────────────────────────────────────────────────
GH_ARGS=( "$TAG" "$APK" --repo "$REPO" --title "SkaphosTV v$VERSION" --notes "$NOTES" )
[ "$DRAFT" -eq 1 ] && GH_ARGS+=( --draft )

echo "▶ Publicando release no GitHub…"
gh release create "${GH_ARGS[@]}"

echo ""
echo "✓ Release $TAG publicada com o APK."
[ "$DRAFT" -eq 1 ] && echo "  (rascunho — revise e publique em github.com/$REPO/releases)"
echo "  O 'Verificar atualização' no app deve passar a oferecer a v$VERSION."
