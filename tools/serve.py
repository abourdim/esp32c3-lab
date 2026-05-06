#!/usr/bin/env python3
"""
serve.py — minimal static server for esp32c3-lab.

Why not just open index.html via file://?
  - Service workers + fetch() of manifest.json need a real HTTP origin.
  - Web Bluetooth requires HTTPS or localhost (this counts).

Usage:
  python tools/serve.py            # binds to http://localhost:8000
  python tools/serve.py 8080       # custom port
"""

import http.server
import os
import socketserver
import sys
import webbrowser
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = Path(__file__).resolve().parent.parent  # repo root

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.svg':  'image/svg+xml',
        '.json': 'application/json',
        '.js':   'application/javascript',
        '.mjs':  'application/javascript',
    }

    def end_headers(self):
        # Mild dev-friendly headers — no caching while iterating
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quieter than the default
        sys.stderr.write(f"  [{self.log_date_time_string()}] {fmt % args}\n")

def main():
    os.chdir(ROOT)
    with socketserver.TCPServer(('0.0.0.0', PORT), Handler) as httpd:
        url = f'http://localhost:{PORT}/'
        print(f'esp32c3-lab serving {ROOT}')
        print(f'  → {url}')
        print(f'  Ctrl+C to stop')
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n  stopped.')

if __name__ == '__main__':
    main()
