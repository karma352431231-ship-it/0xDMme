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

# Required with Python -I -S, where the script directory is not added automatically.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gallery import CalibrationGallery, GalleryExpired, GalleryFull, MAX_PREVIEW_BYTES, REFERENCES

MODEL_HASH = '3c59deeabdc2d29295bf8e3ac7abc5aa6c90fa1d76f4c9df198b903e815d170e'
MAX_BYTES = 8 * 1024 * 1024
TYPES = ('image/png', 'image/jpeg', 'image/webp')
ASSETS = {'/': ('index.html', 'text/html; charset=utf-8'), '/client.js': ('client.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8'), '/source.tar.gz': ('source.tar.gz', 'application/gzip')}


class EvaluationServer(HTTPServer):
    request_queue_size = 4

    def __init__(self, address, *, assets, origin, token, detector, preview, gallery=None):
        parsed = urlsplit(origin)
        if parsed.scheme != 'http' or parsed.hostname != '127.0.0.1' or not parsed.port or parsed.path:
            raise ValueError('Local tunnel origin required.')
        if not re.fullmatch(r'[a-f0-9]{64}', token):
            raise ValueError('Private capability required.')
        self.assets, self.origin, self.authority = assets, origin, parsed.netloc
        self.token, self.detector = token, detector
        self.preview = preview
        self.gallery = gallery if gallery is not None else CalibrationGallery()
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

    def reply(self, status, payload, mime='application/json', *, download=False):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
        self.send_header('Connection', 'close')
        if download:
            self.send_header('Content-Disposition', 'attachment; filename="0xdmme-calibration.zip"')
        self.end_headers()
        deadline = time.monotonic() + (180 if download else 45)
        for offset in range(0, len(payload), 262144):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('Experimental response deadline exceeded.')
            self.connection.settimeout(min(15, remaining))
            self.wfile.write(payload[offset:offset + 262144])
        self.close_connection = True

    def error(self, status):
        code = {410: 'round_expired', 507: 'round_full'}.get(status, 'evaluation_unavailable')
        self.json_reply(status, {'error': code})

    def json_reply(self, status, value):
        self.reply(status, json.dumps(value, allow_nan=False, separators=(',', ':')).encode())

    def local_request(self):
        return (self.headers.get('Host') == self.server.authority
                and self.headers.get('Origin', self.server.origin) == self.server.origin
                and self.headers.get('Sec-Fetch-Site', 'same-origin') in ('none', 'same-origin'))

    def do_GET(self):
        if not self.local_request():
            self.error(404)
            return
        if self.path in ASSETS:
            name, mime = ASSETS[self.path]
            self.reply(200, self.server.assets[name], mime)
            return
        if self.authorized():
            self.gallery_request('GET')

    def authorized(self):
        if not self.local_request():
            self.error(404)
            return False
        if not hmac.compare_digest(self.headers.get('Authorization', '').encode(), ('Bearer ' + self.server.token).encode()):
            self.error(401)
            return False
        return True

    def do_POST(self):
        if not self.authorized():
            return
        if self.path != '/api/evaluate':
            self.gallery_request('POST')
            return
        body = None
        try:
            reference = self.headers.get('X-Evaluation-Reference')
            if reference not in REFERENCES:
                raise ValueError('Choose an explicit reference.')
            body, mime = self.image_body()
            self.server.gallery.capacity(len(body) + MAX_PREVIEW_BYTES)
            started = time.perf_counter()
            # A native inference/decode hang ends this dedicated experiment, never the app.
            deadline = threading.Timer(30, lambda: os._exit(1))
            deadline.daemon = True
            deadline.start()
            try:
                scores = self.server.detector(body, mime)
                elapsed_ms = (time.perf_counter() - started) * 1000
                preview = self.server.preview(body)
            finally:
                deadline.cancel()
            result = {'model': 'viddexa/nsfw-detection-2-nano', 'modelHash': MODEL_HASH,
                      'elapsedMs': elapsed_ms, 'scores': scores}
            saved = self.server.gallery.add(body, mime, preview, reference, result)
            packed = json.dumps(saved, allow_nan=False, separators=(',', ':')).encode()
        except GalleryFull:
            self.error(507)
            return
        except GalleryExpired:
            self.error(410)
            return
        except (ValueError, OSError):
            self.error(400)
            return
        except Exception:
            self.error(503)
            return
        finally:
            body = None
        self.reply(200, packed)

    def do_DELETE(self):
        if self.authorized():
            self.gallery_request('DELETE')

    def gallery_request(self, method):
        try:
            self.route_gallery(method)
        except GalleryExpired:
            self.error(410)
        except KeyError:
            self.error(404)
        except (ValueError, OSError):
            self.error(400)
        except Exception:
            self.error(503)

    def route_gallery(self, method):
        gallery = self.server.gallery
        if method == 'GET' and self.path == '/api/cases':
            self.json_reply(200, gallery.snapshot())
            return
        if method == 'DELETE' and self.path == '/api/cases':
            gallery.active()
            gallery.erase()
            self.json_reply(200, gallery.snapshot())
            return
        if method == 'GET' and self.path == '/api/export':
            self.reply(200, gallery.archive(), 'application/zip', download=True)
            return
        match = re.fullmatch(r'/api/cases/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})/(image|preview|reference)', self.path)
        if match and method == 'GET' and match[2] in ('image', 'preview'):
            payload, mime = gallery.image(match[1], match[2])
            self.reply(200, payload, mime)
            return
        if match and method == 'POST' and match[2] == 'reference':
            self.json_reply(200, gallery.annotate(match[1], self.reference_body()))
            return
        self.error(404)

    def reference_body(self):
        length = self.headers.get('Content-Length', '')
        if (not re.fullmatch(r'[1-9][0-9]{0,2}', length) or int(length) > 256
                or self.headers.get('Content-Type') != 'application/json' or self.headers.get('Transfer-Encoding')):
            raise ValueError('Invalid annotation envelope.')
        body = self.rfile.read(int(length))
        if len(body) != int(length):
            raise ValueError('Incomplete annotation.')
        value = json.loads(body)
        if not isinstance(value, dict) or set(value) != {'reference'} or value['reference'] not in REFERENCES:
            raise ValueError('Invalid annotation.')
        return value['reference']

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
                              token=access['token'], detector=classifier.classify, preview=classifier.preview)
    signal.signal(signal.SIGTERM, lambda *_args: sys.exit(0))
    print('Experimental candidate ready.', flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.gallery.erase()
        server.server_close()


if __name__ == '__main__':
    main()
