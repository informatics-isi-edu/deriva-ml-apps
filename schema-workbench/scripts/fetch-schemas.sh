#!/usr/bin/env bash
# Download Deriva annotation JSON Schemas from the canonical deriva-py repo.
# Schemas are placed in src/schemas/vendor/ (gitignored) so they can be
# imported directly by TypeScript without a local filesystem dependency.

set -euo pipefail

REPO="informatics-isi-edu/deriva-py"
BRANCH="master"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/deriva/core/schemas"
DEST="$(cd "$(dirname "$0")/.." && pwd)/src/schemas/vendor"

SCHEMAS=(
  app_links.schema.json
  asset.schema.json
  bulk_upload.schema.json
  chaise_config.schema.json
  citation.schema.json
  column_display.schema.json
  display.schema.json
  export.schema.json
  export_2019.schema.json
  foreign_key.schema.json
  generated.schema.json
  immutable.schema.json
  indexing_preferences.schema.json
  key_display.schema.json
  non_deletable.schema.json
  required.schema.json
  source_definitions.schema.json
  table_alternatives.schema.json
  table_display.schema.json
  visible_columns.schema.json
  visible_foreign_keys.schema.json
)

mkdir -p "$DEST"

echo "Fetching ${#SCHEMAS[@]} schemas from github.com/${REPO} (${BRANCH})..."

for schema in "${SCHEMAS[@]}"; do
  curl -sS -f -o "${DEST}/${schema}" "${BASE_URL}/${schema}"
  echo "  ✓ ${schema}"
done

echo "Done. Schemas saved to src/schemas/vendor/"
