#!/usr/bin/env bash
# Enforces the order-service GATES before a commit.
#
# Usage (from anywhere inside the repo):
#   bash order-service/.agents/scripts/check-scope.sh                   # code commit
#   bash order-service/.agents/scripts/check-scope.sh --no-code         # docs-only commit
#   bash order-service/.agents/scripts/check-scope.sh --allow-lockfile  # adding a dependency
#
# Checks:
#   1. current branch is order-system
#   2. something is staged, and every staged path is under order-service/
#      (--allow-lockfile: the root pnpm-lock.yaml may be staged if only its
#       `order-service:` importer section changed — decision D-011)
#   3. no secrets or generated output are staged (.env, src/generated/, dist/, coverage/)
#   4. --no-code: nothing staged or modified under src/, tests/, prisma/, migrations/,
#      package.json
# It cannot stop a push; pushing always needs the user's explicit confirmation.
set -euo pipefail

no_code=false
allow_lockfile=false
for arg in "$@"; do
  case "$arg" in
    --no-code) no_code=true ;;
    --allow-lockfile) allow_lockfile=true ;;
    *) echo "check-scope: unknown option $arg" >&2; exit 2 ;;
  esac
done

root="$(git rev-parse --show-toplevel)"
cd "$root"
fail=0
err() { echo "check-scope: FAIL: $*" >&2; fail=1; }

branch="$(git branch --show-current)"
[[ "$branch" == "order-system" ]] || err "on branch '$branch', expected 'order-system'"

staged="$(git diff --cached --name-only)"
[[ -n "$staged" ]] || err "nothing is staged"

outside="$(grep -v '^order-service/' <<<"$staged" || true)"
if $allow_lockfile && grep -qx 'pnpm-lock.yaml' <<<"$outside"; then
  outside="$(grep -vx 'pnpm-lock.yaml' <<<"$outside" || true)"
  # Remove the order-service importer block from both versions; the rest must be identical.
  strip='/^  order-service:$/{skip=1; next} skip && /^(  )?[^ ]/{skip=0} !skip'
  if ! diff -q <(git show HEAD:pnpm-lock.yaml | awk "$strip") \
               <(git show :pnpm-lock.yaml | awk "$strip") >/dev/null; then
    err "pnpm-lock.yaml changed outside its 'order-service' importer section"
  fi
fi
if [[ -n "$outside" ]]; then
  err "staged paths outside order-service/ (did you run 'git add -A'?). Unstage with 'git restore --staged <path>':"
  sed 's/^/  /' <<<"$outside" >&2
fi

forbidden="$(grep -E '(^|/)\.env$|^order-service/(src/generated|dist|coverage)/' <<<"$staged" || true)"
if [[ -n "$forbidden" ]]; then
  err "secrets or generated files staged:"
  sed 's/^/  /' <<<"$forbidden" >&2
fi

if $no_code; then
  code_re='^order-service/(src/|tests/|prisma/|migrations/|package\.json$)'
  code_changes="$( { git diff --cached --name-only; git diff --name-only; } | grep -E "$code_re" | sort -u || true)"
  if [[ -n "$code_changes" ]]; then
    err "--no-code commit but code files changed:"
    sed 's/^/  /' <<<"$code_changes" >&2
  fi
fi

if [[ $fail -ne 0 ]]; then
  exit 1
fi
echo "check-scope: OK ($(wc -l <<<"$staged" | tr -d ' ') staged file(s), branch $branch$($no_code && echo ', no-code' || true)$($allow_lockfile && echo ', lockfile allowed' || true))"
