"""App registry: static (built-in) + dynamic (runtime-registered) apps."""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class AppRegistry:
    """Manages the catalog of available web applications.

    Built-in apps come from apps.json (shipped with the package).
    Dynamic apps are registered at runtime and persisted to a JSON file
    in the dynamic directory.
    """

    def __init__(self, apps_json: Path, dynamic_dir: Path) -> None:
        self._apps_json = apps_json
        self._dynamic_dir = dynamic_dir
        self._dynamic_file = dynamic_dir / "registry.json"
        self._builtin: list[dict] = []
        self._dynamic: list[dict] = []

        self._load_builtin()
        self._load_dynamic()

    def _load_builtin(self) -> None:
        """Load built-in apps from apps.json."""
        if self._apps_json.exists():
            try:
                data = json.loads(self._apps_json.read_text())
                self._builtin = data.get("apps", [])
                for app in self._builtin:
                    app["builtin"] = True
                    app["dynamic"] = False
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning(f"Failed to load apps.json: {e}")
                self._builtin = []
        else:
            logger.warning(f"apps.json not found at {self._apps_json}")

    def _load_dynamic(self) -> None:
        """Load dynamically registered apps from persistent storage."""
        if self._dynamic_file.exists():
            try:
                self._dynamic = json.loads(self._dynamic_file.read_text())
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning(f"Failed to load dynamic registry: {e}")
                self._dynamic = []
        else:
            self._dynamic = []

    def _save_dynamic(self) -> None:
        """Persist dynamic app registrations to disk."""
        self._dynamic_dir.mkdir(parents=True, exist_ok=True)
        self._dynamic_file.write_text(json.dumps(self._dynamic, indent=2))

    def list_apps(self) -> list[dict]:
        """Return all registered apps (built-in + dynamic)."""
        return self._builtin + self._dynamic

    def get_app(self, app_id: str) -> dict | None:
        """Look up a single app by ID."""
        for app in self.list_apps():
            if app["id"] == app_id:
                return app
        return None

    def register(
        self,
        app_id: str,
        name: str,
        description: str,
        path: str,
    ) -> dict:
        """Register a dynamic app.

        Args:
            app_id: Unique identifier for the app.
            name: Human-readable display name.
            description: What the app does.
            path: Absolute path to the directory containing built static files
                (must contain index.html).

        Returns:
            The registered app metadata dict.

        Raises:
            ValueError: If the app_id already exists or the path is invalid.
        """
        if any(a["id"] == app_id for a in self.list_apps()):
            raise ValueError(f"App '{app_id}' already exists")

        app_path = Path(path)
        if not (app_path / "index.html").exists():
            raise ValueError(
                f"No index.html found in {path}. "
                "The path must point to a directory with built static files."
            )

        app = {
            "id": app_id,
            "name": name,
            "description": description,
            "path": str(app_path.resolve()),
            "builtin": False,
            "dynamic": True,
        }
        self._dynamic.append(app)
        self._save_dynamic()
        logger.info(f"Registered dynamic app: {app_id} at {path}")
        return app

    def unregister(self, app_id: str) -> None:
        """Remove a dynamic app. Cannot remove built-in apps.

        Raises:
            ValueError: If the app is built-in or doesn't exist.
        """
        if any(a["id"] == app_id for a in self._builtin):
            raise ValueError(f"Cannot unregister built-in app '{app_id}'")

        before = len(self._dynamic)
        self._dynamic = [a for a in self._dynamic if a["id"] != app_id]
        if len(self._dynamic) == before:
            raise ValueError(f"Dynamic app '{app_id}' not found")

        self._save_dynamic()
        logger.info(f"Unregistered dynamic app: {app_id}")
