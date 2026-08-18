#!/usr/bin/env python3
"""Servidor mínimo para probar el prototipo en el móvil.

  python3 serve.py            -> http://<ip-local>:8000  (sensores bloqueados salvo localhost)
  python3 serve.py --https    -> https://<ip-local>:8443 (certificado autofirmado, sensores OK)

Chrome en Android solo entrega DeviceMotionEvent en contexto seguro:
https:// o localhost. Con --https se genera un certificado autofirmado
(requiere openssl) y el navegador pedirá aceptar el aviso de seguridad
una vez: "Configuración avanzada" -> "Acceder a ...".
"""
import argparse
import http.server
import os
import socket
import ssl
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
CERT = os.path.join(ROOT, ".devcert.pem")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # Sin caché: al probar en el agua interesa recargar y ver el cambio.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def ensure_cert():
    if os.path.exists(CERT):
        return
    print("Generando certificado autofirmado en .devcert.pem ...")
    subprocess.run(
        ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
         "-keyout", CERT, "-out", CERT, "-days", "365",
         "-subj", "/CN=%s" % local_ip(),
         "-addext", "subjectAltName=IP:%s,IP:127.0.0.1" % local_ip()],
        check=True,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--https", action="store_true", help="servir por https con cert autofirmado")
    ap.add_argument("--port", type=int, default=None)
    args = ap.parse_args()

    port = args.port or (8443 if args.https else 8000)
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    scheme = "http"

    if args.https:
        ensure_cert()
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(CERT)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        scheme = "https"

    print("Sirviendo %s en:" % ROOT)
    print("  %s://localhost:%d" % (scheme, port))
    print("  %s://%s:%d   <- abre esta en el móvil" % (scheme, local_ip(), port))
    print("Ctrl+C para parar.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
