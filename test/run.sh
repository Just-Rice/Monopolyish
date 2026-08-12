#!/bin/sh
# No Node on this machine, so the suite runs on the JavaScriptCore shell that
# ships with macOS.
set -e
cd "$(dirname "$0")/.."

JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
[ -x "$JSC" ] || { echo "JavaScriptCore shell not found at $JSC"; exit 1; }

out=$("$JSC" test/smoke.js 2>&1) || true
printf '%s\n' "$out"
case "$out" in *"❌"*) exit 1 ;; esac
