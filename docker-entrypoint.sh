#!/bin/sh
set -e

echo "[entrypoint] RUNTIME_MODE=${RUNTIME_MODE:-web}"

case "${RUNTIME_MODE}" in
web)
    echo "[entrypoint] Launching Next.js web server (hostname=0.0.0.0, port=${PORT:-3000})"
    exec next start
    ;;
worker)
    echo "[entrypoint] Starting Graphile Worker"
    exec tsx src/worker/run.ts
    ;;
*)
    echo "[entrypoint] ERROR: Unknown RUNTIME_MODE '${RUNTIME_MODE}'"
    echo "[entrypoint] Supported modes: web, worker"
    exit 1
    ;;
esac
