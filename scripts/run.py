#!/usr/bin/env python3
"""Build, serve and open Still Field. No pip or npm installation needed."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.request
from build import build
from server import ArtServer


def open_player(url, kiosk=False):
    if sys.platform != 'darwin':
        print(f'Open in Chrome: {url}', flush=True)
        return
    chrome = Path('/Applications/Google Chrome.app')
    if not chrome.exists():
        chrome = Path.home() / 'Applications/Google Chrome.app'
    if not chrome.exists():
        print(f'Install Google Chrome, then open {url}', flush=True)
        return
    profile = Path.home() / 'Library/Application Support/Still Field/Chrome'
    args = ['/usr/bin/open', '-n', '-a', str(chrome), '--args',
            f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check']
    # This dedicated profile preserves device permissions and settings across launches.
    args += ['--kiosk', url + '?display=1'] if kiosk else [f'--app={url}']
    subprocess.run(args, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-open', action='store_true', help='Serve without opening Chrome')
    parser.add_argument('--kiosk', action='store_true', help='Open Chrome full screen; S shows settings')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('port must be between 1024 and 65535')
    page = build()
    url = f'http://localhost:{args.port}/'
    server = None
    try:
        server = ArtServer(page, args.port)
    except OSError as error:
        # Reuse only our own running build; never terminate an unrelated service.
        try:
            with urllib.request.urlopen(url + 'health', timeout=2) as response:
                health = json.load(response)
            same = isinstance(health, dict) and health.get('application') == 'still-field' and health.get('build') == hashlib.sha256(page.read_bytes()).hexdigest()[:16]
        except (OSError, ValueError, urllib.error.URLError):
            same = False
        if not same:
            print(f'Cannot start on port {args.port}: {error}\nStop the old player, or run with --port 8766.', file=sys.stderr)
            return 1
        print('Still Field is already running.', flush=True)
    print(f'Art player: {url}\nCamera and microphone access are controlled in the player.\nCtrl+C stops the server.', flush=True)
    if not args.no_open:
        open_player(url, args.kiosk)
    if server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
