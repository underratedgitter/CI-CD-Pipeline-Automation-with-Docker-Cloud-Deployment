#!/usr/bin/env bash
# Loads the portfolio in headless Chrome under the app's real CSP and fails if
# the page does not render or the browser reports any policy violation. Catches
# a portfolio change (an analytics snippet, a library that injects <style>)
# that the strict policy would silently break.
#
#   bash tests/browser/csp-check.sh <base-url>        e.g. http://127.0.0.1:3999
#
# CHROME overrides the browser binary.
set -euo pipefail

base=${1:?usage: tests/browser/csp-check.sh <base-url>}
here=$(cd "$(dirname "$0")" && pwd)
port=3990
work=$(mktemp -d)
reports="$work/reports.ndjson"
: > "$reports"

chrome=${CHROME:-}
if [ -z "$chrome" ]; then
  for candidate in google-chrome google-chrome-stable chromium chromium-browser \
                   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if command -v "$candidate" >/dev/null 2>&1 || [ -x "$candidate" ]; then chrome=$candidate; break; fi
  done
fi
[ -n "$chrome" ] || { echo "FAIL: no Chrome found; set CHROME" >&2; exit 1; }

python3 -I "$here/csp_report_proxy.py" "$base" "$port" "$reports" &
proxy=$!
cleanup() {
  local status=$?
  kill "$proxy" 2>/dev/null || true
  wait "$proxy" 2>/dev/null || true   # a killed proxy reports 143; not our result
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT
for _ in $(seq 1 20); do curl -s -o /dev/null "http://127.0.0.1:$port/health" && break; sleep 0.5; done

"$chrome" --headless=new --disable-gpu --no-first-run --no-sandbox \
  --user-data-dir="$work/profile" --virtual-time-budget=10000 --window-size=1366,900 \
  --dump-dom "http://127.0.0.1:$port/" > "$work/dom.html" 2>/dev/null
sleep 2   # reports are sent asynchronously after the load

# Characters of markup and text inside #root, counted with a real parser.
rendered=$(python3 -I -c '
import sys
from html.parser import HTMLParser

class Root(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.size = 0
    def handle_starttag(self, tag, attrs):
        if self.depth:
            self.size += len(self.get_starttag_text() or "")
            if tag not in self.VOID:
                self.depth += 1
        elif ("id", "root") in attrs:
            self.depth = 1
    def handle_endtag(self, tag):
        if self.depth and tag not in self.VOID:
            self.depth -= 1
    def handle_data(self, data):
        if self.depth:
            self.size += len(data)

parser = Root()
parser.feed(open(sys.argv[1]).read())
print(parser.size)' "$work/dom.html")
[ "$rendered" -gt 1000 ] || { echo "FAIL: the page did not render (#root has $rendered characters)" >&2; exit 1; }
echo "ok   the portfolio renders in Chrome ($rendered characters in #root)"

violations=$(grep -c . "$reports" || true)
if [ "$violations" -gt 0 ]; then
  echo "FAIL: $violations CSP violation report(s):" >&2
  python3 -I -c '
import json, sys
for line in open(sys.argv[1]):
    r = json.loads(line).get("csp-report", {})
    print("  ", r.get("violated-directive"), "blocked", r.get("blocked-uri"), r.get("script-sample", ""))' "$reports" | sort -u >&2
  exit 1
fi
echo "ok   no Content-Security-Policy violations"
