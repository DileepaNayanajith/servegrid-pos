#!/bin/bash
# Double-click launcher for macOS; keep Terminal open for localhost service.
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is not installed. Get it at https://www.python.org/downloads/macos/"
  echo "Press Enter to exit"
  read -r _
  exit 1
fi
python3 server.py
status=$?
echo "FASTPOS stopped (exit code $status). Press Enter to close this window."
read -r _
exit "$status"
