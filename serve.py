"""Simple HTTP server with no caching for development."""
import http.server
import os

os.chdir(os.path.join(os.path.dirname(__file__), 'src'))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    http.server.HTTPServer(('', 8090), NoCacheHandler).serve_forever()
