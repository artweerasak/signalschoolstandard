#!/usr/bin/env python3
"""
Binary-to-modern Office format converter  (port 2004)
รับ .ppt / .doc / .xls  →  คืน .pptx / .docx / .xlsx
Python 3.13 compatible (ไม่ใช้ cgi module ที่ถูกลบแล้ว)
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import subprocess, tempfile, os, re, threading

CONVERT_MAP = {'.ppt': 'pptx', '.doc': 'docx', '.xls': 'xlsx'}

_lock = threading.Lock()   # LibreOffice ทำงานทีละกระบวนการ


def _parse_multipart(headers, rfile):
    """คืน dict: name → {'content': bytes, 'filename': str|None}"""
    ct = headers.get('Content-Type', '')
    m  = re.search(r'boundary=([^\s;]+)', ct)
    if not m:
        return {}
    boundary = m.group(1).strip('"').encode()
    size     = int(headers.get('Content-Length', 0))
    body     = rfile.read(size)

    parts = {}
    for part in body.split(b'--' + boundary):
        if b'\r\n\r\n' not in part:
            continue
        hdr_raw, _, payload = part.partition(b'\r\n\r\n')
        payload = payload.rstrip(b'\r\n').rstrip(b'--')
        nm = re.search(rb'name="([^"]*)"',     hdr_raw)
        fn = re.search(rb'filename="([^"]*)"', hdr_raw)
        if nm:
            parts[nm.group(1).decode()] = {
                'content':  payload,
                'filename': fn.group(1).decode() if fn else None,
            }
    return parts


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass

    def do_POST(self):
        if self.path != '/convert-to-modern':
            self._err(404, 'Not found'); return

        ct = self.headers.get('Content-Type', '')
        if 'multipart/form-data' not in ct:
            self._err(400, 'Expected multipart/form-data'); return

        parts = _parse_multipart(self.headers, self.rfile)
        if 'file' not in parts:
            self._err(400, 'Missing field: file'); return

        item  = parts['file']
        fname = item['filename'] or 'input'
        ext   = os.path.splitext(fname)[1].lower()
        if ext not in CONVERT_MAP:
            self._err(400, f'Unsupported: {ext}'); return

        target_fmt = CONVERT_MAP[ext]

        with _lock:
            with tempfile.TemporaryDirectory() as d:
                in_path  = os.path.join(d, 'input' + ext)
                out_path = os.path.join(d, 'input.' + target_fmt)
                ulo      = f'file://{d}/lo-profile'

                with open(in_path, 'wb') as f:
                    f.write(item['content'])

                r = subprocess.run(
                    ['libreoffice', '--headless',
                     f'-env:UserInstallation={ulo}',
                     '--convert-to', target_fmt, in_path,
                     '--outdir', d],
                    capture_output=True, timeout=120,
                )
                if r.returncode != 0 or not os.path.exists(out_path):
                    msg = r.stderr.decode(errors='replace')[:400]
                    self._err(500, f'LibreOffice error: {msg}'); return

                with open(out_path, 'rb') as f:
                    data = f.read()

        self.send_response(200)
        self.send_header('Content-Type',       'application/octet-stream')
        self.send_header('Content-Length',     str(len(data)))
        self.send_header('X-Converted-Ext',    '.' + target_fmt)
        self.end_headers()
        self.wfile.write(data)

    def _err(self, code, msg):
        body = msg.encode()
        self.send_response(code)
        self.send_header('Content-Type',   'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    port = int(os.environ.get('CONVERTER_PORT', 2004))
    srv  = HTTPServer(('0.0.0.0', port), Handler)
    print(f'converter_server: listening on :{port}', flush=True)
    srv.serve_forever()
