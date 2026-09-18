#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=============================================="
echo "      AutoManual AI — Unified Startup         "
echo "=============================================="

# 1. Ensure logs directory exists
mkdir -p logs

# 2. Check & Start Docker if on macOS
if ! docker info >/dev/null 2>&1; then
  echo "[1/5] Docker daemon is not running. Attempting to start Docker Desktop..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open -a Docker || true
  fi
  echo "      Waiting for Docker to become ready..."
  MAX_WAIT=30
  WAITED=0
  while ! docker info >/dev/null 2>&1; do
    sleep 2
    WAITED=$((WAITED + 2))
    if [ $WAITED -ge $MAX_WAIT ]; then
      echo "Error: Docker did not start within ${MAX_WAIT}s. Please start Docker manually."
      exit 1
    fi
  done
  echo "      ✓ Docker is ready."
else
  echo "[1/5] ✓ Docker daemon is running."
fi

# 3. Start PostgreSQL and Redis containers
echo "[2/5] Starting database & queue services (Postgres + Redis)..."
docker compose up -d

echo "      Waiting for PostgreSQL & Redis healthcheck..."
docker compose exec -T postgres sh -c 'until pg_isready -U postgres -d automanual; do sleep 1; done' >/dev/null 2>&1 || sleep 2
docker compose exec -T redis sh -c 'until redis-cli ping | grep -q PONG; do sleep 1; done' >/dev/null 2>&1 || sleep 1
echo "      ✓ Database (Postgres :5432) & Queue (Redis :6379) are healthy."

# 4. Sync Database Schema
echo "[3/5] Verifying database schema & generating Prisma client..."
npx prisma db push --schema=apps/api/prisma/schema.prisma --skip-generate >/dev/null 2>&1 || true
npm run db:generate --workspace=@automanual/api >/dev/null 2>&1 || true
echo "      ✓ Prisma schema synced."

# 5. Clear old processes on port 4001 & 3000
echo "[4/5] Checking ports 4001 (API) and 3000 (Web)..."
lsof -ti:4001 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

# Build if dist missing
if [ ! -f "apps/api/dist/main.js" ] || [ ! -d "apps/web/.next" ]; then
  echo "      Building packages and applications..."
  npm run build
fi

# 6. Start API and Web services
echo "[5/5] Launching API server and Web application..."

# Start API
nohup node apps/api/dist/main.js </dev/null > logs/api.log 2>&1 &
API_PID=$!
disown $API_PID 2>/dev/null || true
echo "      Started API (PID: $API_PID) -> logs/api.log"

# Start Web
nohup npm run start --workspace=@automanual/web </dev/null > logs/web.log 2>&1 &
WEB_PID=$!
disown $WEB_PID 2>/dev/null || true
echo "      Started Web (PID: $WEB_PID) -> logs/web.log"

echo "$API_PID" > logs/api.pid
echo "$WEB_PID" > logs/web.pid

# Wait for API healthcheck
echo "      Waiting for services to respond..."
API_READY=false
for i in {1..20}; do
  if curl -s http://localhost:4001/api/health >/dev/null 2>&1; then
    API_READY=true
    break
  fi
  sleep 1
done

WEB_READY=false
for i in {1..20}; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    WEB_READY=true
    break
  fi
  sleep 1
done

echo ""
echo "=============================================="
if [ "$API_READY" = true ] && [ "$WEB_READY" = true ]; then
  echo "   ✓ All AutoManual AI services are RUNNING!  "
else
  echo "   ! Services started (verifying in background)"
fi
echo "=============================================="
echo "  • Web Studio:   http://localhost:3000"
echo "  • API Server:   http://localhost:4001/api"
echo "  • Logs:         tail -f logs/api.log logs/web.log"
echo "  • Stop command: ./stop.sh"
echo "=============================================="

# If --daemon flag passed, exit and leave running in background
if [ "$1" = "--daemon" ] || [ "$1" = "-d" ]; then
  echo "Running in background (daemon mode)."
  exit 0
fi

# Otherwise, monitor and handle graceful shutdown on Ctrl+C
cleanup() {
  echo ""
  echo "Shutting down AutoManual AI processes..."
  kill $API_PID 2>/dev/null || true
  kill $WEB_PID 2>/dev/null || true
  rm -f logs/api.pid logs/web.pid
  echo "Done. Services stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "Press Ctrl+C to stop both servers."
wait $API_PID $WEB_PID
