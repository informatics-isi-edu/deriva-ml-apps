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

const ALL_RAW_SCHEMAS: RJSFSchema[] = [
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
  ALL_RAW_SCHEMAS.filter((s) => s.$id).map((s) => [s.$id!, s]),
);

// ── Cross-schema $ref resolution ────────────────────────────────
// RJSF does not resolve $ref across schemas (it only looks within the
// single schema passed to <Form>). We inline cross-schema references
// at load time so each schema is self-contained.
//
// When a definition is copied from a source schema, all of its transitive
// internal $ref dependencies (e.g., row-order → sort-key → column-name)
// are also copied into the target schema's definitions block.

/**
 * Collect all #/definitions/X names referenced within a JSON Schema node.
 */
function collectInternalDefRefs(node: unknown): Set<string> {
  const refs = new Set<string>();
  function walk(n: unknown) {
    if (n === null || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const obj = n as Record<string, unknown>;
    if (typeof obj.$ref === "string") {
      const match = (obj.$ref as string).match(/^#\/definitions\/(.+)$/);
      if (match) refs.add(match[1]);
    }
    for (const v of Object.values(obj)) walk(v);
  }
  walk(node);
  return refs;
}

/**
 * Copy a definition and all its transitive dependencies from a source schema
 * into the target definitions map. Guards against circular references.
 */
function copyDefinitionWithDeps(
  defName: string,
  sourceSchema: RJSFSchema,
  targetDefs: Record<string, RJSFSchema>,
  visiting: Set<string> = new Set(),
) {
  if (defName in targetDefs || visiting.has(defName)) return;
  visiting.add(defName);

  const sourceDefs = (sourceSchema.definitions || {}) as Record<string, RJSFSchema>;
  const def = sourceDefs[defName];
  if (!def) return;

  const cloned = structuredClone(def);
  targetDefs[defName] = cloned;

  // Recursively copy any definitions this one references
  for (const dep of collectInternalDefRefs(cloned)) {
    if (!(dep in targetDefs)) {
      copyDefinitionWithDeps(dep, sourceSchema, targetDefs, visiting);
    }
  }
}

/**
 * Deep-clone a schema, inlining any cross-schema $ref references.
 * Internal refs (starting with "#/") are left intact for RJSF to handle.
 * Referenced definitions and their transitive dependencies are copied into
 * the schema's own definitions block.
 */
function resolveSchema(schema: RJSFSchema): RJSFSchema {
  const resolved = structuredClone(schema);
  // Collect definitions that have been properly resolved (copied from source schemas).
  // Start empty so that original cross-schema $ref stubs don't block copyDefinitionWithDeps.
  const importedDefs: Record<string, RJSFSchema> = {};

  function walk(node: unknown): unknown {
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(walk);

    const obj = node as Record<string, unknown>;

    // Handle cross-schema $ref
    if (typeof obj.$ref === "string" && !(obj.$ref as string).startsWith("#")) {
      const ref = obj.$ref as string;
      const hashIdx = ref.indexOf("#");
      const schemaUri = hashIdx >= 0 ? ref.slice(0, hashIdx) : ref;
      const fragment = hashIdx >= 0 ? ref.slice(hashIdx + 1) : "";
      const defName = fragment?.split("/").pop();

      const sourceSchema = SCHEMA_BY_ID[schemaUri];
      if (!sourceSchema) {
        // Unknown schema — leave as-is
        return obj;
      }

      if (defName && fragment) {
        // Copy the definition and all its transitive deps from the source schema
        if (!(defName in importedDefs)) {
          copyDefinitionWithDeps(defName, sourceSchema, importedDefs);
        }
        // Rewrite to a local $ref
        return { ...obj, $ref: `#/definitions/${defName}` };
      }

      // Whole-schema ref (e.g., export_2019 -> export.schema.json)
      const { $id: _, ...rest } = resolveSchema(sourceSchema);
      const { $ref: _ref, ...objRest } = obj;
      return { ...objRest, ...rest };
    }

    // Recurse into all properties
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = walk(value);
    }
    return result;
  }

  const walked = walk(resolved) as RJSFSchema;

  // Merge: imported definitions override any original stubs (which were cross-schema $refs)
  if (Object.keys(importedDefs).length > 0) {
    const originalDefs = (walked.definitions || {}) as Record<string, RJSFSchema>;
    walked.definitions = { ...originalDefs, ...importedDefs };
  }

  return walked;
}

/** Pre-resolved schemas ready for RJSF (cross-schema $refs inlined). */
const resolvedAppLinks = resolveSchema(appLinksSchema as RJSFSchema);
const resolvedAsset = resolveSchema(assetSchema as RJSFSchema);
const resolvedBulkUpload = resolveSchema(bulkUploadSchema as RJSFSchema);
const resolvedChaiseConfig = resolveSchema(chaiseConfigSchema as RJSFSchema);
const resolvedCitation = resolveSchema(citationSchema as RJSFSchema);
const resolvedColumnDisplay = resolveSchema(columnDisplaySchema as RJSFSchema);
const resolvedDisplay = resolveSchema(displaySchema as RJSFSchema);
const resolvedExport = resolveSchema(exportSchema as RJSFSchema);
const resolvedExport2019 = resolveSchema(export2019Schema as RJSFSchema);
const resolvedForeignKey = resolveSchema(foreignKeySchema as RJSFSchema);
const resolvedGenerated = resolveSchema(generatedSchema as RJSFSchema);
const resolvedImmutable = resolveSchema(immutableSchema as RJSFSchema);
const resolvedIndexingPreferences = resolveSchema(indexingPreferencesSchema as RJSFSchema);
const resolvedKeyDisplay = resolveSchema(keyDisplaySchema as RJSFSchema);
const resolvedNonDeletable = resolveSchema(nonDeletableSchema as RJSFSchema);
const resolvedRequired = resolveSchema(requiredSchema as RJSFSchema);
const resolvedSourceDefinitions = resolveSchema(sourceDefinitionsSchema as RJSFSchema);
const resolvedTableAlternatives = resolveSchema(tableAlternativesSchema as RJSFSchema);
const resolvedTableDisplay = resolveSchema(tableDisplaySchema as RJSFSchema);
const resolvedVisibleColumns = resolveSchema(visibleColumnsSchema as RJSFSchema);
const resolvedVisibleForeignKeys = resolveSchema(visibleForeignKeysSchema as RJSFSchema);

// ── Tag URI → schema mapping ────────────────────────────────────

/** Maps annotation tag URIs to their resolved JSON Schema (cross-schema $refs inlined). */
export const SCHEMA_BY_TAG: Record<string, RJSFSchema> = {
  [TAG.display]: resolvedDisplay,
  [TAG.visible_columns]: resolvedVisibleColumns,
  [TAG.visible_foreign_keys]: resolvedVisibleForeignKeys,
  [TAG.table_display]: resolvedTableDisplay,
  [TAG.column_display]: resolvedColumnDisplay,
  [TAG.source_definitions]: resolvedSourceDefinitions,
  [TAG.key_display]: resolvedKeyDisplay,
  [TAG.foreign_key]: resolvedForeignKey,
  [TAG.table_alternatives]: resolvedTableAlternatives,
  [TAG.asset]: resolvedAsset,
  [TAG.citation]: resolvedCitation,
  [TAG.export]: resolvedExport,
  [TAG.export_2019]: resolvedExport2019,
  [TAG.generated]: resolvedGenerated,
  [TAG.immutable]: resolvedImmutable,
  [TAG.non_deletable]: resolvedNonDeletable,
  [TAG.required]: resolvedRequired,
  [TAG.bulk_upload]: resolvedBulkUpload,
  [TAG.chaise_config]: resolvedChaiseConfig,
  [TAG.indexing_preferences]: resolvedIndexingPreferences,
  [TAG.app_links]: resolvedAppLinks,
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
