/**
 * Standalone annotation validation using AJV directly.
 *
 * Validates annotation values against their JSON Schemas, walking an entire
 * catalog model to produce a structured report of invalid annotations.
 *
 * Uses the same schema registry and custom keywords as the RJSF validator
 * (src/schemas/validator.ts) but operates independently of React/RJSF.
 */

import Ajv from "ajv";
import { SCHEMA_BY_ID, getSchemaForTag } from "@/schemas";
import { shortTagName } from "@/annotation-registry";
import type { CatalogSchema } from "@/types";

// ── Types ───────────────────────────────────────────────────────

export interface ValidationError {
  /** JSON pointer path within the annotation value */
  path: string;
  /** Human-readable error message */
  message: string;
}

export interface ValidationResult {
  tag: string;
  /** Human-readable short name (e.g., "Visible Columns") */
  tagName: string;
  valid: boolean;
  errors: ValidationError[];
  /** Whether a JSON schema exists for this tag */
  hasSchema: boolean;
}

export interface ValidationReportEntry {
  /** e.g. "Schema:myschema > Table:MyTable > Column:Name" */
  objectPath: string;
  objectType: "catalog" | "schema" | "table" | "column" | "key" | "foreignkey";
  /** Only invalid results */
  results: ValidationResult[];
}

export interface ValidationReport {
  entries: ValidationReportEntry[];
  summary: {
    totalTags: number;
    validTags: number;
    invalidTags: number;
    noSchemaTags: number;
    objectsWithErrors: number;
  };
  allValid: boolean;
}

// ── AJV singleton ───────────────────────────────────────────────

const CUSTOM_KEYWORDS = [
  "valid-column",
  "valid-source-key",
  "valid-source-path",
  "valid-constraint",
  "valid-table",
];

const ajv = new Ajv({
  strict: false,
  allErrors: true,
  schemas: Object.values(SCHEMA_BY_ID),
});

for (const keyword of CUSTOM_KEYWORDS) {
  ajv.addKeyword({ keyword, validate: () => true, errors: false });
}

// ── Validation functions ────────────────────────────────────────

/**
 * Validate a single annotation value against its tag's JSON Schema.
 *
 * Tags without a known schema are reported as valid with `hasSchema: false`.
 */
export function validateAnnotation(tag: string, value: unknown): ValidationResult {
  const tagName = shortTagName(tag);
  const schema = getSchemaForTag(tag);

  if (!schema) {
    return { tag, tagName, valid: true, errors: [], hasSchema: false };
  }

  const validate = ajv.compile(schema);
  const valid = validate(value);

  const errors: ValidationError[] = [];
  if (!valid && validate.errors) {
    for (const err of validate.errors) {
      errors.push({
        path: err.instancePath || "/",
        message: err.message || "Unknown validation error",
      });
    }
  }

  return { tag, tagName, valid: errors.length === 0, errors, hasSchema: true };
}

/**
 * Validate all annotations in a tag-keyed map.
 *
 * Returns results for every tag (both valid and invalid).
 */
export function validateAllAnnotations(
  annotations: Record<string, unknown>,
): ValidationResult[] {
  return Object.entries(annotations).map(([tag, value]) =>
    validateAnnotation(tag, value),
  );
}

/**
 * Walk an entire catalog model and validate every annotation.
 *
 * Only objects with at least one invalid annotation appear in the report entries.
 */
export function validateCatalogAnnotations(schema: CatalogSchema): ValidationReport {
  const entries: ValidationReportEntry[] = [];
  let totalTags = 0;
  let validTags = 0;
  let invalidTags = 0;
  let noSchemaTags = 0;

  function processAnnotations(
    annotations: Record<string, unknown> | undefined,
    objectPath: string,
    objectType: ValidationReportEntry["objectType"],
  ): void {
    if (!annotations || Object.keys(annotations).length === 0) return;

    const results = validateAllAnnotations(annotations);
    totalTags += results.length;

    for (const result of results) {
      if (!result.hasSchema) noSchemaTags++;
      if (result.valid) {
        validTags++;
      } else {
        invalidTags++;
      }
    }

    const invalidResults = results.filter((r) => !r.valid);
    if (invalidResults.length > 0) {
      entries.push({ objectPath, objectType, results: invalidResults });
    }
  }

  // Catalog-level annotations
  processAnnotations(schema.annotations, "Catalog", "catalog");

  // Walk each schema
  for (const [schemaName, schemaInfo] of Object.entries(schema.schemas)) {
    const schemaPath = `Schema:${schemaName}`;
    processAnnotations(schemaInfo.annotations, schemaPath, "schema");

    // Walk each table
    for (const [tableName, tableInfo] of Object.entries(schemaInfo.tables)) {
      const tablePath = `${schemaPath} > Table:${tableName}`;
      processAnnotations(tableInfo.annotations, tablePath, "table");

      // Columns
      for (const column of tableInfo.columns) {
        const columnPath = `${tablePath} > Column:${column.name}`;
        processAnnotations(column.annotations, columnPath, "column");
      }

      // Keys
      for (const key of tableInfo.keys) {
        const keyLabel = key.constraint_name.join(":");
        const keyPath = `${tablePath} > Key:${keyLabel}`;
        processAnnotations(key.annotations, keyPath, "key");
      }

      // Foreign keys
      for (const fk of tableInfo.foreign_keys) {
        const fkLabel = fk.constraint_name.join(":");
        const fkPath = `${tablePath} > FK:${fkLabel}`;
        processAnnotations(fk.annotations, fkPath, "foreignkey");
      }
    }
  }

  return {
    entries,
    summary: {
      totalTags,
      validTags,
      invalidTags,
      noSchemaTags,
      objectsWithErrors: entries.length,
    },
    allValid: invalidTags === 0,
  };
}
