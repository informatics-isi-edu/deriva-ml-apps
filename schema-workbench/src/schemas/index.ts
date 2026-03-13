/**
 * Schema registry — loads JSON Schema files from deriva-py and maps them
 * to annotation tag URIs.
 *
 * Schemas are vendored from the canonical deriva-py GitHub repository
 * (informatics-isi-edu/deriva-py) via scripts/fetch-schemas.sh. Run that
 * script to pull the latest schemas before building.
 *
 * Responsibilities:
 * - Import all 21 JSON Schema files
 * - Map annotation tag URIs to their schemas
 * - Pre-dereference $ref across schemas for RJSF consumption
 * - Classify schemas by editing strategy (rich, placeholder, open)
 */

import type { RJSFSchema } from "@rjsf/utils";

// ── Raw schema imports (vendored from GitHub) ───────────────────
import appLinksSchema from "./vendor/app_links.schema.json";
import assetSchema from "./vendor/asset.schema.json";
import bulkUploadSchema from "./vendor/bulk_upload.schema.json";
import chaiseConfigSchema from "./vendor/chaise_config.schema.json";
import citationSchema from "./vendor/citation.schema.json";
import columnDisplaySchema from "./vendor/column_display.schema.json";
import displaySchema from "./vendor/display.schema.json";
import exportSchema from "./vendor/export.schema.json";
import export2019Schema from "./vendor/export_2019.schema.json";
import foreignKeySchema from "./vendor/foreign_key.schema.json";
import generatedSchema from "./vendor/generated.schema.json";
import immutableSchema from "./vendor/immutable.schema.json";
import indexingPreferencesSchema from "./vendor/indexing_preferences.schema.json";
import keyDisplaySchema from "./vendor/key_display.schema.json";
import nonDeletableSchema from "./vendor/non_deletable.schema.json";
import requiredSchema from "./vendor/required.schema.json";
import sourceDefinitionsSchema from "./vendor/source_definitions.schema.json";
import tableAlternativesSchema from "./vendor/table_alternatives.schema.json";
import tableDisplaySchema from "./vendor/table_display.schema.json";
import visibleColumnsSchema from "./vendor/visible_columns.schema.json";
import visibleForeignKeysSchema from "./vendor/visible_foreign_keys.schema.json";

import { TAG } from "@/annotation-registry";

// ── All schemas (single source of truth) ────────────────────────

const ALL_SCHEMAS: RJSFSchema[] = [
  appLinksSchema, assetSchema, bulkUploadSchema, chaiseConfigSchema,
  citationSchema, columnDisplaySchema, displaySchema, exportSchema,
  export2019Schema, foreignKeySchema, generatedSchema, immutableSchema,
  indexingPreferencesSchema, keyDisplaySchema, nonDeletableSchema,
  requiredSchema, sourceDefinitionsSchema, tableAlternativesSchema,
  tableDisplaySchema, visibleColumnsSchema, visibleForeignKeysSchema,
] as RJSFSchema[];

// ── Schema-by-$id lookup (for $ref resolution) ─────────────────

/** All schemas keyed by their $id URI — built dynamically so URI drift is impossible. */
export const SCHEMA_BY_ID: Record<string, RJSFSchema> = Object.fromEntries(
  ALL_SCHEMAS.filter((s) => s.$id).map((s) => [s.$id!, s]),
);

// ── Tag URI → schema mapping ────────────────────────────────────

/** Maps annotation tag URIs to their JSON Schema. */
export const SCHEMA_BY_TAG: Record<string, RJSFSchema> = {
  [TAG.display]: displaySchema as RJSFSchema,
  [TAG.visible_columns]: visibleColumnsSchema as RJSFSchema,
  [TAG.visible_foreign_keys]: visibleForeignKeysSchema as RJSFSchema,
  [TAG.table_display]: tableDisplaySchema as RJSFSchema,
  [TAG.column_display]: columnDisplaySchema as RJSFSchema,
  [TAG.source_definitions]: sourceDefinitionsSchema as RJSFSchema,
  [TAG.key_display]: keyDisplaySchema as RJSFSchema,
  [TAG.foreign_key]: foreignKeySchema as RJSFSchema,
  [TAG.table_alternatives]: tableAlternativesSchema as RJSFSchema,
  [TAG.asset]: assetSchema as RJSFSchema,
  [TAG.citation]: citationSchema as RJSFSchema,
  [TAG.export]: exportSchema as RJSFSchema,
  [TAG.export_2019]: export2019Schema as RJSFSchema,
  [TAG.generated]: generatedSchema as RJSFSchema,
  [TAG.immutable]: immutableSchema as RJSFSchema,
  [TAG.non_deletable]: nonDeletableSchema as RJSFSchema,
  [TAG.required]: requiredSchema as RJSFSchema,
  [TAG.bulk_upload]: bulkUploadSchema as RJSFSchema,
  [TAG.chaise_config]: chaiseConfigSchema as RJSFSchema,
  [TAG.indexing_preferences]: indexingPreferencesSchema as RJSFSchema,
  [TAG.app_links]: appLinksSchema as RJSFSchema,
};

// ── Schema classification ───────────────────────────────────────

export type SchemaCategory = "rich" | "placeholder" | "open";

/** Explicit overrides for known edge cases — resilient to schema evolution. */
const CATEGORY_OVERRIDES: Record<string, SchemaCategory> = {
  [TAG.generated]: "placeholder",
  [TAG.immutable]: "placeholder",
  [TAG.non_deletable]: "placeholder",
  [TAG.required]: "placeholder",
  [TAG.chaise_config]: "open",
};

/**
 * Classify a schema by how it should be edited.
 *
 * - "placeholder": Flag annotations (generated, immutable, required, non_deletable)
 *   whose value is always null or {}.
 * - "open": Schemas with no structural constraints (chaise_config — any object).
 * - "rich": Schemas with meaningful properties suitable for form generation.
 *
 * Uses explicit overrides for known tags, with heuristic fallback for unknown schemas.
 */
export function classifySchema(tag: string, schema: RJSFSchema): SchemaCategory {
  if (tag in CATEGORY_OVERRIDES) return CATEGORY_OVERRIDES[tag];

  // Heuristic fallback for schemas not in the override map:

  // Null-only
  if (schema.type === "null") return "placeholder";

  // anyOf [null, empty object]
  if (schema.anyOf && !schema.properties && !schema.patternProperties) {
    const types = (schema.anyOf as RJSFSchema[])
      .map((s) => (typeof s === "object" && "type" in s ? s.type : ""))
      .filter(Boolean);
    if (types.includes("null")) return "placeholder";
  }

  // Open object with no properties
  if (
    schema.type === "object" &&
    !schema.properties &&
    !schema.patternProperties &&
    !schema.additionalProperties &&
    !schema.definitions &&
    !schema.$defs
  ) {
    return "open";
  }

  return "rich";
}

/** Get the schema for a tag, or undefined if no schema exists. */
export function getSchemaForTag(tag: string): RJSFSchema | undefined {
  return SCHEMA_BY_TAG[tag];
}

// ── Dev-mode coverage check ─────────────────────────────────────
// Tags without schemas yet: export_fragment_definitions, google_dataset,
// column_defaults, viz_3d_display

if (import.meta.env.DEV) {
  const tagsWithoutSchema = Object.values(TAG).filter((t) => !(t in SCHEMA_BY_TAG));
  if (tagsWithoutSchema.length > 0) {
    console.warn("[schema-registry] Tags without schemas:", tagsWithoutSchema);
  }
}
