#!/bin/sh
# No Node on this machine, so the suites run on the JavaScriptCore shell that
# ships with macOS.
set -e
cd "$(dirname "$0")/.."

JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
[ -x "$JSC" ] || { echo "JavaScriptCore shell not found at $JSC"; exit 1; }

status=0
for suite in smoke online; do
  printf '\n=== %s ===\n' "$suite"
  out=$("$JSC" "test/$suite-test.js" 2>&1) || out=$("$JSC" "test/$suite.js" 2>&1) || status=1
  printf '%s\n' "$out"
  case "$out" in *"❌"*) status=1 ;; esac
done

printf '\n'
if [ "$status" -eq 0 ]; then echo "all suites clean"; else echo "some suites reported failures"; fi
exit "$status"
