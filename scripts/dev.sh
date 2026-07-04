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
#   ./scripts/dev.sh
#
set -euo pipefail

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
  ./.venv/bin/uvicorn app.main:app --reload &
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
  npm run dev &
  pids+=("$!")
}

start_server
start_web

echo ""
echo "両方起動しました。ブラウザで http://localhost:5173 を開いてください。"
echo "停止するには Ctrl+C。"
echo ""

# どちらかが終了するまで待つ(= プロセスが落ちたら trap が後片付け)
wait
