# CLAUDE.md

This file provides guidance to Claude Code when working with the deriva-ml-apps codebase.

## Project Overview

Monorepo of web applications for exploring and managing Deriva catalogs and DerivaML workflows. Each app is a standalone React SPA served by a Python app server with a Deriva reverse proxy. The Python package is installable via `uv` and provides a CLI entry point.

## Commands

```bash
# Install the Python package (app server + CLI)
uv sync

# Start the app server
uv run deriva-ml-apps serve --backend dev.example.org
uv run deriva-ml-apps serve --backend dev.example.org --port 9000

# Per-app frontend development (run from app directory)
pnpm install          # Install dependencies
pnpm dev              # Start Vite dev server
pnpm build            # TypeScript check + Vite production build → dist/
pnpm lint             # ESLint check

# Run Python tests
uv run pytest tests/ -v

# Bump version (updates pyproject.toml, commits, tags, pushes)
uv run bump-version patch|minor|major
```

## Architecture

```
├── apps.json                    # App catalog — registry of built-in apps
├── pyproject.toml               # Python package config (uv-installable)
├── src/
│   └── deriva_apps/
│       ├── __init__.py
│       ├── cli.py               # CLI: `deriva-ml-apps serve`
│       ├── registry.py          # App registry (static + dynamic)
│       ├── server.py            # HTTP server (proxy + API + static serving)
│       └── version.py           # bump-version CLI wrapper
├── tests/
│   ├── test_registry.py         # Registry unit tests
│   └── test_server.py           # Server integration tests
├── proxy.py                     # Standalone proxy (legacy, stdlib only)
├── app-launcher/                # Homepage SPA — app grid + catalog picker
├── schema-workbench/            # ER diagram browser for Deriva catalogs
└── storage-manager/             # Dashboard for ~/.deriva-ml/ cache management
```

### App Server (`src/deriva_apps/server.py`)

Single HTTP server that:
- Serves the app-launcher SPA at `/` (homepage with app grid)
- Serves built-in app `dist/` directories at `/apps/{id}/`
- Serves dynamically registered apps at `/apps/{id}/` (for Claude-generated apps)
- Proxies `/ermrest`, `/authn`, `/chaise` to a remote Deriva server
- Provides `/api/registry` endpoints for app management

### App Registry (`src/deriva_apps/registry.py`)

- **Built-in apps**: loaded from `apps.json` (static, shipped with the package)
- **Dynamic apps**: registered at runtime via `/api/registry` POST, persisted to `~/.deriva-ml/apps/registry.json`

### App Catalog (`apps.json`)

Lists built-in apps with metadata. Each entry specifies `requires_catalog` (whether the app needs a Deriva connection) and `dist_path` (where the built files live, relative to repo root).

## Tech Stack

- **Python**: Server, registry, CLI — stdlib HTTP + json (no heavy deps)
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, lucide-react
- **Schema Workbench additionally**: React Flow (@xyflow/react), dagre layout, RJSF (JSON Schema forms), Zod
- **Package management**: `uv` for Python, `pnpm` for frontend

## Gotchas

- **uv for Python, pnpm for frontend** — do not use pip or npm.
- **Schema fetching** — `fetch-schemas.sh` runs as a pre-build hook in schema-workbench. Requires network access. Schemas are gitignored vendor files.
- **Port conflicts** — schema-workbench dev: 5173, storage-manager dev: 5174, app server default: 8080.
- **Storage Manager needs a backend** — in dev mode, Vite proxies `/api` to `http://127.0.0.1:8080`. The app server must be running to serve `/api/storage`.
- **TypeScript first** — all apps run `tsc -b` before Vite build. Fix type errors before building.
- **Cross-origin auth** — catalog access requires the proxy to forward cookies. Log into Chaise in your browser first, then the proxy forwards session cookies.
