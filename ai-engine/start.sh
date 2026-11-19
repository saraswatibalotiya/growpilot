#!/bin/sh
set -eu

cd "$(dirname "$0")"
if [ "${ENVIRONMENT:-development}" = "production" ] && [ -z "${DATABASE_URL:-}" ]; then
  printf '%s\n' 'Export DATABASE_URL before starting in production.' >&2
  exit 1
fi
export STORAGE_BACKEND=postgres
export DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://growpilot_user:growpilot_password@127.0.0.1:5432/growpilot_db}"
export LOAD_MOCK_DATA="${LOAD_MOCK_DATA:-false}"

.venv/bin/python -m alembic upgrade head
exec .venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001