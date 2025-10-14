#!/usr/bin/env bash

set -euo pipefail

# Helper to start/stop the prod server (Docker Compose)
# Usage:
#   ./prod-server.sh start
#   ./prod-server.sh stop

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Choose docker compose variant
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  echo "Error: Docker Compose is not installed (docker compose or docker-compose)." >&2
  exit 1
fi

ENV_FILE=".env.docker"
COMPOSE_FILE="docker-compose.yml"
NETWORK_NAME="shared-mongo-net"

require_prereqs() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Error: Docker is not installed or not on PATH." >&2
    exit 1
  fi

  if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Error: $COMPOSE_FILE not found at repo root ($ROOT_DIR)." >&2
    exit 1
  fi

  if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found. Copy .env.docker.example and fill values." >&2
    exit 1
  fi

  # Ensure external network exists (compose expects it)
  if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    echo "Creating external Docker network: $NETWORK_NAME"
    docker network create "$NETWORK_NAME" >/dev/null
  fi
}

start() {
  require_prereqs
  echo "Starting prod server (detached)..."
  "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
  echo "Done. Use 'docker ps' or '"${DC[*]}" ps' to verify."
}

stop() {
  require_prereqs
  echo "Stopping prod server..."
  "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down
  echo "Prod server stopped."
}

usage() {
  echo "Usage: $0 {start|stop}" >&2
  exit 1
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *) usage ;;
esac
