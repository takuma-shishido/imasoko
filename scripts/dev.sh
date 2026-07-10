#!/usr/bin/env bash
#
# dev.sh — backend(FastAPI)と frontend(Vite)をまとめて起動する開発用スクリプト。
#
#   server : apps/server  → uvicorn app.main:app --reload  (http://localhost:8000)
#   web    : apps/web      → vite                          (http://localhost:5173)
#
# Vite の server.proxy が /api・/ws を :8000 へ転送するので、web だけ開けばよい。
# Ctrl+C で両方まとめて停止する。
#
# 使い方:
#   ./scripts/dev.sh          # localhost のみで bind(既定)
#   ./scripts/dev.sh --lan    # 0.0.0.0 で bind(スマホなど LAN 内の実機から確認する用)
#
set -euo pipefail

# bind 先の切り替え(既定は localhost。--lan で LAN 内に公開)
BIND_HOST="127.0.0.1"
for arg in "$@"; do
  case "$arg" in
    --lan) BIND_HOST="0.0.0.0" ;;
    *)
      echo "usage: $0 [--lan]" >&2
      exit 1
      ;;
  esac
done

# リポジトリのルート(このスクリプトの1つ上)へ移動
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/apps/server"
WEB_DIR="$ROOT_DIR/apps/web"

# 起動した子プロセスの PID を控えておき、終了時にまとめて片付ける
pids=()

# pid とその子孫を根こそぎ止める。npm は子(vite)へシグナルを転送せず、
# uvicorn --reload も worker を別プロセスで持つため、木をたどって落とす。
kill_tree() {
  local pid=$1
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "==> 停止中..."
  for pid in "${pids[@]}"; do
    kill_tree "$pid"
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# ── server(FastAPI)─────────────────────────────
start_server() {
  cd "$SERVER_DIR"

  # venv が無ければ用意する(uv 必須)
  if [ ! -x ".venv/bin/uvicorn" ]; then
    if ! command -v uv >/dev/null 2>&1; then
      echo "ERROR: apps/server/.venv が無く、uv も見つかりません。" >&2
      echo "       CONTRIBUTING.md の手順で venv を作成してください:" >&2
      echo "       cd apps/server && uv venv --python 3.12 .venv && \\" >&2
      echo "         uv pip install --python .venv/bin/python -r requirements-dev.txt" >&2
      exit 1
    fi
    echo "==> apps/server/.venv を作成します(uv)..."
    uv venv --python 3.12 .venv
    uv pip install --python .venv/bin/python -r requirements-dev.txt
  fi

  echo "==> server 起動: http://localhost:8000"
  ./.venv/bin/uvicorn app.main:app --host "$BIND_HOST" --reload &
  pids+=("$!")
}

# ── web(Vite)──────────────────────────────────
start_web() {
  cd "$WEB_DIR"

  if [ ! -d "node_modules" ]; then
    echo "==> apps/web の依存をインストールします(npm install)..."
    npm install
  fi

  echo "==> web 起動: http://localhost:5173"
  npm run dev -- --host "$BIND_HOST" &
  pids+=("$!")
}

start_server
start_web

echo ""
echo "両方起動しました。ブラウザで http://localhost:5173 を開いてください。"
if [ "$BIND_HOST" = "0.0.0.0" ]; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | cut -d' ' -f1 || true)"
  [ -n "$LAN_IP" ] && echo "LAN 内の実機からは http://${LAN_IP}:5173 で開けます(/api・/ws は Vite が転送)。"
fi
echo "停止するには Ctrl+C。"
echo ""

# どちらかが終了するまで待つ(= プロセスが落ちたら trap が後片付け)
wait
