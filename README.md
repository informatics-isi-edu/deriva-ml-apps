# Deriva ML Apps

Web applications for exploring and managing [Deriva](https://github.com/informatics-isi-edu/deriva-py) catalogs and [DerivaML](https://github.com/informatics-isi-edu/deriva-ml) workflows.

## Applications

### ERD Browser

An interactive entity-relationship diagram browser for Deriva catalogs. Visualizes tables, foreign key relationships, and annotations in a navigable graph interface.

**Features:**
- Schema-level and table-level graph views with automatic layout (dagre)
- Click-to-inspect detail panel with columns, foreign keys, and sample data
- Annotation browser and editor for all 30+ Deriva annotation tags
- Table type filtering (domain, ML, vocabulary, asset, association)
- Search with autocomplete across all tables
- Connect to any Deriva catalog via URL parameters

**Tech stack:** React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Flow

#### Quick Start

```bash
cd erd-browser
pnpm install
pnpm dev
```

Then open `https://localhost:5173/#host=your-server.org&catalog=1`.

#### Build

```bash
pnpm build     # Production build → dist/
pnpm preview   # Preview the built app locally
```

#### Configuration

The catalog connection is configured via URL hash parameters:

```
https://localhost:5173/#host=example.org&catalog=42
```

Or via environment variables for development (`.env.local`):

```env
VITE_CATALOG_HOST=localhost
VITE_CATALOG_ID=1
```

When deployed on the same origin as a Deriva server, credentials are sent automatically. For cross-origin access, the Deriva server must have CORS configured for credentialed requests.

## Related Projects

- [Deriva MCP Server](https://github.com/informatics-isi-edu/deriva-mcp) — MCP server for Deriva catalog operations
- [Deriva Skills](https://github.com/informatics-isi-edu/deriva-skills) — Claude Code skills plugin for Deriva workflows
- [DerivaML](https://github.com/informatics-isi-edu/deriva-ml) — Core library for ML workflows on Deriva
- [Chaise](https://github.com/informatics-isi-edu/chaise) — Deriva's standard web UI

## License

Apache 2.0
