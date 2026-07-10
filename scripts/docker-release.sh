#!/usr/bin/env bash
set -euo pipefail

# docker-release.sh — builda e publica as imagens web + proxy no GitHub
# Container Registry (ghcr.io), para uso via `docker pull` / `docker compose pull`.
#
# Publica:
#   ghcr.io/clevim/skaphostv-web:<versão>   e :latest
#   ghcr.io/clevim/skaphostv-proxy:<versão> e :latest
#
# Login: reusa o token do gh CLI. O push exige o scope write:packages —
# se der "denied", rode:  gh auth refresh -s write:packages
#
# Na PRIMEIRA publicação o pacote nasce PRIVADO no GHCR. Para permitir
# `docker pull` sem login: github.com/users/clevim/packages → pacote →
# Package settings → Change visibility → Public.
#
# Uso:
#   bash scripts/docker-release.sh            # versão do app.json
#   bash scripts/docker-release.sh 1.5.0      # versão explícita
#   bash scripts/docker-release.sh --no-push  # só builda (validação local)

cd "$(dirname "$0")/.."

# Mesma regra do release.sh: imagem pública nunca sai com ferramentas de dev
unset EXPO_PUBLIC_DEV_UPDATE_URL

REGISTRY="ghcr.io"
OWNER="clevim"
WEB_IMG="$REGISTRY/$OWNER/skaphostv-web"
PROXY_IMG="$REGISTRY/$OWNER/skaphostv-proxy"

VERSION=""
NO_PUSH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-push) NO_PUSH=1 ;;
    -h|--help) sed -n '4,22p' "$0"; exit 0 ;;
    -*)        echo "✗ opção desconhecida: $1"; exit 1 ;;
    *)         VERSION="$1" ;;
  esac
  shift
done

if [ -z "$VERSION" ]; then
  VERSION="$(node -e "console.log(require('./app.json').expo.version)")"
fi
if ! echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "✗ versão inválida: \"$VERSION\" (use M.m.p, ex.: 1.5.0)"
  exit 1
fi

# BuildKit quando disponível: respeita docker/Dockerfile.*.dockerignore (contexto
# mínimo por alvo). Sem buildx, o builder legado usa só o .dockerignore raiz —
# funciona igual (segredos já bloqueados lá), apenas sobe um contexto maior.
if docker buildx version >/dev/null 2>&1; then
  export DOCKER_BUILDKIT=1
else
  echo "ℹ docker-buildx ausente — builder legado (contexto maior). Arch: sudo pacman -S docker-buildx"
fi

echo "▶ Build $WEB_IMG:$VERSION"
docker build -f docker/Dockerfile.web -t "$WEB_IMG:$VERSION" -t "$WEB_IMG:latest" .

echo "▶ Build $PROXY_IMG:$VERSION"
docker build -f docker/Dockerfile.proxy -t "$PROXY_IMG:$VERSION" -t "$PROXY_IMG:latest" .

if [ "$NO_PUSH" -eq 1 ]; then
  echo "✓ Imagens buildadas (push pulado: --no-push)."
  exit 0
fi

echo "▶ Login no $REGISTRY (token do gh)"
if ! gh auth token | docker login "$REGISTRY" -u "$OWNER" --password-stdin; then
  echo "✗ login no GHCR falhou. Rode: gh auth refresh -s write:packages"
  exit 1
fi

docker push "$WEB_IMG:$VERSION"
docker push "$WEB_IMG:latest"
docker push "$PROXY_IMG:$VERSION"
docker push "$PROXY_IMG:latest"

echo ""
echo "✓ Publicado. No servidor:"
echo "    docker compose pull && docker compose up -d"
echo "  ou direto:"
echo "    docker pull $WEB_IMG:$VERSION"
echo "    docker pull $PROXY_IMG:$VERSION"
