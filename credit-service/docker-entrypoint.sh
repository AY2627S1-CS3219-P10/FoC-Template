#!/bin/sh
# AI Assistance Disclosure:
# Tool: GPT-6.1 Sol.
# Scope: AI-assisted implementation of docker entrypoint script commands.
# Author review: Validated credit-service migration invocation and process handoff in docker-entrypoint.sh; edited command layout and status-message wording.

set -eu

startup_timeout="${DATABASE_STARTUP_TIMEOUT_SECONDS:-55}"
retry_interval="${DATABASE_RETRY_INTERVAL_SECONDS:-2}"
elapsed=0

until ./node_modules/.bin/prisma migrate deploy; do
  if [ "$elapsed" -ge "$startup_timeout" ]; then
    echo "Database migrations did not complete within ${startup_timeout}s" >&2
    exit 1
  fi
  echo "Database is unavailable; retrying migrations in ${retry_interval}s" >&2
  sleep "$retry_interval"
  elapsed=$((elapsed + retry_interval))
done

exec "$@"
