"""Tests for the app registry."""

import json
import pytest
from pathlib import Path
from deriva_apps.registry import AppRegistry


@pytest.fixture
def apps_json(tmp_path):
    """Create a minimal apps.json for testing."""
    data = {
        "apps": [
            {
                "id": "schema-workbench",
                "name": "Schema Workbench",
                "description": "ER diagram browser",
                "requires_catalog": True,
            }
        ]
    }
    path = tmp_path / "apps.json"
    path.write_text(json.dumps(data))
    return path


@pytest.fixture
def registry(apps_json, tmp_path):
    return AppRegistry(apps_json=apps_json, dynamic_dir=tmp_path / "dynamic")


def _make_app_dir(tmp_path, name="my-app"):
    """Create a directory with an index.html."""
    app_dir = tmp_path / name
    app_dir.mkdir(exist_ok=True)
    (app_dir / "index.html").write_text("<html><body>Test</body></html>")
    return app_dir


class TestListApps:
    def test_includes_builtins(self, registry):
        apps = registry.list_apps()
        assert len(apps) == 1
        assert apps[0]["id"] == "schema-workbench"
        assert apps[0]["builtin"] is True

    def test_empty_when_no_apps_json(self, tmp_path):
        reg = AppRegistry(
            apps_json=tmp_path / "nonexistent.json",
            dynamic_dir=tmp_path / "dynamic",
        )
        assert reg.list_apps() == []


class TestGetApp:
    def test_get_existing(self, registry):
        app = registry.get_app("schema-workbench")
        assert app is not None
        assert app["name"] == "Schema Workbench"

    def test_get_nonexistent(self, registry):
        assert registry.get_app("nope") is None


class TestRegister:
    def test_register_dynamic_app(self, registry, tmp_path):
        app_dir = _make_app_dir(tmp_path)
        registry.register("my-viz", "My Visualization", "Custom chart", str(app_dir))
        apps = registry.list_apps()
        assert len(apps) == 2
        dynamic = [a for a in apps if a["id"] == "my-viz"]
        assert len(dynamic) == 1
        assert dynamic[0]["dynamic"] is True

    def test_register_duplicate_raises(self, registry, tmp_path):
        app_dir = _make_app_dir(tmp_path)
        registry.register("my-viz", "My Viz", "desc", str(app_dir))
        with pytest.raises(ValueError, match="already exists"):
            registry.register("my-viz", "Dupe", "desc", str(app_dir))

    def test_register_no_index_html_raises(self, registry, tmp_path):
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir()
        with pytest.raises(ValueError, match="index.html"):
            registry.register("bad", "Bad", "desc", str(empty_dir))

    def test_register_builtin_id_raises(self, registry, tmp_path):
        app_dir = _make_app_dir(tmp_path)
        with pytest.raises(ValueError, match="already exists"):
            registry.register("schema-workbench", "Dupe", "desc", str(app_dir))


class TestUnregister:
    def test_unregister_dynamic_app(self, registry, tmp_path):
        app_dir = _make_app_dir(tmp_path)
        registry.register("my-viz", "My Viz", "desc", str(app_dir))
        registry.unregister("my-viz")
        apps = registry.list_apps()
        assert len(apps) == 1
        assert all(a["id"] != "my-viz" for a in apps)

    def test_cannot_unregister_builtin(self, registry):
        with pytest.raises(ValueError, match="built-in"):
            registry.unregister("schema-workbench")

    def test_unregister_nonexistent_raises(self, registry):
        with pytest.raises(ValueError, match="not found"):
            registry.unregister("nope")


class TestPersistence:
    def test_registry_persists_across_instances(self, apps_json, tmp_path):
        dynamic_dir = tmp_path / "dynamic"
        reg1 = AppRegistry(apps_json=apps_json, dynamic_dir=dynamic_dir)
        app_dir = _make_app_dir(tmp_path)
        reg1.register("my-viz", "My Viz", "desc", str(app_dir))

        # New instance should load persisted state
        reg2 = AppRegistry(apps_json=apps_json, dynamic_dir=dynamic_dir)
        apps = reg2.list_apps()
        assert len(apps) == 2
        assert any(a["id"] == "my-viz" for a in apps)

    def test_unregister_persists(self, apps_json, tmp_path):
        dynamic_dir = tmp_path / "dynamic"
        reg1 = AppRegistry(apps_json=apps_json, dynamic_dir=dynamic_dir)
        app_dir = _make_app_dir(tmp_path)
        reg1.register("my-viz", "My Viz", "desc", str(app_dir))
        reg1.unregister("my-viz")

        reg2 = AppRegistry(apps_json=apps_json, dynamic_dir=dynamic_dir)
        assert len(reg2.list_apps()) == 1
