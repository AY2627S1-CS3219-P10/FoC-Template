#!/usr/bin/env bash
# macOS/Linux counterpart of scripts/start-local.ps1.
# Usage: ./scripts/start-local.sh [--install]
set -euo pipefail

install=false
for arg in "$@"; do
    case "$arg" in
        --install) install=true ;;
        *) echo "Unknown argument: $arg (supported: --install)" >&2; exit 2 ;;
    esac
done

repo_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() { echo "$*" >&2; exit 1; }

# Prints the last value assigned to NAME in an env file (empty if absent).
read_setting() {
    local path="$1" name="$2"
    [[ -f "$path" ]] || return 0
    NAME="$name" awk '
        match($0, "^[[:space:]]*" ENVIRON["NAME"] "[[:space:]]*=") {
            value = substr($0, RLENGTH + 1)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
            gsub(/^["\047]+|["\047]+$/, "", value)
            found = value
        }
        END { printf "%s", found }
    ' "$path"
}

# Replaces every NAME= line in an env file, or appends one if missing.
save_setting() {
    local path="$1" name="$2" value="$3" tmp
    tmp="$(mktemp)"
    if [[ -f "$path" ]]; then
        NAME="$name" VALUE="$value" awk '
            match($0, "^[[:space:]]*" ENVIRON["NAME"] "[[:space:]]*=") {
                print ENVIRON["NAME"] "=" ENVIRON["VALUE"]; found = 1; next
            }
            { print }
            END { if (!found) print ENVIRON["NAME"] "=" ENVIRON["VALUE"] }
        ' "$path" > "$tmp"
    else
        printf '%s=%s\n' "$name" "$value" > "$tmp"
    fi
    mv "$tmp" "$path"
}

run_in() {
    local folder="$1"; shift
    (cd "$repo_path/$folder" && "$@") || fail "$1 failed in $folder (exit $?)."
}

new_local_secret() { openssl rand -base64 48 | tr -d '\n'; }

# A secret is usable when it is at least 32 characters and not a placeholder.
usable_secret() { [[ ${#1} -ge 32 && "$1" != replace-* ]]; }

url_encode() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"; }

for program in node pnpm docker openssl curl lsof; do
    command -v "$program" > /dev/null || fail "$program is not installed or not on PATH."
done
node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major === 24 && minor >= 11 ? 0 : 1);
' || fail "Node.js >=24.11 <25 is required (found $(node -v)). Install a current Node 24 LTS and try again."
docker info --format '{{.ServerVersion}}' > /dev/null 2>&1 \
    || fail 'Start Docker Desktop, wait until its engine is running, then run this script again.'

for service in user-service supplier-service order-service; do
    env_path="$repo_path/$service/.env"
    [[ -f "$env_path" ]] || cp "$repo_path/$service/.env.example" "$env_path"
done

user_env="$repo_path/user-service/.env"
jwt_secret="$(read_setting "$user_env" JWT_ACCESS_TOKEN_SECRET)"
if ! usable_secret "$jwt_secret"; then
    jwt_secret="$(new_local_secret)"
    save_setting "$user_env" JWT_ACCESS_TOKEN_SECRET "$jwt_secret"
fi
email_secret="$(read_setting "$user_env" EMAIL_VERIFICATION_CODE_SECRET)"
if [[ -z "$email_secret" || "$email_secret" == replace-* ]]; then
    save_setting "$user_env" EMAIL_VERIFICATION_CODE_SECRET "$(new_local_secret)"
fi

root_env="$repo_path/.env"
user_service_token="$(read_setting "$root_env" CREDIT_USER_SERVICE_TOKEN)"
usable_secret "$user_service_token" || user_service_token="$(new_local_secret)"
order_service_token="$(read_setting "$root_env" CREDIT_ORDER_SERVICE_TOKEN)"
usable_secret "$order_service_token" || order_service_token="$(new_local_secret)"
monitoring_token="$(read_setting "$root_env" CREDIT_MONITORING_TOKEN)"
usable_secret "$monitoring_token" || monitoring_token="$(new_local_secret)"
save_setting "$root_env" JWT_ACCESS_TOKEN_SECRET "$jwt_secret"
save_setting "$root_env" CREDIT_USER_SERVICE_TOKEN "$user_service_token"
save_setting "$root_env" CREDIT_ORDER_SERVICE_TOKEN "$order_service_token"
save_setting "$root_env" CREDIT_MONITORING_TOKEN "$monitoring_token"
save_setting "$repo_path/supplier-service/.env" JWT_ACCESS_TOKEN_SECRET "$jwt_secret"
save_setting "$repo_path/web-app/.env.local" CREDIT_USER_SERVICE_TOKEN "$user_service_token"
save_setting "$repo_path/order-service/.env" CREDIT_ORDER_SERVICE_TOKEN "$order_service_token"

local_rabbitmq_url='amqp://foc:foc_local_password@127.0.0.1:5672'
events_exchange="$(read_setting "$root_env" USER_EVENTS_EXCHANGE)"
[[ -n "$events_exchange" ]] || events_exchange="$(read_setting "$root_env" CREDIT_EVENTS_EXCHANGE)"
[[ -n "$events_exchange" ]] || events_exchange='foc.events'
save_setting "$user_env" USER_EVENTS_ENABLED true
save_setting "$user_env" USER_EVENTS_EXCHANGE "$events_exchange"
save_setting "$user_env" USER_OUTBOX_POLL_INTERVAL_MS 1000
save_setting "$user_env" RABBITMQ_URL "$local_rabbitmq_url"

root_or_default() {
    local value
    value="$(read_setting "$root_env" "$1")"
    printf '%s' "${value:-$2}"
}
credit_port="$(root_or_default CREDIT_DATABASE_PORT 5435)"
credit_user="$(root_or_default CREDIT_DATABASE_USER foc_credit)"
credit_password="$(root_or_default CREDIT_DATABASE_PASSWORD local_credit_password)"
credit_database="$(root_or_default CREDIT_DATABASE_NAME foc_credit)"
credit_env="$repo_path/credit-service/.env"
save_setting "$credit_env" DATABASE_URL \
    "postgresql://$(url_encode "$credit_user"):$(url_encode "$credit_password")@127.0.0.1:$credit_port/$credit_database"
save_setting "$credit_env" JWT_ACCESS_TOKEN_SECRET "$jwt_secret"
save_setting "$credit_env" CREDIT_USER_SERVICE_TOKEN "$user_service_token"
save_setting "$credit_env" CREDIT_ORDER_SERVICE_TOKEN "$order_service_token"
save_setting "$credit_env" CREDIT_MONITORING_TOKEN "$monitoring_token"
save_setting "$credit_env" CREDIT_EVENTS_ENABLED true
save_setting "$credit_env" CREDIT_EVENTS_EXCHANGE "$events_exchange"
save_setting "$credit_env" RABBITMQ_URL "$local_rabbitmq_url"
for name in CREDIT_INITIAL_BALANCE CREDIT_TRANSACTION_RETRIES JWT_ISSUER JWT_AUDIENCE LOG_LEVEL; do
    value="$(read_setting "$root_env" "$name")"
    [[ -z "$value" ]] || save_setting "$credit_env" "$name" "$value"
done

if $install || [[ ! -d "$repo_path/node_modules" ]]; then run_in . pnpm install; fi
for service in user-service supplier-service; do
    if $install || [[ ! -d "$repo_path/$service/node_modules" ]]; then run_in "$service" pnpm install; fi
done
run_in user-service docker compose up -d --wait database redis
run_in supplier-service docker compose up -d --wait database
run_in . docker compose up -d --wait credit-db rabbitmq order-db order-redis
for service in user-service supplier-service; do
    run_in "$service" pnpm prisma:generate
    run_in "$service" pnpm db:migrate:deploy
done
run_in credit-service pnpm db:generate
run_in credit-service pnpm db:migrate
run_in order-service pnpm db:generate
run_in order-service pnpm db:migrate

log_path="$repo_path/.local"
mkdir -p "$log_path"
# folder|port|command|log name
services=(
    'user-service|3001|start:dev|user-service'
    'supplier-service|3002|start:dev|supplier-service'
    'credit-service|3003|start:dev|credit-service'
    'order-service|3004|start:dev|order-service'
    '.|3000|web:dev|web-app'
)
for entry in "${services[@]}"; do
    IFS='|' read -r folder port script name <<< "$entry"
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN > /dev/null 2>&1; then
        echo "Port $port is already in use; keeping the running process. Restart it if you changed its configuration."
        continue
    fi
    (cd "$repo_path/$folder" || exit 1
        nohup pnpm "$script" > "$log_path/$name.log" 2> "$log_path/$name.error.log" < /dev/null &
        echo "Starting $name (process $!); logs in .local/")
done

echo 'Waiting for the application services to be ready...'
ready_deadline=$((SECONDS + 90))
for target in \
    'http://127.0.0.1:3001/api/accounts/me|401' \
    'http://127.0.0.1:3002/api/suppliers|401' \
    'http://127.0.0.1:3003/health/ready|200' \
    'http://127.0.0.1:3004/health/ready|200' \
    'http://localhost:3000/login|200'; do
    url="${target%|*}"
    expected="${target##*|}"
    ready=false
    while (( SECONDS < ready_deadline )); do
        status="$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$url" || true)"
        if [[ "$status" == "$expected" ]]; then ready=true; break; fi
        sleep 0.5
    done
    $ready || fail "Service not ready at $url. Check .local/ logs before opening the app."
done
echo 'Open http://localhost:3000, log in, then click the gold coin and balance. A missing credit account is provisioned once after login.'
