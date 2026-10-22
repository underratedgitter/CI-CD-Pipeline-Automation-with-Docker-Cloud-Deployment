#!/usr/bin/env bash
# Starts the built image and checks it from outside, the way a platform would:
# it boots, serves the portfolio and the API, exposes metrics, runs as a
# non-root user, and shuts down cleanly on SIGTERM. Run by CI before an image
# is published; also runs locally against any tag.
#
#   bash tests/smoke.sh <image> [host-port]
set -euo pipefail

image=${1:?usage: tests/smoke.sh <image> [host-port]}
port=${2:-3999}
name="smoke-$$"
base="http://127.0.0.1:$port"
body=$(mktemp)
headers=$(mktemp)
code=000

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    echo "--- container logs ---"
    docker logs "$name" 2>&1 | tail -n 50 || true
  fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -f "$body" "$headers"
  exit "$status"
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok   $*"; }

# fetch <path>: sets $code and leaves the body and headers in their temp files.
# curl prints 000 itself when it cannot connect; `|| code=000` only keeps
# set -e from ending the script on a network error.
fetch() {
  code=$(curl --silent --max-time 10 --output "$body" --dump-header "$headers" \
    --write-out '%{http_code}' "$base$1") || code=000
}
header() { grep -i "^$1:" "$headers" | head -n 1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//' || true; }

docker run --detach --name "$name" --publish "127.0.0.1:$port:3000" \
  --env NODE_ENV=production "$image" >/dev/null

for _ in $(seq 1 30); do
  fetch /health
  [ "$code" = 200 ] && break
  [ "$(docker inspect --format '{{.State.Running}}' "$name")" = true ] || fail "container exited during startup"
  sleep 1
done
[ "$code" = 200 ] || fail "/health did not return 200 within 30s (last: HTTP $code)"
grep -q '"status":"healthy"' "$body" || fail "/health body: $(cat "$body")"
pass "boots, and /health reports healthy"

fetch /
[ "$code" = 200 ] || fail "/ returned HTTP $code"
case "$(header content-type)" in text/html*) ;; *) fail "/ content-type: $(header content-type)" ;; esac
grep -q '<div id="root">' "$body" || fail "/ is not the portfolio page"
[ "$(header cache-control)" = no-cache ] || fail "/ cache-control: $(header cache-control)"
[ "$(header x-frame-options)" = DENY ] || fail "/ is missing the security headers"
case "$(header content-security-policy)" in *"default-src 'self'"*) ;; *) fail "/ has no Content-Security-Policy" ;; esac
pass "/ serves the portfolio, with security headers, a CSP and no-cache"

asset=$(grep -o '/assets/[^"]*\.js' "$body" | head -n 1 || true)
[ -n "$asset" ] || fail "index.html references no hashed JS asset"
fetch "$asset"
[ "$code" = 200 ] || fail "$asset returned HTTP $code"
[ "$(header cache-control)" = "public, max-age=31536000, immutable" ] || fail "$asset cache-control: $(header cache-control)"
pass "hashed assets are served and cached as immutable"

fetch /api/status
[ "$code" = 200 ] || fail "/api/status returned HTTP $code"
grep -q '"status":"ok"' "$body" || fail "/api/status body: $(cat "$body")"
pass "/api/status answers"

fetch /ready
[ "$code" = 200 ] || fail "/ready returned HTTP $code"
pass "/ready answers"

fetch /metrics
[ "$code" = 200 ] || fail "/metrics returned HTTP $code"
grep -q '^http_requests_total' "$body" || fail "/metrics has no request counter"
pass "/metrics exposes the request counter"

fetch /does-not-exist
[ "$code" = 404 ] || fail "unknown path returned HTTP $code, expected 404"
pass "unknown paths return 404"

uid=$(docker exec "$name" id -u)
[ "$uid" != 0 ] || fail "container runs as root"
# Numeric, or Kubernetes' runAsNonRoot refuses to start the pod.
user=$(docker inspect --format '{{.Config.User}}' "$name")
[[ $user =~ ^[0-9]+(:[0-9]+)?$ ]] || fail "image USER is '$user'; it must be numeric for runAsNonRoot"
pass "runs as a numeric non-root user (uid $uid, USER $user)"

for tool in npm npx yarn corepack; do
  if docker exec "$name" sh -c "command -v $tool" >/dev/null 2>&1; then
    fail "$tool is in the runtime image"
  fi
done
pass "no package managers in the runtime image"

[ "$(docker exec "$name" sh -c 'test -w /app/app.js && echo writable || echo read-only')" = read-only ] \
  || fail "the app user can modify its own code"
pass "app code is read-only to the app user"

[ -n "$(docker inspect --format '{{if .Config.Healthcheck}}yes{{end}}' "$name")" ] || fail "image has no HEALTHCHECK"
pass "image declares a HEALTHCHECK"

docker stop --time 15 "$name" >/dev/null
exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$name")
[ "$exit_code" = 0 ] || fail "exit code $exit_code after SIGTERM, expected 0 from the graceful shutdown"
pass "shuts down cleanly on SIGTERM"

echo "Smoke test passed: $image"
