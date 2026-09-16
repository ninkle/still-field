#!/usr/bin/env python3
"""Build the offline player using only Python's standard library."""
from pathlib import Path
import base64
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent


def encoded(path):
    return base64.b64encode(path.read_bytes()).decode('ascii')


def build(destination=None):
    destination = Path(destination) if destination else ROOT / 'dist/index.html'
    vendor = ROOT / 'vendor/camera'
    manifest = json.loads((vendor / 'manifest.json').read_text())
    for name, spec in manifest.items():
        content = (vendor / name).read_bytes()
        if len(content) != spec['bytes'] or hashlib.sha256(content).hexdigest() != spec['sha256']:
            raise ValueError(f'Detector asset failed verification: {name}')
    model = json.loads((vendor / 'model.json').read_text())
    weights = b''.join((vendor / name).read_bytes() for group in model['weightsManifest'] for name in group['paths'])
    camera = {'model': model, 'weights': base64.b64encode(weights).decode('ascii'),
              'tfjs': encoded(vendor / 'tf.min.js'), 'coco': encoded(vendor / 'coco-ssd.min.js')}
    source = ROOT / 'src'
    artwork = (source / 'ripple-art.fragment.html').read_text()
    for key, value in {
        'TEXTURE': 'data:image/png;base64,' + encoded(ROOT / 'assets/frame.png'),
        'SEED': 'data:image/png;base64,' + encoded(ROOT / 'assets/ripple-seed.png'),
        'PHYSICS': (source / 'wave-physics.js').read_text(),
        'TRACKING': (source / 'person-tracking.js').read_text(),
        'JUMP_TRACKING': (source / 'jump-tracking.js').read_text(),
    }.items():
        artwork = artwork.replace('{{' + key + '}}', value)
    page = (source / 'installation-shell.html').read_text()
    for key, value in {
        'ARTWORK': artwork,
        'SETTINGS_PANEL': (source / 'settings-panel.html').read_text(),
        'SETTINGS_SCRIPT': (source / 'installation-settings.js').read_text(),
        'CAMERA_PANEL': (source / 'camera-panel.html').read_text(),
        'CAMERA_ASSETS': json.dumps(camera, separators=(',', ':')).replace('</', '<\\/'),
        'INSTALLATION_SCRIPT': (source / 'installation.js').read_text(),
        'CAMERA_SCRIPT': (source / 'camera-controller.js').read_text(),
    }.items():
        page = page.replace('{{' + key + '}}', value)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(page)
    temporary.replace(destination)
    return destination


if __name__ == '__main__':
    output = build()
    print(f'Built {output.name}: {output.stat().st_size:,} bytes; detector checksums verified.')
