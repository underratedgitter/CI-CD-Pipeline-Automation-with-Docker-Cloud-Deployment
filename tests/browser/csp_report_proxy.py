"""Reverse proxy that makes CSP violations observable.

Serves <upstream> on 127.0.0.1:<port>, appends `report-uri /__csp-report` to
the upstream's Content-Security-Policy, and appends each violation report the
browser POSTs to <report-file>, one JSON document per line. Standard library
only, so CI needs nothing installed.

    python3 csp_report_proxy.py <upstream> <port> <report-file>
"""

import http.server
import sys
import urllib.error
import urllib.request

UPSTREAM, PORT, REPORT_FILE = sys.argv[1], int(sys.argv[2]), sys.argv[3]
HOP_BY_HOP = {"transfer-encoding", "connection", "content-length"}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with open(REPORT_FILE, "ab") as reports:
            reports.write(body + b"\n")
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        try:
            response = urllib.request.urlopen(UPSTREAM + self.path, timeout=10)
        except urllib.error.HTTPError as err:  # 4xx/5xx still carry headers and a body
            response = err
        with response:
            data = response.read()
            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() in HOP_BY_HOP:
                    continue
                if key.lower() == "content-security-policy":
                    value += "; report-uri /__csp-report"
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def log_message(self, *_args: object) -> None:
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
