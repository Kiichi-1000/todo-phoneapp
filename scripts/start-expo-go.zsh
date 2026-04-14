#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

EXPO_HOST="${EXPO_HOST:-tunnel}"
EXPO_PORT="${EXPO_PORT:-8081}"

export NVM_DIR="$HOME/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  source "$NVM_DIR/nvm.sh" --no-use
else
  echo "[ERROR] nvm not found at $NVM_DIR/nvm.sh"
  exit 1
fi

if ! nvm use 22.22.1 >/dev/null 2>&1; then
  echo "[INFO] Node v22.22.1 is not installed. Installing via nvm..."
  nvm install 22.22.1 >/dev/null
  nvm use 22.22.1 >/dev/null
fi

echo "[INFO] Using Node $(node -v) / npm $(npm -v)"

echo "[INFO] Cleaning old Expo/Metro processes..."
pkill -f "expo start|@expo/cli|npm exec expo|node_modules/.bin/expo|metro|react-native" || true
sleep 1

if lsof -ti tcp:"$EXPO_PORT" >/dev/null 2>&1; then
  echo "[INFO] Releasing port $EXPO_PORT..."
  lsof -ti tcp:"$EXPO_PORT" | xargs -r kill -9 || true
fi

echo "[INFO] Starting Expo Go (host=$EXPO_HOST, port=$EXPO_PORT)..."
exec env -u CI EXPO_NO_TELEMETRY=1 npx expo start --go --host "$EXPO_HOST" --port "$EXPO_PORT" --clear
