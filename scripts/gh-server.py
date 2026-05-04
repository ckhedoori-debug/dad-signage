#!/usr/bin/env python3
"""Range-capable static file server for the Grace House kiosk.

Drop-in replacement for `python3 -m http.server` with HTTP/1.1 Range support
(needed to stream the lobby-tv hero video, which is multi-GB and would
otherwise force the browser to preload the entire file before playback).

Listens on 127.0.0.1:9000, rooted at $HOME/grace-house. Started by the
gh-server systemd user service.
"""
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 9000
HOST = "127.0.0.1"
ROOT = os.path.expanduser("~/grace-house")


class RangeHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        try:
            total = os.fstat(f.fileno()).st_size
            ctype = self.guess_type(path)
            range_header = self.headers.get("Range")

            if range_header:
                m = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
                if m and (m.group(1) or m.group(2)):
                    start = int(m.group(1)) if m.group(1) else 0
                    end = int(m.group(2)) if m.group(2) else total - 1
                    if start >= total or end >= total or start > end:
                        f.close()
                        self.send_error(416, "Requested Range Not Satisfiable")
                        return None
                    length = end - start + 1
                    self.send_response(206)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Content-Range", f"bytes {start}-{end}/{total}")
                    self.send_header("Content-Length", str(length))
                    self.end_headers()
                    f.seek(start)
                    return BoundedReader(f, length)

            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(total))
            self.end_headers()
            return f
        except Exception:
            f.close()
            raise


class BoundedReader:
    """Wrap a file object so .read() returns at most `limit` bytes total."""
    def __init__(self, f, limit):
        self._f = f
        self._left = limit

    def read(self, size=-1):
        if self._left <= 0:
            return b""
        if size < 0 or size > self._left:
            size = self._left
        data = self._f.read(size)
        self._left -= len(data)
        return data

    def close(self):
        self._f.close()


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    if not os.path.isdir(ROOT):
        sys.stderr.write(f"gh-server: ROOT not found: {ROOT}\n")
        sys.exit(1)
    os.chdir(ROOT)
    print(f"gh-server (range-capable) listening on http://{HOST}:{PORT}/ rooted at {ROOT}", flush=True)
    Server((HOST, PORT), RangeHandler).serve_forever()
