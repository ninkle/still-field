#!/bin/zsh
set -eu
cd -- "${0:A:h}"
if [[ -x /opt/homebrew/bin/python3 ]]; then
  stillfield_python=/opt/homebrew/bin/python3
elif [[ -x /usr/local/bin/python3 ]]; then
  stillfield_python=/usr/local/bin/python3
elif command -v python3 >/dev/null 2>&1; then
  stillfield_python=$(command -v python3)
else
  print 'Install Python 3 from https://www.python.org/downloads/macos/ and try again.'
  read 'reply?Press Return to close.'
  exit 1
fi
exec /usr/bin/caffeinate -di "$stillfield_python" scripts/run.py "$@"
