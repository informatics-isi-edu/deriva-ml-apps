"""CLI entry point: deriva-ml-apps serve.

Usage:
    deriva-ml-apps serve --backend dev.example.org
    deriva-ml-apps serve --backend dev.example.org --port 9000
"""

from __future__ import annotations

import argparse
import sys
import webbrowser
from pathlib import Path


def _find_static_dir() -> Path:
    """Find the built SPA dist directory.

    Searches in order:
    1. frontend/dist relative to the repo root (development)
    2. Package data share/deriva-ml-apps/dist (installed via uv)
    """
    # Development: repo layout
    repo_root = Path(__file__).parent.parent.parent
    repo_dist = repo_root / "frontend" / "dist"
    if (repo_dist / "index.html").exists():
        return repo_dist

    # Also check the old layout (dist at repo root)
    old_dist = repo_root / "dist"
    if (old_dist / "index.html").exists():
        return old_dist

    # Installed: package data via importlib.resources
    try:
        import importlib.resources as resources
        pkg = resources.files("deriva_apps")
        # Navigate from site-packages/deriva_apps/ to share/
        for candidate in [
            pkg.joinpath("static"),
            pkg.parent.parent.joinpath("share", "deriva-ml-apps", "dist"),
        ]:
            p = Path(str(candidate))
            if (p / "index.html").exists():
                return p
    except Exception:
        pass

    return repo_dist  # Fall through — server will show a helpful error


def _find_apps_json() -> Path:
    """Find apps.json with built-in app metadata."""
    repo_root = Path(__file__).parent.parent.parent
    repo_apps = repo_root / "apps.json"
    if repo_apps.exists():
        return repo_apps

    try:
        import importlib.resources as resources
        pkg = resources.files("deriva_apps")
        for candidate in [
            pkg.joinpath("apps.json"),
            pkg.parent.parent.joinpath("share", "deriva-ml-apps", "apps.json"),
        ]:
            p = Path(str(candidate))
            if p.exists():
                return p
    except Exception:
        pass

    return repo_apps


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="deriva-ml-apps",
        description="Serve DerivaML web applications with a Deriva proxy",
    )
    sub = parser.add_subparsers(dest="command")

    serve_parser = sub.add_parser("serve", help="Start the app server")
    serve_parser.add_argument(
        "--backend", required=True,
        help="Deriva server hostname (e.g., dev.example.org)",
    )
    serve_parser.add_argument(
        "--port", type=int, default=8080,
        help="Port to listen on (default: 8080, 0 = auto)",
    )
    serve_parser.add_argument(
        "--bind", default="127.0.0.1",
        help="Address to bind to (default: 127.0.0.1)",
    )
    serve_parser.add_argument(
        "--no-open", action="store_true",
        help="Don't open the browser automatically",
    )

    args = parser.parse_args()
    if args.command != "serve":
        parser.print_help()
        sys.exit(1)

    from deriva_apps.server import create_server

    static_dir = _find_static_dir()
    apps_json = _find_apps_json()
    dynamic_dir = Path.home() / ".deriva-ml" / "apps"

    if not (static_dir / "index.html").exists():
        print(f"Error: No built SPA found at {static_dir}", file=sys.stderr)
        print("Build the frontend first: cd frontend && pnpm install && pnpm build", file=sys.stderr)
        sys.exit(1)

    srv = create_server(
        backend=args.backend,
        static_dir=static_dir,
        apps_json=apps_json,
        dynamic_dir=dynamic_dir,
        port=args.port,
        bind=args.bind,
    )

    port = srv.server_address[1]
    url = f"http://{args.bind}:{port}"

    print(f"DerivaML Apps: {url}")
    print(f"Proxying to: {args.backend}")
    print("Press Ctrl+C to stop\n")

    if not args.no_open:
        webbrowser.open(url)

    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        srv.server_close()


if __name__ == "__main__":
    main()
