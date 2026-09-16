#!/usr/bin/env python3
"""Optional macOS LaunchAgent. Run on the installation Mac after setup."""
from pathlib import Path
import argparse
import plistlib
import subprocess
import sys

LABEL = 'local.still-field.player'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['install', 'remove'])
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('This helper is for macOS only')
    location = Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')
    if args.action == 'remove':
        if location.exists():
            subprocess.run(['/bin/launchctl', 'unload', str(location)], check=False)
            location.unlink()
        print('Login startup removed. Quit the Still Field Chrome window separately if it is open.')
        return
    root = Path(__file__).resolve().parent.parent
    logs = Path.home() / 'Library/Logs/Still Field'
    logs.mkdir(parents=True, exist_ok=True)
    location.parent.mkdir(parents=True, exist_ok=True)
    config = {'Label': LABEL,
              'ProgramArguments': ['/usr/bin/caffeinate', '-di', sys.executable, str(root / 'scripts/run.py'), '--kiosk'],
              'WorkingDirectory': str(root), 'RunAtLoad': True,
              'KeepAlive': {'SuccessfulExit': False}, 'ThrottleInterval': 30,
              'StandardOutPath': str(logs / 'player.log'), 'StandardErrorPath': str(logs / 'error.log')}
    location.write_bytes(plistlib.dumps(config))
    print(f'Installed {location}\nStarts after your next macOS login. To test now: ./start.command --kiosk\nThe Mac must log in; this does not bypass FileVault or the login screen.')


if __name__ == '__main__':
    main()
