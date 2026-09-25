#!/bin/sh
# Applies pending migrations, optionally seeds demo data into an EMPTY database, then starts the API.
set -e

echo "[devtrack] Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "[devtrack] Seeding demo data (only if the database is empty)..."
  SEED_ONLY_IF_EMPTY=true node dist-seed/seed.js
fi

echo "[devtrack] Starting API on port ${PORT:-4000}"
exec node dist/main.js
