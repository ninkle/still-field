"""Loopback-only player with a bounded, optional sensor input endpoint."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from urllib.parse import urlsplit
import hashlib
import json
import math
import time


class ArtServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, page, port=8765):
        self.page = page
        self.build_id = hashlib.sha256(page.read_bytes()).hexdigest()[:16]
        self.lock = Lock()
        self.state = {'values': {}, 'version': 0, 'updated': 0.0}
        super().__init__(('127.0.0.1', port), Handler)


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def allowed(self):
        port = self.server.server_port
        hosts = {f'localhost:{port}', f'127.0.0.1:{port}'}
        return self.headers.get('Host') in hosts and (
            self.headers.get('Origin') is None or
            self.headers.get('Origin') in {f'http://{host}' for host in hosts})

    def reply(self, code, value, kind='application/json'):
        body = value if isinstance(value, bytes) else json.dumps(value).encode()
        self.send_response(code)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.end_headers()
        if self.command != 'HEAD':
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def do_GET(self):
        if not self.allowed():
            return self.reply(403, {'error': 'Local requests only'})
        path = urlsplit(self.path).path
        if path in {'/', '/index.html', '/still-field.html'}:
            return self.reply(200, self.server.page.read_bytes(), 'text/html; charset=utf-8')
        if path == '/health':
            return self.reply(200, {'application': 'still-field', 'version': 1, 'build': self.server.build_id})
        if path == '/api/input':
            with self.server.lock:
                snapshot = dict(self.server.state)
            snapshot['fresh'] = time.monotonic() - snapshot.pop('updated') < 10
            return self.reply(200, snapshot)
        return self.reply(404, {'error': 'Not found'})

    do_HEAD = do_GET

    def do_POST(self):
        if not self.allowed():
            return self.reply(403, {'error': 'Local requests only'})
        if self.path != '/api/input':
            return self.reply(404, {'error': 'Not found'})
        keys = {'presence', 'x', 'y', 'activity', 'light', 'sound', 'motion', 'speed', 'damping', 'impulse'}
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4096:
                raise ValueError('Input must be a small JSON object')
            values = json.loads(self.rfile.read(length))
            if not isinstance(values, dict) or not values or set(values) - keys:
                raise ValueError('Supply supported input fields')
            if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1 for v in values.values()):
                raise ValueError('Values must be finite numbers between 0 and 1')
        except (ValueError, UnicodeError):
            return self.reply(400, {'error': 'Invalid sensor input'})
        with self.server.lock:
            self.server.state.update(values=values, version=self.server.state['version'] + 1, updated=time.monotonic())
        return self.reply(200, {'ok': True})

    def log_message(self, *_):
        pass
