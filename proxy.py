#!/usr/bin/env python3
"""Reverse proxy for developing Deriva web apps locally.

Serves static files from an app's build directory and proxies API requests
(/ermrest, /authn, /chaise) to a remote Deriva server, forwarding cookies
to handle authentication. This avoids CORS issues during development.

Usage:
    python proxy.py --backend dev.example.org --app erd-browser
    python proxy.py --backend dev.example.org --app erd-browser/dist --port 9000

The app argument can be either:
  - An app name (e.g., "erd-browser") — serves from <name>/dist/
  - A path to a directory containing built static files

Requirements: Python 3.10+ (stdlib only, no dependencies).
"""

from __future__ import annotations

import argparse
import http.server
import mimetypes
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

# Paths that get proxied to the Deriva backend
PROXY_PREFIXES = ("/ermrest", "/authn", "/chaise")


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    """Serves static files and proxies Deriva API requests."""

    backend: str  # e.g., "https://dev.example.org"
    static_dir: Path
    ssl_context: ssl.SSLContext

    def translate_path(self, path: str) -> str:
        """Resolve static file paths relative to the app directory."""
        # Strip query string
        path = urllib.parse.urlparse(path).path
        # Normalize and join with static dir
        parts = path.strip("/").split("/")
        result = self.static_dir
        for part in parts:
            if part and part != "..":
                result = result / part
        return str(result)

    def do_GET(self) -> None:
        if self._is_proxy_path():
            self._proxy_request("GET")
        else:
            self._serve_static()

    def do_POST(self) -> None:
        if self._is_proxy_path():
            self._proxy_request("POST")
        else:
            self.send_error(405, "POST only supported for proxied paths")

    def do_PUT(self) -> None:
        if self._is_proxy_path():
            self._proxy_request("PUT")
        else:
            self.send_error(405, "PUT only supported for proxied paths")

    def do_DELETE(self) -> None:
        if self._is_proxy_path():
            self._proxy_request("DELETE")
        else:
            self.send_error(405, "DELETE only supported for proxied paths")

    def _is_proxy_path(self) -> bool:
        path = urllib.parse.urlparse(self.path).path
        return any(path.startswith(p) for p in PROXY_PREFIXES)

    def _serve_static(self) -> None:
        """Serve static files, falling back to index.html for SPA routing."""
        translated = self.translate_path(self.path)
        file_path = Path(translated)

        # If it's a file, serve it directly
        if file_path.is_file():
            super().do_GET()
            return

        # SPA fallback: serve index.html for any non-file path
        index = self.static_dir / "index.html"
        if index.is_file():
            self.send_response(200)
            content_type = "text/html"
            self.send_header("Content-Type", content_type)
            content = index.read_bytes()
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_error(404, "Not found (and no index.html for SPA fallback)")

    def _proxy_request(self, method: str) -> None:
        """Forward request to the Deriva backend, passing cookies through."""
        target_url = self.backend + self.path

        # Read request body if present
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        req = urllib.request.Request(target_url, data=body, method=method)

        # Forward relevant headers
        for header in ("Cookie", "Content-Type", "Accept", "Authorization"):
            value = self.headers.get(header)
            if value:
                req.add_header(header, value)

        # Identify as proxy
        req.add_header("X-Forwarded-For", self.client_address[0])

        try:
            with urllib.request.urlopen(req, context=self.ssl_context) as resp:
                self.send_response(resp.status)

                # Forward response headers
                for key, value in resp.getheaders():
                    lower = key.lower()
                    # Skip hop-by-hop headers
                    if lower in ("transfer-encoding", "connection", "keep-alive"):
                        continue
                    # Rewrite Set-Cookie domain to localhost
                    if lower == "set-cookie":
                        value = _rewrite_cookie_domain(value)
                    self.send_header(key, value)
                self.end_headers()

                # Stream response body
                while chunk := resp.read(65536):
                    self.wfile.write(chunk)

        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for key, value in e.headers.items():
                lower = key.lower()
                if lower in ("transfer-encoding", "connection", "keep-alive"):
                    continue
                self.send_header(key, value)
            self.end_headers()
            body_bytes = e.read()
            if body_bytes:
                self.wfile.write(body_bytes)

        except urllib.error.URLError as e:
            self.send_error(502, f"Backend unreachable: {e.reason}")

    def log_message(self, format: str, *args) -> None:
        """Prefix log messages with proxy indicator for proxied requests."""
        path = args[0].split()[1] if args else ""
        if any(path.startswith(p) for p in PROXY_PREFIXES):
            prefix = f"  -> {self.backend}"
        else:
            prefix = "     static"
        sys.stderr.write(f"{prefix}  {format % args}\n")


def _rewrite_cookie_domain(cookie: str) -> str:
    """Remove or rewrite the Domain attribute so cookies work on localhost."""
    parts = []
    for part in cookie.split(";"):
        stripped = part.strip().lower()
        if stripped.startswith("domain="):
            continue  # Drop domain — browser will default to localhost
        if stripped == "secure":
            continue  # Drop Secure flag since we serve over HTTP
        parts.append(part)
    return ";".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reverse proxy for Deriva web apps",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python proxy.py --backend dev.example.org --app erd-browser
  python proxy.py --backend dev.example.org --app erd-browser --port 9000
  python proxy.py --backend dev.example.org --app erd-browser/dist
        """,
    )
    parser.add_argument(
        "--backend", required=True,
        help="Deriva server hostname (e.g., dev.example.org)",
    )
    parser.add_argument(
        "--app", required=True,
        help="App name (serves from <name>/dist/) or path to static files",
    )
    parser.add_argument(
        "--port", type=int, default=8080,
        help="Local port to listen on (default: 8080)",
    )
    parser.add_argument(
        "--bind", default="127.0.0.1",
        help="Address to bind to (default: 127.0.0.1)",
    )
    args = parser.parse_args()

    # Resolve static directory
    app_path = Path(args.app)
    if not app_path.is_absolute():
        app_path = Path(__file__).parent / app_path
    if app_path.is_dir() and (app_path / "index.html").exists():
        static_dir = app_path
    elif (app_path / "dist").is_dir():
        static_dir = app_path / "dist"
    else:
        print(f"Error: Cannot find static files at {app_path} or {app_path / 'dist'}")
        print("Did you build the app first? (e.g., cd erd-browser && pnpm build)")
        sys.exit(1)

    # Ensure backend has scheme
    backend = args.backend
    if not backend.startswith("http"):
        backend = f"https://{backend}"

    # SSL context that accepts self-signed certs (common for dev Deriva servers)
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    # Configure handler
    ProxyHandler.backend = backend
    ProxyHandler.static_dir = static_dir.resolve()
    ProxyHandler.ssl_context = ssl_ctx

    # Ensure common MIME types are registered
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    mimetypes.add_type("image/svg+xml", ".svg")

    server = http.server.HTTPServer((args.bind, args.port), ProxyHandler)
    url = f"http://{args.bind}:{args.port}"
    print(f"Serving {static_dir} at {url}")
    print(f"Proxying {', '.join(PROXY_PREFIXES)} -> {backend}")
    print(f"Press Ctrl+C to stop\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
