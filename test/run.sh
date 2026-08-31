#!/bin/sh
# Runs on the JavaScriptCore shell that ships with macOS, or on Node if that is
# what the machine has. The suites themselves are engine-agnostic; node-run.js
# supplies the handful of globals jsc gives a script for free.
set -e
cd "$(dirname "$0")/.."

JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc

if [ -x "$JSC" ]; then
  RUN="$JSC"
elif command -v node >/dev/null 2>&1; then
  RUN="node test/node-run.js"
else
  echo "Needs either the JavaScriptCore shell ($JSC) or node on PATH."
  exit 1
fi

status=0
for suite in smoke online; do
  printf '\n=== %s ===\n' "$suite"
  out=$($RUN "test/$suite-test.js" 2>&1) || status=1
  printf '%s\n' "$out"
  case "$out" in *"❌"*) status=1 ;; esac
done

printf '\n'
if [ "$status" -eq 0 ]; then echo "all suites clean"; else echo "some suites reported failures"; fi
exit "$status"
