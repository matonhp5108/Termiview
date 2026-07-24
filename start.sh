#!/usr/bin/env bash
set -euo pipefail

OS=$(uname -s)

case "$OS" in
  Darwin)
    HOST_HOME="/Users"
    ;;
  Linux)
    HOST_HOME="/home"
    ;;
  *)
    HOST_HOME="$(dirname "$HOME")"
    ;;
esac

export HOST_HOME
export HOST_LOGS="${HOST_LOGS:-/var/log}"

if [[ ! -f .env ]] || ! grep -q '^WATCHTOWER_UPDATE_TOKEN=.' .env; then
  if command -v openssl >/dev/null 2>&1; then
    WATCHTOWER_UPDATE_TOKEN=$(openssl rand -hex 32)
  else
    WATCHTOWER_UPDATE_TOKEN="$(date +%s)-$RANDOM-$RANDOM"
  fi
  umask 077
  printf 'WATCHTOWER_UPDATE_TOKEN=%s\n' "$WATCHTOWER_UPDATE_TOKEN" >> .env
  echo "[Termiview] Created a private updater token in .env"
fi

echo "[Termiview] Detected OS: $OS - mounting $HOST_HOME as home volume"
exec docker compose up "$@"
