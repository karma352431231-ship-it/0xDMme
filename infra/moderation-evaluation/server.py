"""Loopback-only experimental evaluation. Never connects to the app/database."""
import hmac
import json
import os
import re
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit

MODEL_HASH = '3c59deeabdc2d29295bf8e3ac7abc5aa6c90fa1d76f4c9df198b903e815d170e'
MAX_BYTES = 8 * 1024 * 1024
TYPES = ('image/png', 'image/jpeg', 'image/webp')
ASSETS = {'/': ('index.html', 'text/html; charset=utf-8'), '/client.js': ('client.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8'), '/source.tar.gz': ('source.tar.gz', 'application/gzip')}


class EvaluationServer(HTTPServer):
    request_queue_size = 4

    def __init__(self, address, *, assets, origin, token, detector):
        parsed = urlsplit(origin)
        if parsed.scheme != 'http' or parsed.hostname != '127.0.0.1' or not parsed.port or parsed.path:
            raise ValueError('Local tunnel origin required.')
        if not re.fullmatch(r'[a-f0-9]{64}', token):
            raise ValueError('Private capability required.')
        self.assets, self.origin, self.authority = assets, origin, parsed.netloc
        self.token, self.detector = token, detector
        super().__init__(address, EvaluationHandler)

    def handle_error(self, _request, _client_address):
        # Disconnects must not write request details or tracebacks to the journal.
        print('Experimental request failed.', flush=True)


class EvaluationHandler(BaseHTTPRequestHandler):
    server: EvaluationServer

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, *_args):
        # No filenames, URL/query, source pixels or access capabilities in request logs.
        return

    def reply(self, status, payload, mime='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(payload)
        self.close_connection = True

    def error(self, status):
        self.reply(status, b'{"error":"evaluation_unavailable"}')

    def local_request(self):
        return (self.headers.get('Host') == self.server.authority
                and self.headers.get('Origin', self.server.origin) == self.server.origin
                and self.headers.get('Sec-Fetch-Site', 'same-origin') in ('none', 'same-origin'))

    def do_GET(self):
        if not self.local_request() or self.path not in ASSETS:
            self.error(404)
            return
        name, mime = ASSETS[self.path]
        self.reply(200, self.server.assets[name], mime)

    def do_POST(self):
        if not self.local_request() or self.path != '/api/evaluate':
            self.error(404)
            return
        if not hmac.compare_digest(self.headers.get('Authorization', '').encode(), ('Bearer ' + self.server.token).encode()):
            self.error(401)
            return
        body = None
        try:
            body, mime = self.image_body()
            started = time.perf_counter()
            # A native inference/decode hang ends this dedicated experiment, never the app.
            deadline = threading.Timer(30, lambda: os._exit(1))
            deadline.daemon = True
            deadline.start()
            try:
                scores = self.server.detector(body, mime)
            finally:
                deadline.cancel()
            result = {'model': 'viddexa/nsfw-detection-2-nano', 'modelHash': MODEL_HASH,
                      'elapsedMs': (time.perf_counter() - started) * 1000, 'scores': scores}
            packed = json.dumps(result, allow_nan=False).encode()
        except (ValueError, OSError):
            self.error(400)
            return
        except Exception:
            self.error(503)
            return
        finally:
            body = None
        self.reply(200, packed)

    def image_body(self):
        length = self.headers.get('Content-Length', '')
        mime = self.headers.get('Content-Type')
        if not re.fullmatch(r'[1-9][0-9]{0,7}', length) or int(length) > MAX_BYTES or mime not in TYPES or self.headers.get('Transfer-Encoding'):
            raise ValueError('Invalid image envelope.')
        body = self.rfile.read(int(length))
        if len(body) != int(length):
            raise ValueError('Incomplete image.')
        return body, mime


def main():
    root = Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(root))
    from detector import Detector
    classifier = Detector(root)
    assets = {name: (root / 'assets' / name).read_bytes() for name, _mime in ASSETS.values()}
    if any(len(value) > 512 * 1024 for value in assets.values()):
        raise RuntimeError('Asset budget exceeded.')
    # systemd supplies credentials in a private read-only directory, never a secret environment value.
    access = json.loads((Path(os.environ['CREDENTIALS_DIRECTORY']) / 'evaluation.json').read_text())
    port = int(access['port'])
    server = EvaluationServer(('127.0.0.1', port), assets=assets, origin=access['origin'],
                              token=access['token'], detector=classifier.classify)
    signal.signal(signal.SIGTERM, lambda *_args: sys.exit(0))
    print('Experimental candidate ready.', flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
