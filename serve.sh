#!/usr/bin/env bash
# Launch the static server (Python 3 required)
set -e
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  python3 tools/serve.py "$@"
elif command -v python >/dev/null 2>&1; then
  python tools/serve.py "$@"
else
  echo "Python 3 not found. Install from python.org and try again." >&2
  exit 1
fi
