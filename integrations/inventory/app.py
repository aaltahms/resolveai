"""Independent reference inventory API. Standard-library Python; no ResolveAI imports."""
import argparse
import json
import sqlite3
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

parser = argparse.ArgumentParser()
parser.add_argument('--database', required=True)
parser.add_argument('--read-only', action='store_true')
args = parser.parse_args()
if args.read_only:
    from pathlib import Path
    db = sqlite3.connect(Path(args.database).resolve().as_uri() + '?mode=ro', uri=True)
else:
    db = sqlite3.connect(args.database)
    db.execute('CREATE TABLE IF NOT EXISTS items(sku TEXT PRIMARY KEY, name TEXT NOT NULL)')
    db.commit()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def reply(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())
    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/ready':
            return self.reply(200, {'ready': True})
        if path.startswith('/items/'):
            row = db.execute('SELECT sku,name FROM items WHERE sku=?', (path[7:],)).fetchone()
            return self.reply(200 if row else 404, {'sku': row[0], 'name': row[1]} if row else {'error': 'not_found'})
        self.reply(404, {'error': 'not_found'})
    def do_POST(self):
        if self.path != '/items':
            return self.reply(404, {'error': 'not_found'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1024:
                return self.reply(400, {'error': 'invalid_size'})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict) or not all(isinstance(data.get(k), str) and 0 < len(data[k]) <= 120 for k in ('sku', 'name')):
                return self.reply(400, {'error': 'invalid_item'})
            db.execute('INSERT INTO items VALUES(?,?)', (data['sku'], data['name']))
            db.execute('DELETE FROM items WHERE rowid NOT IN (SELECT rowid FROM items ORDER BY rowid DESC LIMIT 1000)')
            db.commit()
            self.reply(201, {'sku': data['sku']})
        except sqlite3.IntegrityError:
            db.rollback()
            self.reply(409, {'error': 'duplicate_sku'})
        except sqlite3.OperationalError:
            db.rollback()
            # Contract deliberately avoids exposing database internals.
            self.reply(503, {'error': 'storage_unavailable'})
        except (ValueError, TypeError):
            self.reply(400, {'error': 'invalid_request'})

HTTPServer(('127.0.0.1', 4321), Handler).serve_forever()
