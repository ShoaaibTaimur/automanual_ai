#!/usr/bin/env bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "Stopping AutoManual AI services..."

# 1. Kill API and Web by recorded PID if present
if [ -f logs/api.pid ]; then
  kill "$(cat logs/api.pid)" 2>/dev/null || true
  rm -f logs/api.pid
fi

if [ -f logs/web.pid ]; then
  kill "$(cat logs/web.pid)" 2>/dev/null || true
  rm -f logs/web.pid
fi

# 2. Kill any processes bound to ports 4001 and 3000
lsof -ti:4001 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# 3. If --all or -a passed, also stop docker containers
if [ "$1" = "--all" ] || [ "$1" = "-a" ]; then
  echo "Stopping database & queue containers..."
  docker compose down
fi

echo "✓ All AutoManual AI services stopped."
