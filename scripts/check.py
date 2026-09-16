#!/usr/bin/env python3
"""Developer checks. Requires Python 3.9+ and Node 18+; no dependencies."""
from html.parser import HTMLParser
from pathlib import Path
import json
import subprocess
import sys
import tempfile
from build import ROOT, build


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.current = [dict(attrs).get('type', ''), '']

    def handle_data(self, data):
        if self.current is not None:
            self.current[1] += data

    def handle_endtag(self, tag):
        if tag == 'script' and self.current is not None:
            self.scripts.append(self.current)
            self.current = None


def main():
    page = build()
    text = page.read_text()
    if '{{ARTWORK}}' in text or '/Users/' in text:
        raise AssertionError('Unresolved template or machine-specific path in player')
    parser = Scripts()
    parser.feed(text)
    with tempfile.TemporaryDirectory() as folder:
        for index, (kind, code) in enumerate(parser.scripts):
            if kind == 'application/json':
                json.loads(code)
            else:
                script = Path(folder) / f'script-{index}.js'
                script.write_text(code)
                subprocess.run(['node', '--check', str(script)], check=True)
    for test in sorted((ROOT / 'tests').glob('check-*.js')):
        subprocess.run(['node', str(test)], cwd=ROOT, check=True)
    subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], cwd=ROOT, check=True)
    print('Offline build, packaged JavaScript and installation checks passed.')


if __name__ == '__main__':
    main()
