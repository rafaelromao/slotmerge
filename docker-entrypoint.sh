#!/bin/sh
set -e

MODE="${PROCESS_ROLE:-${RUNTIME_MODE}}"
echo "[entrypoint] PROCESS_ROLE=${PROCESS_ROLE:-<unset>} RUNTIME_MODE=${RUNTIME_MODE:-<unset>} MODE=${MODE:-<unset>}"

case "${MODE}" in
web)
    echo "[entrypoint] Launching Next.js web server (hostname=0.0.0.0, port=${PORT:-3000})"
    exec next start
    ;;
worker)
    echo "[entrypoint] Starting Graphile Worker"
    exec tsx src/worker/run.ts
    ;;
*)
    echo "[entrypoint] ERROR: Unknown MODE '${MODE}' (PROCESS_ROLE=${PROCESS_ROLE:-<unset>}, RUNTIME_MODE=${RUNTIME_MODE:-<unset>})"
    echo "[entrypoint] Supported modes: web, worker"
    exit 1
    ;;
esac
