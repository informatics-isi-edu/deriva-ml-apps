# CLAUDE.md

This file provides guidance to Claude Code when working with the deriva-ml-apps codebase.

## Project Overview

Monorepo of web applications for exploring and managing Deriva catalogs and DerivaML workflows. Each app is a standalone React SPA that runs behind a shared reverse proxy.

## Commands

```bash
# Per-app development (run from app directory)
pnpm install          # Install dependencies
pnpm dev              # Start dev server (schema-workbench: 5173, storage-manager: 5174)
pnpm build            # TypeScript check + Vite production build → dist/
pnpm lint             # ESLint check
pnpm preview          # Preview built dist/ locally

# Proxy server (runs from repo root, no dependencies)
python proxy.py --backend dev.example.org --app schema-workbench
python proxy.py --backend dev.example.org --app storage-manager --port 9000
```

## Architecture

```
├── apps.json                    # App catalog — MCP server reads this to discover apps
├── proxy.py                     # Reverse proxy (stdlib only, Python 3.10+)
├── schema-workbench/            # ER diagram browser for Deriva catalogs
│   ├── src/
│   │   ├── App.tsx              # Main component
│   │   ├── ermrest-client.ts    # Catalog API client
│   │   ├── annotation-registry.ts # 30+ Deriva annotation tag definitions
│   │   ├── components/erd/      # ER diagram components (React Flow)
│   │   ├── components/ui/       # shadcn/ui components
│   │   └── schemas/vendor/      # Fetched JSON Schemas (gitignored)
│   └── scripts/fetch-schemas.sh # Downloads schemas from deriva-py (runs pre-build)
└── storage-manager/             # Dashboard for ~/.deriva-ml/ cache management
    └── src/
        ├── App.tsx              # Main component (table, filters, bulk delete)
        ├── api.ts               # Fetch calls to /api/storage endpoints
        ├── components/          # StorageTable, ConfirmDialog, shadcn/ui
        └── lib/format.ts        # Shared utilities
```

### App Catalog (`apps.json`)

Lists available apps with metadata. The MCP server's `list_apps()` / `start_app()` tools read this to discover and launch apps. Each entry specifies `requires_catalog` (whether the app needs a Deriva connection) and `dist_path` (where the built files live).

### Proxy Server (`proxy.py`)

Serves an app's `dist/` directory and proxies `/ermrest`, `/authn`, `/chaise` to a remote Deriva server, forwarding cookies for authentication. Also serves `/api/storage` endpoints for the Storage Manager.

## Tech Stack

Both apps: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, lucide-react.

Schema Workbench additionally uses: React Flow (@xyflow/react), dagre layout, RJSF (JSON Schema forms), Zod.

## Gotchas

- **pnpm only** — do not use npm or yarn. Both apps use pnpm workspaces-style lockfiles.
- **Schema fetching** — `fetch-schemas.sh` runs as a pre-build hook in schema-workbench. Requires network access. Schemas are gitignored vendor files.
- **Port conflicts** — schema-workbench uses 5173, storage-manager uses 5174, proxy defaults to 8080.
- **Storage Manager needs a backend** — in dev mode, Vite proxies `/api` to `http://127.0.0.1:8080`. Either the proxy.py or the MCP server must be running to serve `/api/storage`.
- **TypeScript first** — both apps run `tsc -b` before Vite build. Fix type errors before building.
- **Cross-origin auth** — catalog access requires the proxy to forward cookies. Log into Chaise in your browser first, then the proxy forwards session cookies.
