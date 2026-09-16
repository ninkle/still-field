#!/bin/zsh
set -u
unsetopt BG_NICE
cd -- "${0:A:h}" || exit 1

stillfield_fail() {
  local result="$1"
  print -u2 -- "Still Field stopped (exit $result). $2"
  if [[ "$result" == 137 ]]; then
    print -u2 -- 'The process received SIGKILL. This message alone does not identify why macOS killed it.'
  fi
  if [[ -t 0 ]]; then
    read 'reply?Press Return to close.'
  fi
  exit "$result"
}

print -- 'Starting Still Field...'
if [[ -x /opt/homebrew/bin/python3 ]]; then
  stillfield_python=/opt/homebrew/bin/python3
elif [[ -x /usr/local/bin/python3 ]]; then
  stillfield_python=/usr/local/bin/python3
elif command -v python3 >/dev/null 2>&1; then
  stillfield_python=$(command -v python3)
else
  stillfield_fail 1 'Install Python 3 from https://www.python.org/downloads/macos/ and try again.'
fi

print -- "Checking Python: $stillfield_python"
"$stillfield_python" -u -c 'import sys; print(sys.version.split()[0], flush=True); sys.exit(0 if sys.version_info >= (3, 9) else 1)'
stillfield_result=$?
if (( stillfield_result != 0 )); then
  stillfield_fail "$stillfield_result" 'Python could not pass its startup check. The artwork has not started.'
fi

# Keep the Mac awake without putting the Python process inside a wrapper.
# -w releases the assertion if this launcher exits, even if it is killed.
/usr/bin/caffeinate -di -w $$ &
stillfield_awake_pid=$!
trap 'kill "$stillfield_awake_pid" 2>/dev/null || true' EXIT

"$stillfield_python" -u scripts/run.py "$@"
stillfield_result=$?
if (( stillfield_result != 0 && stillfield_result != 130 )); then
  stillfield_fail "$stillfield_result" 'Keep the startup messages above for troubleshooting.'
fi
exit "$stillfield_result"
