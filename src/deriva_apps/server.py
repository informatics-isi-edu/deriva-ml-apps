"""HTTP server: reverse proxy + SPA static serving + registry API.

Serves the SPA shell from a static directory, proxies Deriva API requests
(/ermrest, /authn, /chaise) to a remote backend, and provides local API
endpoints for app registry and storage management.

Can be used standalone (python -m deriva_apps.server) or created
programmatically via create_server() for embedding or testing.

Requirements: Python 3.12+ (stdlib only for core server, no heavy deps).
"""

from __future__ import annotations

import http.server
import json
import logging
import mimetypes
import socket
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from deriva_apps.registry import AppRegistry

logger = logging.getLogger(__name__)

# Paths that get proxied to the Deriva backend
PROXY_PREFIXES = ("/ermrest", "/authn", "/chaise")

# Max POST body for API endpoints (1 MB)
MAX_REQUEST_BODY = 1_048_576


class AppHandler(http.server.SimpleHTTPRequestHandler):
    """Serves SPA static files, proxies Deriva API, and handles local API."""

    # Set by create_server()
    backend: str = ""
    static_dir: Path = Path(".")
    ssl_context: ssl.SSLContext | None = None
    registry: AppRegistry | None = None

    def translate_path(self, path: str) -> str:
        """Resolve static file paths relative to the SPA directory."""
        path = urllib.parse.urlparse(path).path
        parts = path.strip("/").split("/")
        result = self.static_dir
        for part in parts:
            if part and part != "..":
                result = result / part
        return str(result)

    # --- HTTP method dispatch ---

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if self._is_proxy_path(path):
            self._proxy_request("GET")
        elif path.startswith("/api/"):
            self._route_api("GET", parsed)
        elif path.startswith("/apps/"):
            self._serve_dynamic_app(path)
        else:
            self._serve_static()

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if self._is_proxy_path(path):
            self._proxy_request("POST")
        elif path.startswith("/api/"):
            self._route_api("POST", parsed)
        else:
            self.send_error(405, "POST only supported for proxied paths and /api/")

    def do_PUT(self) -> None:
        if self._is_proxy_path(self.path):
            self._proxy_request("PUT")
        else:
            self.send_error(405, "PUT only supported for proxied paths")

    def do_DELETE(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if self._is_proxy_path(path):
            self._proxy_request("DELETE")
        elif path.startswith("/api/"):
            self._route_api("DELETE", parsed)
        else:
            self.send_error(405, "DELETE only supported for proxied paths and /api/")

    # --- API routing ---

    def _route_api(self, method: str, parsed: urllib.parse.ParseResult) -> None:
        """Route /api/* requests to the appropriate handler."""
        path = parsed.path.rstrip("/")

        if path == "/api/registry" and method == "GET":
            self._api_registry_list()
        elif path == "/api/registry" and method == "POST":
            self._api_registry_register()
        elif path.startswith("/api/registry/") and method == "DELETE":
            app_id = path.split("/api/registry/", 1)[1]
            self._api_registry_unregister(app_id)
        else:
            self._send_json(404, {"status": "error", "error": f"Unknown API: {method} {path}"})

    # --- Registry API ---

    def _api_registry_list(self) -> None:
        """GET /api/registry — list all registered apps."""
        if self.registry is None:
            self._send_json(500, {"status": "error", "error": "Registry not initialized"})
            return
        self._send_json(200, {
            "apps": self.registry.list_apps(),
            "backend": self.backend,
        })

    def _api_registry_register(self) -> None:
        """POST /api/registry — register a dynamic app."""
        if self.registry is None:
            self._send_json(500, {"status": "error", "error": "Registry not initialized"})
            return

        body = self._read_json_body()
        if body is None:
            return  # Error already sent

        try:
            app = self.registry.register(
                app_id=body["id"],
                name=body["name"],
                description=body.get("description", ""),
                path=body["path"],
            )
            self._send_json(200, {
                "status": "registered",
                "app": app,
                "url": f"/apps/{app['id']}/",
            })
        except (ValueError, KeyError) as e:
            self._send_json(400, {"status": "error", "error": str(e)})

    def _api_registry_unregister(self, app_id: str) -> None:
        """DELETE /api/registry/{id} — unregister a dynamic app."""
        if self.registry is None:
            self._send_json(500, {"status": "error", "error": "Registry not initialized"})
            return

        try:
            self.registry.unregister(app_id)
            self._send_json(200, {"status": "removed", "app_id": app_id})
        except ValueError as e:
            self._send_json(400, {"status": "error", "error": str(e)})

    # --- App serving (built-in + dynamic) ---

    apps_root: Path = Path(".")  # Root of the apps repo (for resolving dist_path)

    def _serve_dynamic_app(self, path: str) -> None:
        """Serve static files for registered apps at /apps/{id}/.

        Works for both built-in apps (resolved from dist_path relative to
        apps_root) and dynamic apps (resolved from absolute path).
        """
        if self.registry is None:
            self.send_error(500, "Registry not initialized")
            return

        # Parse /apps/{id}/... → app_id, subpath
        parts = path.split("/", 3)  # ['', 'apps', '{id}', '...']
        if len(parts) < 3:
            self.send_error(404, "Not found")
            return

        app_id = parts[2]
        subpath = parts[3] if len(parts) > 3 else "index.html"

        app = self.registry.get_app(app_id)
        if app is None:
            self.send_error(404, f"App '{app_id}' not found")
            return

        # Resolve the app's static directory
        if app.get("dynamic"):
            app_path = Path(app["path"])
        elif app.get("dist_path"):
            # Built-in: dist_path is relative to apps_root
            app_path = self.apps_root / app["dist_path"]
        else:
            self.send_error(404, f"App '{app_id}' has no servable path")
            return

        file_path = app_path / subpath
        if not file_path.is_file():
            # SPA fallback
            file_path = app_path / "index.html"

        if file_path.is_file():
            content = file_path.read_bytes()
            content_type, _ = mimetypes.guess_type(str(file_path))
            self.send_response(200)
            self.send_header("Content-Type", content_type or "application/octet-stream")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_error(404, "Not found")

    # --- SPA static serving ---

    def _serve_static(self) -> None:
        """Serve static files, falling back to index.html for SPA routing."""
        translated = self.translate_path(self.path)
        file_path = Path(translated)

        if file_path.is_file():
            super().do_GET()
            return

        # SPA fallback: serve index.html for any non-file path
        index = self.static_dir / "index.html"
        if index.is_file():
            content = index.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_error(404, "Not found (and no index.html for SPA fallback)")

    # --- Proxy ---

    def _is_proxy_path(self, path: str) -> bool:
        return any(path.startswith(p) for p in PROXY_PREFIXES)

    def _proxy_request(self, method: str) -> None:
        """Forward request to the Deriva backend, passing cookies through."""
        target_url = self.backend + self.path

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        req = urllib.request.Request(target_url, data=body, method=method)

        for header in ("Cookie", "Content-Type", "Accept", "Authorization"):
            value = self.headers.get(header)
            if value:
                req.add_header(header, value)

        req.add_header("X-Forwarded-For", self.client_address[0])

        try:
            with urllib.request.urlopen(req, context=self.ssl_context) as resp:
                self.send_response(resp.status)
                for key, value in resp.getheaders():
                    lower = key.lower()
                    if lower in ("transfer-encoding", "connection", "keep-alive"):
                        continue
                    if lower == "set-cookie":
                        value = _rewrite_cookie_domain(value)
                    self.send_header(key, value)
                self.end_headers()
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

    # --- Helpers ---

    def _read_json_body(self) -> dict | None:
        """Read and parse a JSON request body. Returns None on error (sends response)."""
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            self._send_json(400, {"status": "error", "error": "No request body"})
            return None
        if content_length > MAX_REQUEST_BODY:
            self._send_json(413, {"status": "error", "error": "Request body too large"})
            return None
        try:
            return json.loads(self.rfile.read(content_length))
        except (json.JSONDecodeError, ValueError):
            self._send_json(400, {"status": "error", "error": "Invalid JSON"})
            return None

    def _send_json(self, status: int, data: dict) -> None:
        """Send a JSON response."""
        body = json.dumps(data, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        """Prefix log messages for readability."""
        try:
            path = str(args[0]).split()[1] if args else ""
        except (IndexError, AttributeError):
            path = ""
        if any(path.startswith(p) for p in PROXY_PREFIXES):
            prefix = f"  → {self.backend}"
        elif path.startswith("/api/"):
            prefix = "  api"
        elif path.startswith("/apps/"):
            prefix = "  app"
        else:
            prefix = "     "
        sys.stderr.write(f"{prefix}  {format % args}\n")


def _rewrite_cookie_domain(cookie: str) -> str:
    """Remove Domain and Secure attributes so cookies work on localhost."""
    parts = []
    for part in cookie.split(";"):
        stripped = part.strip().lower()
        if stripped.startswith("domain="):
            continue
        if stripped == "secure":
            continue
        parts.append(part)
    return ";".join(parts)


def _find_free_port() -> int:
    """Find a free TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def create_server(
    backend: str,
    static_dir: Path,
    apps_json: Path,
    dynamic_dir: Path,
    apps_root: Path | None = None,
    port: int = 8080,
    bind: str = "127.0.0.1",
) -> http.server.HTTPServer:
    """Create and configure the app server.

    Args:
        backend: Deriva server hostname or URL (e.g., "dev.example.org").
        static_dir: Path to directory with the built SPA (must contain index.html).
        apps_json: Path to apps.json with built-in app metadata.
        dynamic_dir: Directory for dynamic app registrations.
        apps_root: Root directory for resolving built-in app dist_path entries.
            Defaults to the parent of apps_json.
        port: Port to bind to. 0 = auto-select a free port.
        bind: Address to bind to.

    Returns:
        Configured HTTPServer ready to serve_forever().
    """
    static_dir = static_dir.resolve()

    if not backend.startswith("http"):
        backend = f"https://{backend}"

    if port == 0:
        port = _find_free_port()

    # SSL context for backend connections (accept self-signed certs)
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    # Registry
    registry = AppRegistry(apps_json=apps_json, dynamic_dir=dynamic_dir)

    # Configure handler class
    AppHandler.backend = backend
    AppHandler.static_dir = static_dir
    AppHandler.ssl_context = ssl_ctx
    AppHandler.registry = registry
    AppHandler.apps_root = (apps_root or apps_json.parent).resolve()

    # Ensure common MIME types
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    mimetypes.add_type("image/svg+xml", ".svg")

    server = http.server.HTTPServer((bind, port), AppHandler)
    logger.info(f"Server created: http://{bind}:{port} → {backend}")
    return server
