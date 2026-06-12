#!/usr/bin/env python3
import http.server
import socketserver

PORT = 5003

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory='.', **kwargs)
    
    def do_GET(self):
        if self.path == '/' or self.path == '/chapters':
            self.path = '/chapters_1_7.html'
        return super().do_GET()

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()