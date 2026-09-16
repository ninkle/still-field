from pathlib import Path
import http.client
import json
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from server import ArtServer


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        page = Path(cls.temp.name) / 'index.html'
        page.write_text('<main>art</main>')
        cls.server = ArtServer(page, 0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, method='GET', path='/', body=None, headers=None):
        client = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        client.request(method, path, body=body, headers=headers or {})
        response = client.getresponse()
        result = response.status, response.read()
        client.close()
        return result

    def test_serves_only_player(self):
        self.assertEqual(self.request()[0], 200)
        self.assertEqual(self.request(path='/../assets/frame.png')[0], 404)
        status, body = self.request(path='/health')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['application'], 'still-field')

    def test_rejects_external_hosts_and_origins(self):
        self.assertEqual(self.request(headers={'Host': 'untrusted.example'})[0], 403)
        self.assertEqual(self.request('POST', '/api/input', '{"presence":1}', {'Origin': 'https://untrusted.example'})[0], 403)

    def test_sensor_validation(self):
        for body in ['{}', '[]', '{"presence":true}', '{"presence":NaN}', '{"presence":2}', '{"unknown":0}', 'x'*4097]:
            self.assertEqual(self.request('POST', '/api/input', body)[0], 400)
        self.assertEqual(self.request('POST', '/api/input', '{"presence":0.7,"x":0.3}')[0], 200)
        state = json.loads(self.request(path='/api/input')[1])
        self.assertEqual(state['values']['presence'], .7)
        self.assertTrue(state['fresh'])


if __name__ == '__main__':
    unittest.main()
