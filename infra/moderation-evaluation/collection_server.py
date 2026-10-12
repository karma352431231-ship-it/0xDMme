"""Private, loopback-only image collection. No model, disk images, or app access."""
import json
import re
import signal
import sys
import threading
from http.server import HTTPServer
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collection import CollectionError, ImageCollection
from server import EvaluationHandler

ASSETS = {'/': ('index.html', 'text/html; charset=utf-8'),
          '/client.js': ('client.js', 'text/javascript; charset=utf-8'),
          '/style.css': ('style.css', 'text/css; charset=utf-8'),
          '/source.tar.gz': ('source.tar.gz', 'application/gzip')}


def image_envelope(body, mime):
    signatures = {'image/png': body.startswith(b'\x89PNG\r\n\x1a\n'),
                  'image/jpeg': body.startswith(b'\xff\xd8\xff'),
                  'image/webp': body[:4] == b'RIFF' and body[8:12] == b'WEBP'}
    if not signatures.get(mime, False):
        raise CollectionError(400, 'invalid_image')
    # This only checks the envelope. The real decoder validates pixels at evaluation.


class CollectionServer(HTTPServer):
    request_queue_size = 4

    def __init__(self, address, *, assets, token, collection=None):
        if address[0] != '127.0.0.1' or not re.fullmatch(r'[a-f0-9]{64}', token):
            raise ValueError('Loopback and private capability required.')
        self.assets, self.token = assets, token
        self.collection = collection if collection is not None else ImageCollection()
        super().__init__(address, CollectionHandler)
        self.origin = 'http://127.0.0.1:' + str(self.server_port)
        self.authority = urlsplit(self.origin).netloc

    def handle_error(self, _request, _client_address):
        # No filenames, bytes, references, or capabilities in logs.
        print('Collection request failed.', flush=True)


class CollectionHandler(EvaluationHandler):
    """Reuse the existing local transport's origin, auth, and response protections."""
    server: CollectionServer

    def do_GET(self):
        if not self.local_request():
            self.collection_error(404, 'not_found')
            return
        if self.path in ASSETS:
            name, mime = ASSETS[self.path]
            self.reply(200, self.server.assets[name], mime)
            return
        if self.authorized():
            self.dispatch('GET')

    def do_POST(self):
        if self.authorized():
            self.dispatch('POST')

    def do_DELETE(self):
        self.collection_error(405, 'method_unavailable')

    def collection_error(self, status, code):
        self.json_reply(status, {'error': code})

    def dispatch(self, method):
        try:
            self.route(method)
        except CollectionError as error:
            self.collection_error(error.status, error.code)
        except KeyError:
            self.collection_error(404, 'not_found')
        except (ValueError, OSError):
            self.collection_error(400, 'invalid_request')
        except Exception:
            self.collection_error(503, 'collection_unavailable')

    def empty_body(self):
        if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Length', '0') != '0':
            raise CollectionError(400, 'invalid_request')

    def route(self, method):
        collection = self.server.collection
        if method == 'GET' and self.path == '/api/cases':
            self.json_reply(200, collection.snapshot())
            return
        if method == 'POST' and self.path == '/api/cases':
            collection.writable()
            body, mime = self.image_body()
            image_envelope(body, mime)
            saved = collection.add(body, mime, self.headers.get('X-Collection-Reference'))
            self.json_reply(200, saved)
            return
        if method == 'POST' and self.path == '/api/complete':
            self.empty_body()
            self.json_reply(200, collection.complete())
            return
        match = re.fullmatch(r'/api/cases/([a-f0-9-]{36})/(image|reference)', self.path)
        if match and method == 'GET' and match[2] == 'image':
            body, mime = collection.image(match[1])
            self.reply(200, body, mime)
            return
        if match and method == 'POST' and match[2] == 'reference':
            value = self.collection_reference()
            self.json_reply(200, collection.annotate(match[1], value))
            return
        self.collection_error(404, 'not_found')

    def collection_reference(self):
        body = self.rfile.read(self.json_length())
        value = json.loads(body)
        if not isinstance(value, dict) or set(value) != {'reference'}:
            raise CollectionError(400, 'invalid_reference')
        return ImageCollection.reference(value['reference'])

    def json_length(self):
        length = self.headers.get('Content-Length', '')
        if (not re.fullmatch(r'[1-9][0-9]{0,2}', length) or int(length) > 128
                or self.headers.get('Content-Type') != 'application/json'
                or self.headers.get('Transfer-Encoding')):
            raise CollectionError(400, 'invalid_request')
        return int(length)


def main():
    assets_root = Path(sys.argv[1]).resolve()
    config = json.loads(sys.stdin.readline(1024))
    if set(config) != {'token', 'port'}:
        raise ValueError('Invalid private configuration.')
    assets = {name: (assets_root / name).read_bytes() for name, _ in ASSETS.values()}
    if any(len(value) > 1024**2 for value in assets.values()):
        raise ValueError('Asset budget exceeded.')
    server = CollectionServer(('127.0.0.1', config['port']), assets=assets, token=config['token'])
    # Expiry shuts down the dedicated process, even if nobody opens the page again.
    expiry = threading.Timer(86400, server.shutdown)
    expiry.daemon = True
    expiry.start()
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    print('Private image collection ready.', flush=True)
    try:
        server.serve_forever()
    finally:
        expiry.cancel()
        server.collection.entries.clear()
        server.collection.hashes.clear()
        server.server_close()


if __name__ == '__main__':
    main()
