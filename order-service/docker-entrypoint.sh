#!/bin/sh
# AI Assistance Disclosure:
# Tool: GPT-6.1 Sol.
# Scope: AI-assisted implementation of docker entrypoint script commands.
# Author review: Validated order-service migration invocation and process handoff in docker-entrypoint.sh; edited command layout and status-message wording.

set -eu
node node_modules/prisma/build/index.js migrate deploy
exec "$@"
