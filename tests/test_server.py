"""Tests for the app server."""

import json
import threading
import urllib.request
import urllib.error
import pytest
from pathlib import Path
from deriva_apps.server import create_server


@pytest.fixture
def server_env(tmp_path):
    """Create minimal server environment."""
    # Built-in app dist directory
    builtin_dist = tmp_path / "test-app" / "dist"
    builtin_dist.mkdir(parents=True)
    (builtin_dist / "index.html").write_text("<html><body>Built-in App</body></html>")
    (builtin_dist / "app.js").write_text("console.log('test-app')")

    # apps.json
    apps_json = tmp_path / "apps.json"
    apps_json.write_text(json.dumps({"apps": [
        {"id": "test-app", "name": "Test App", "description": "A test app",
         "requires_catalog": False, "dist_path": "test-app/dist"}
    ]}))

    # Static dir with index.html (the SPA shell / homepage)
    static_dir = tmp_path / "dist"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<html><body>SPA Shell</body></html>")
    (static_dir / "style.css").write_text("body { margin: 0; }")

    return {
        "apps_json": apps_json,
        "static_dir": static_dir,
        "dynamic_dir": tmp_path / "dynamic",
        "tmp_path": tmp_path,
    }


@pytest.fixture
def server(server_env):
    """Start a test server and return its base URL."""
    srv = create_server(
        backend="https://example.org",
        static_dir=server_env["static_dir"],
        apps_json=server_env["apps_json"],
        dynamic_dir=server_env["dynamic_dir"],
        port=0,
    )
    port = srv.server_address[1]
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{port}"
    yield base_url, srv, server_env
    srv.shutdown()


def _get(url: str) -> tuple[int, dict | str]:
    """GET helper that returns (status, body)."""
    try:
        with urllib.request.urlopen(url) as resp:
            body = resp.read().decode()
            try:
                return resp.status, json.loads(body)
            except json.JSONDecodeError:
                return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, body


def _post(url: str, data: dict) -> tuple[int, dict]:
    """POST JSON helper."""
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def _delete(url: str) -> tuple[int, dict]:
    """DELETE helper."""
    req = urllib.request.Request(url, method="DELETE")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


class TestStaticServing:
    def test_serves_index_html(self, server):
        url, _, _ = server
        status, body = _get(url)
        assert status == 200
        assert "SPA Shell" in body

    def test_serves_css_file(self, server):
        url, _, _ = server
        status, body = _get(f"{url}/style.css")
        assert status == 200
        assert "margin" in body

    def test_spa_fallback_for_unknown_routes(self, server):
        url, _, _ = server
        status, body = _get(f"{url}/schema-workbench")
        assert status == 200
        assert "SPA Shell" in body  # Falls back to index.html


class TestRegistryAPI:
    def test_get_registry(self, server):
        url, _, _ = server
        status, data = _get(f"{url}/api/registry")
        assert status == 200
        assert "apps" in data
        assert len(data["apps"]) == 1
        assert data["apps"][0]["id"] == "test-app"
        assert "backend" in data

    def test_register_dynamic_app(self, server):
        url, _, env = server
        app_dir = env["tmp_path"] / "custom"
        app_dir.mkdir()
        (app_dir / "index.html").write_text("<html>Custom</html>")

        status, data = _post(f"{url}/api/registry", {
            "id": "custom-viz",
            "name": "Custom Viz",
            "description": "A custom visualization",
            "path": str(app_dir),
        })
        assert status == 200
        assert data["status"] == "registered"
        assert "/apps/custom-viz/" in data["url"]

        # Verify it appears in the list
        status, data = _get(f"{url}/api/registry")
        assert len(data["apps"]) == 2

    def test_register_invalid_path(self, server):
        url, _, env = server
        status, data = _post(f"{url}/api/registry", {
            "id": "bad",
            "name": "Bad",
            "path": str(env["tmp_path"] / "nonexistent"),
        })
        assert status == 400
        assert "index.html" in data["error"]

    def test_unregister_dynamic_app(self, server):
        url, _, env = server
        app_dir = env["tmp_path"] / "temp"
        app_dir.mkdir()
        (app_dir / "index.html").write_text("<html></html>")

        _post(f"{url}/api/registry", {
            "id": "temp-app", "name": "Temp", "path": str(app_dir),
        })
        status, data = _delete(f"{url}/api/registry/temp-app")
        assert status == 200
        assert data["status"] == "removed"

    def test_unregister_builtin_fails(self, server):
        url, _, _ = server
        status, data = _delete(f"{url}/api/registry/test-app")
        assert status == 400
        assert "built-in" in data["error"]


class TestDynamicAppServing:
    def test_serves_dynamic_app(self, server):
        url, _, env = server
        app_dir = env["tmp_path"] / "dynamic-app"
        app_dir.mkdir()
        (app_dir / "index.html").write_text("<html>Dynamic App</html>")

        _post(f"{url}/api/registry", {
            "id": "dyn", "name": "Dynamic", "path": str(app_dir),
        })

        status, body = _get(f"{url}/apps/dyn/index.html")
        assert status == 200
        assert "Dynamic App" in body

    def test_dynamic_app_spa_fallback(self, server):
        url, _, env = server
        app_dir = env["tmp_path"] / "spa-app"
        app_dir.mkdir()
        (app_dir / "index.html").write_text("<html>SPA App</html>")

        _post(f"{url}/api/registry", {
            "id": "spa", "name": "SPA", "path": str(app_dir),
        })

        # Non-existent path should fall back to index.html
        status, body = _get(f"{url}/apps/spa/some/route")
        assert status == 200
        assert "SPA App" in body

    def test_unknown_dynamic_app_404(self, server):
        url, _, _ = server
        status, _ = _get(f"{url}/apps/nonexistent/index.html")
        assert status == 404


class TestBuiltinAppServing:
    def test_serves_builtin_app_index(self, server):
        url, _, _ = server
        status, body = _get(f"{url}/apps/test-app/index.html")
        assert status == 200
        assert "Built-in App" in body

    def test_serves_builtin_app_static_file(self, server):
        url, _, _ = server
        status, body = _get(f"{url}/apps/test-app/app.js")
        assert status == 200
        assert "test-app" in body

    def test_builtin_app_spa_fallback(self, server):
        url, _, _ = server
        # Non-existent path should fall back to index.html
        status, body = _get(f"{url}/apps/test-app/some/route")
        assert status == 200
        assert "Built-in App" in body
