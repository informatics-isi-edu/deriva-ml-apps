// annotation-io.ts — Export/import of annotations and diff computation.
// Pure functions, no UI dependencies.

import type {
  CatalogSchema,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  KeyInfo,
  ForeignKeyInfo,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnnotationExport {
  _meta: {
    version: 1;
    exported_at: string; // ISO 8601
    hostname: string;
    catalog_id: string;
    scope: "catalog" | "schema" | "table";
    scope_name?: string; // e.g. "myschema" or "myschema.MyTable"
  };
  annotations?: Record<string, any>; // catalog-level (scope=catalog only)
  schemas: Record<
    string,
    {
      annotations: Record<string, any>;
      tables: Record<
        string,
        {
          annotations: Record<string, any>;
          columns: Record<string, { annotations: Record<string, any> }>;
          keys: Record<string, { annotations: Record<string, any> }>; // keyed by constraint_name[1]
          foreign_keys: Record<string, { annotations: Record<string, any> }>; // keyed by constraint_name[1]
        }
      >;
    }
  >;
}

export type AnnotationChangeType = "add" | "update" | "delete";

export interface AnnotationDiffEntry {
  path: string; // human-readable, e.g. "schema.Table > column:Name > tag:display"
  tag: string;
  type: AnnotationChangeType;
  oldValue?: any;
  newValue?: any;
}

export interface AnnotationDiff {
  entries: AnnotationDiffEntry[];
  summary: {
    additions: number;
    updates: number;
    deletions: number;
    objectsAffected: number;
  };
  changes: {
    catalog?: Array<{
      tag: string;
      type: AnnotationChangeType;
      value?: any;
    }>;
    schemas: Record<
      string,
      Array<{ tag: string; type: AnnotationChangeType; value?: any }>
    >;
    tables: Record<
      string,
      Record<
        string,
        Array<{ tag: string; type: AnnotationChangeType; value?: any }>
      >
    >;
    columns: Record<
      string,
      Record<
        string,
        Record<
          string,
          Array<{ tag: string; type: AnnotationChangeType; value?: any }>
        >
      >
    >;
    keys: Record<
      string,
      Record<
        string,
        Record<
          string,
          Array<{ tag: string; type: AnnotationChangeType; value?: any }>
        >
      >
    >;
    foreign_keys: Record<
      string,
      Record<
        string,
        Record<
          string,
          Array<{ tag: string; type: AnnotationChangeType; value?: any }>
        >
      >
    >;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** True when the record has at least one key. */
function hasAnnotations(annotations: Record<string, any>): boolean {
  return Object.keys(annotations).length > 0;
}

/** Deep-equal via JSON round-trip (sufficient for annotation values). */
function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface TableExportData {
  annotations: Record<string, any>;
  columns: Record<string, { annotations: Record<string, any> }>;
  keys: Record<string, { annotations: Record<string, any> }>;
  foreign_keys: Record<string, { annotations: Record<string, any> }>;
}

/**
 * Extract annotation data from a single TableInfo.
 * Columns, keys, and foreign keys with empty annotations are omitted.
 */
function extractTableData(table: TableInfo): TableExportData {
  const columns: Record<string, { annotations: Record<string, any> }> = {};
  for (const col of table.columns) {
    if (hasAnnotations(col.annotations)) {
      columns[col.name] = { annotations: { ...col.annotations } };
    }
  }

  const keys: Record<string, { annotations: Record<string, any> }> = {};
  for (const key of table.keys) {
    if (hasAnnotations(key.annotations)) {
      keys[key.constraint_name[1]] = { annotations: { ...key.annotations } };
    }
  }

  const foreign_keys: Record<string, { annotations: Record<string, any> }> =
    {};
  for (const fk of table.foreign_keys) {
    if (hasAnnotations(fk.annotations)) {
      foreign_keys[fk.constraint_name[1]] = {
        annotations: { ...fk.annotations },
      };
    }
  }

  return {
    annotations: { ...table.annotations },
    columns,
    keys,
    foreign_keys,
  };
}

/** True when a table export has any annotation anywhere in its subtree. */
function tableHasAnnotations(data: TableExportData): boolean {
  return (
    hasAnnotations(data.annotations) ||
    Object.keys(data.columns).length > 0 ||
    Object.keys(data.keys).length > 0 ||
    Object.keys(data.foreign_keys).length > 0
  );
}

function buildMeta(
  schema: CatalogSchema,
  scope: "catalog" | "schema" | "table",
  scopeName?: string
): AnnotationExport["_meta"] {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    hostname: schema.hostname,
    catalog_id: schema.catalog_id,
    scope,
    ...(scopeName !== undefined ? { scope_name: scopeName } : {}),
  };
}

function extractSchemaData(
  schemaInfo: SchemaInfo
): AnnotationExport["schemas"][string] | null {
  const tables: Record<string, TableExportData> = {};
  for (const [tableName, tableInfo] of Object.entries(schemaInfo.tables)) {
    const data = extractTableData(tableInfo);
    if (tableHasAnnotations(data)) {
      tables[tableName] = data;
    }
  }

  const schemaHasAnns =
    hasAnnotations(schemaInfo.annotations) || Object.keys(tables).length > 0;

  if (!schemaHasAnns) return null;

  return {
    annotations: { ...schemaInfo.annotations },
    tables,
  };
}

// ---------------------------------------------------------------------------
// Extract functions
// ---------------------------------------------------------------------------

/**
 * Extract ALL annotations at every level of the catalog.
 * Only includes objects that have non-empty annotations somewhere in their subtree.
 */
export function extractCatalogAnnotations(
  schema: CatalogSchema
): AnnotationExport {
  const schemas: AnnotationExport["schemas"] = {};

  for (const [schemaName, schemaInfo] of Object.entries(schema.schemas)) {
    const data = extractSchemaData(schemaInfo);
    if (data) {
      schemas[schemaName] = data;
    }
  }

  return {
    _meta: buildMeta(schema, "catalog"),
    annotations: { ...schema.annotations },
    schemas,
  };
}

/**
 * Extract annotations for one schema and all its children.
 * Throws if the schema is not found.
 */
export function extractSchemaAnnotations(
  schema: CatalogSchema,
  schemaName: string
): AnnotationExport {
  const schemaInfo = schema.schemas[schemaName];
  if (!schemaInfo) {
    throw new Error(`Schema "${schemaName}" not found in catalog`);
  }

  const data = extractSchemaData(schemaInfo);
  const schemas: AnnotationExport["schemas"] = {};
  if (data) {
    schemas[schemaName] = data;
  } else {
    // Even if empty, include the schema entry so the export reflects the scope
    schemas[schemaName] = { annotations: {}, tables: {} };
  }

  return {
    _meta: buildMeta(schema, "schema", schemaName),
    schemas,
  };
}

/**
 * Extract annotations for one table including columns, keys, and foreign keys.
 * Throws if the schema or table is not found.
 */
export function extractTableAnnotations(
  schema: CatalogSchema,
  schemaName: string,
  tableName: string
): AnnotationExport {
  const schemaInfo = schema.schemas[schemaName];
  if (!schemaInfo) {
    throw new Error(`Schema "${schemaName}" not found in catalog`);
  }
  const tableInfo = schemaInfo.tables[tableName];
  if (!tableInfo) {
    throw new Error(
      `Table "${tableName}" not found in schema "${schemaName}"`
    );
  }

  const data = extractTableData(tableInfo);

  return {
    _meta: buildMeta(schema, "table", `${schemaName}.${tableName}`),
    schemas: {
      [schemaName]: {
        annotations: {},
        tables: {
          [tableName]: data,
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Filesystem persistence (mirrors deriva-workbench directory layout)
// ---------------------------------------------------------------------------
//
// The desktop workbench dumps annotations as a directory hierarchy:
//   root/
//     annotations.json        (catalog-level annotations)
//     .meta.json              ({"type":"catalog"})
//     schemas/
//       {schema}/
//         annotations.json
//         .meta.json
//         tables/
//           {table}/
//             annotations.json
//             .meta.json
//             columns/{col}/   ...
//             keys/{key}/      ...
//             foreign_keys/{fk}/ ...
//
// We use the File System Access API (showDirectoryPicker) so the browser
// reads/writes a real directory the user chooses — same UX as the desktop app.

/** Replace non-word characters with underscores (matches Python _safe_model_name). */
function safeModelName(name: string): string {
  return name.replace(/\W/g, "_");
}

/** Write a JSON file into a directory handle. */
async function writeJsonFile(
  dir: FileSystemDirectoryHandle,
  filename: string,
  data: any
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

/** Read and parse a JSON file from a directory handle. Returns null if not found. */
async function readJsonFile(
  dir: FileSystemDirectoryHandle,
  filename: string
): Promise<any | null> {
  try {
    const fileHandle = await dir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Get or create a subdirectory. */
async function getSubdir(
  parent: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(safeModelName(name), { create: true });
}

/** Try to get a subdirectory, returning null if it doesn't exist. */
async function tryGetSubdir(
  parent: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(safeModelName(name));
  } catch {
    return null;
  }
}

/** Iterate directory entries, yielding [name, handle] pairs. */
async function listSubdirs(
  parent: FileSystemDirectoryHandle
): Promise<Array<[string, FileSystemDirectoryHandle]>> {
  const results: Array<[string, FileSystemDirectoryHandle]> = [];
  // Use values() iterator — the async iterable interface on FileSystemDirectoryHandle
  // is not fully typed in all TS libs, so we cast through the async iterator protocol.
  const iter = (parent as any).values() as AsyncIterable<FileSystemHandle>;
  for await (const handle of iter) {
    if (handle.kind === "directory") {
      results.push([handle.name, handle as FileSystemDirectoryHandle]);
    }
  }
  return results;
}

/**
 * Dump annotations to a user-selected directory using the File System Access API.
 * Mirrors the deriva-workbench directory hierarchy exactly.
 *
 * @returns number of files written
 */
export async function dumpAnnotationsToDirectory(
  data: AnnotationExport,
  onProgress?: (done: number, total: number) => void
): Promise<{ filesWritten: number; directory: string }> {
  // Prompt user to pick a directory
  const rootHandle = await (window as any).showDirectoryPicker({
    mode: "readwrite",
    startIn: "documents",
  });

  let filesWritten = 0;
  // Count total files to write for progress
  let total = 0;
  if (data.annotations) total += 2; // catalog annotations.json + .meta.json
  for (const schemaData of Object.values(data.schemas)) {
    total += 2; // schema
    for (const tableData of Object.values(schemaData.tables)) {
      total += 2; // table
      total += Object.keys(tableData.columns).length * 2;
      total += Object.keys(tableData.keys).length * 2;
      total += Object.keys(tableData.foreign_keys).length * 2;
    }
  }

  let done = 0;
  function tick() {
    done++;
    onProgress?.(done, total);
  }

  // Catalog-level
  if (data.annotations) {
    await writeJsonFile(rootHandle, "annotations.json", data.annotations);
    tick();
    await writeJsonFile(rootHandle, ".meta.json", { type: "catalog" });
    tick();
    filesWritten += 2;
  }

  // Schemas
  const schemasDir = await getSubdir(rootHandle, "schemas");
  for (const [schemaName, schemaData] of Object.entries(data.schemas)) {
    const schemaDir = await getSubdir(schemasDir, schemaName);
    await writeJsonFile(schemaDir, "annotations.json", schemaData.annotations);
    tick();
    await writeJsonFile(schemaDir, ".meta.json", {
      type: "schema",
      name: schemaName,
    });
    tick();
    filesWritten += 2;

    // Tables
    const tablesDir = await getSubdir(schemaDir, "tables");
    for (const [tableName, tableData] of Object.entries(schemaData.tables)) {
      const tableDir = await getSubdir(tablesDir, tableName);
      await writeJsonFile(tableDir, "annotations.json", tableData.annotations);
      tick();
      await writeJsonFile(tableDir, ".meta.json", {
        type: "table",
        schema: schemaName,
        table: tableName,
      });
      tick();
      filesWritten += 2;

      // Columns
      if (Object.keys(tableData.columns).length > 0) {
        const columnsDir = await getSubdir(tableDir, "columns");
        for (const [colName, colData] of Object.entries(tableData.columns)) {
          const colDir = await getSubdir(columnsDir, colName);
          await writeJsonFile(colDir, "annotations.json", colData.annotations);
          tick();
          await writeJsonFile(colDir, ".meta.json", {
            type: "column",
            schema: schemaName,
            table: tableName,
            column: colName,
          });
          tick();
          filesWritten += 2;
        }
      }

      // Keys
      if (Object.keys(tableData.keys).length > 0) {
        const keysDir = await getSubdir(tableDir, "keys");
        for (const [keyName, keyData] of Object.entries(tableData.keys)) {
          const keyDir = await getSubdir(keysDir, keyName);
          await writeJsonFile(keyDir, "annotations.json", keyData.annotations);
          tick();
          await writeJsonFile(keyDir, ".meta.json", {
            type: "key",
            schema: schemaName,
            table: tableName,
            key: keyName,
          });
          tick();
          filesWritten += 2;
        }
      }

      // Foreign keys
      if (Object.keys(tableData.foreign_keys).length > 0) {
        const fksDir = await getSubdir(tableDir, "foreign_keys");
        for (const [fkName, fkData] of Object.entries(
          tableData.foreign_keys
        )) {
          const fkDir = await getSubdir(fksDir, fkName);
          await writeJsonFile(fkDir, "annotations.json", fkData.annotations);
          tick();
          await writeJsonFile(fkDir, ".meta.json", {
            type: "foreign_key",
            schema: schemaName,
            table: tableName,
            foreign_key: fkName,
          });
          tick();
          filesWritten += 2;
        }
      }
    }
  }

  return { filesWritten, directory: rootHandle.name };
}

/**
 * Restore annotations from a user-selected directory using the File System Access API.
 * Reads the same directory hierarchy written by dumpAnnotationsToDirectory or
 * the Python deriva-workbench.
 *
 * Returns an AnnotationExport so it can be fed into computeAnnotationDiff → bulkSaveAnnotations.
 */
export async function restoreAnnotationsFromDirectory(): Promise<AnnotationExport> {
  const rootHandle = await (window as any).showDirectoryPicker({
    mode: "read",
    startIn: "documents",
  });

  // Read catalog-level
  const catalogAnnotations =
    (await readJsonFile(rootHandle, "annotations.json")) ?? {};
  const catalogMeta = await readJsonFile(rootHandle, ".meta.json");

  const schemas: AnnotationExport["schemas"] = {};

  // Read schemas/
  const schemasDir = await tryGetSubdir(rootHandle, "schemas");
  if (schemasDir) {
    for (const [schemaDirName, schemaHandle] of await listSubdirs(schemasDir)) {
      const schemaMeta = await readJsonFile(schemaHandle, ".meta.json");
      const schemaName = schemaMeta?.name ?? schemaDirName;
      const schemaAnnotations =
        (await readJsonFile(schemaHandle, "annotations.json")) ?? {};

      const tables: AnnotationExport["schemas"][string]["tables"] = {};

      // Read tables/
      const tablesDir = await tryGetSubdir(schemaHandle, "tables");
      if (tablesDir) {
        for (const [tableDirName, tableHandle] of await listSubdirs(
          tablesDir
        )) {
          const tableMeta = await readJsonFile(tableHandle, ".meta.json");
          const tableName = tableMeta?.table ?? tableDirName;
          const tableAnnotations =
            (await readJsonFile(tableHandle, "annotations.json")) ?? {};

          const columns: Record<
            string,
            { annotations: Record<string, any> }
          > = {};
          const keys: Record<
            string,
            { annotations: Record<string, any> }
          > = {};
          const foreign_keys: Record<
            string,
            { annotations: Record<string, any> }
          > = {};

          // Read columns/
          const columnsDir = await tryGetSubdir(tableHandle, "columns");
          if (columnsDir) {
            for (const [colDirName, colHandle] of await listSubdirs(
              columnsDir
            )) {
              const colMeta = await readJsonFile(colHandle, ".meta.json");
              const colName = colMeta?.column ?? colDirName;
              const colAnnotations =
                (await readJsonFile(colHandle, "annotations.json")) ?? {};
              if (Object.keys(colAnnotations).length > 0) {
                columns[colName] = { annotations: colAnnotations };
              }
            }
          }

          // Read keys/
          const keysDir = await tryGetSubdir(tableHandle, "keys");
          if (keysDir) {
            for (const [keyDirName, keyHandle] of await listSubdirs(keysDir)) {
              const keyMeta = await readJsonFile(keyHandle, ".meta.json");
              const keyName = keyMeta?.key ?? keyDirName;
              const keyAnnotations =
                (await readJsonFile(keyHandle, "annotations.json")) ?? {};
              if (Object.keys(keyAnnotations).length > 0) {
                keys[keyName] = { annotations: keyAnnotations };
              }
            }
          }

          // Read foreign_keys/
          const fksDir = await tryGetSubdir(tableHandle, "foreign_keys");
          if (fksDir) {
            for (const [fkDirName, fkHandle] of await listSubdirs(fksDir)) {
              const fkMeta = await readJsonFile(fkHandle, ".meta.json");
              const fkName = fkMeta?.foreign_key ?? fkDirName;
              const fkAnnotations =
                (await readJsonFile(fkHandle, "annotations.json")) ?? {};
              if (Object.keys(fkAnnotations).length > 0) {
                foreign_keys[fkName] = { annotations: fkAnnotations };
              }
            }
          }

          tables[tableName] = {
            annotations: tableAnnotations,
            columns,
            keys,
            foreign_keys,
          };
        }
      }

      schemas[schemaName] = { annotations: schemaAnnotations, tables };
    }
  }

  // Determine scope from what was found
  const schemaNames = Object.keys(schemas);
  const hasCatalogAnns = Object.keys(catalogAnnotations).length > 0;
  let scope: AnnotationExport["_meta"]["scope"] = "catalog";
  let scopeName: string | undefined;

  if (!hasCatalogAnns && schemaNames.length === 1) {
    const onlySchema = schemaNames[0];
    const tableNames = Object.keys(schemas[onlySchema].tables);
    if (tableNames.length === 1) {
      scope = "table";
      scopeName = `${onlySchema}.${tableNames[0]}`;
    } else {
      scope = "schema";
      scopeName = onlySchema;
    }
  }

  return {
    _meta: {
      version: 1,
      exported_at: new Date().toISOString(),
      hostname: catalogMeta?.hostname ?? "",
      catalog_id: catalogMeta?.catalog_id ?? "",
      scope,
      ...(scopeName ? { scope_name: scopeName } : {}),
    },
    ...(hasCatalogAnns ? { annotations: catalogAnnotations } : {}),
    schemas,
  };
}

/**
 * Check whether the File System Access API is available in this browser.
 */
export function hasFileSystemAccess(): boolean {
  return typeof (window as any).showDirectoryPicker === "function";
}

/**
 * Fallback: download annotations as a single JSON file.
 * Used when the File System Access API is not available.
 */
export function downloadAnnotationExport(
  data: AnnotationExport,
  filename?: string
): void {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, "_");

  const defaultFilename = `annotations_${sanitize(data._meta.hostname)}_${sanitize(data._meta.catalog_id)}_${data._meta.scope}.json`;

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? defaultFilename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Parse / validate import
// ---------------------------------------------------------------------------

/**
 * Parse a JSON string and validate it as an AnnotationExport.
 * Throws a descriptive error on invalid input.
 */
export function parseAnnotationExport(json: string): AnnotationExport {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(
      `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object at the top level");
  }

  // Validate _meta
  if (!parsed._meta || typeof parsed._meta !== "object") {
    throw new Error('Missing or invalid "_meta" field');
  }
  if (parsed._meta.version !== 1) {
    throw new Error(
      `Unsupported export version: ${parsed._meta.version} (expected 1)`
    );
  }
  if (typeof parsed._meta.exported_at !== "string") {
    throw new Error('Missing "_meta.exported_at" (expected ISO 8601 string)');
  }
  if (typeof parsed._meta.hostname !== "string") {
    throw new Error('Missing "_meta.hostname"');
  }
  if (typeof parsed._meta.catalog_id !== "string") {
    throw new Error('Missing "_meta.catalog_id"');
  }
  const validScopes = ["catalog", "schema", "table"];
  if (!validScopes.includes(parsed._meta.scope)) {
    throw new Error(
      `Invalid "_meta.scope": "${parsed._meta.scope}" (expected one of: ${validScopes.join(", ")})`
    );
  }

  // Validate schemas
  if (!parsed.schemas || typeof parsed.schemas !== "object") {
    throw new Error('Missing or invalid "schemas" field');
  }

  for (const [schemaName, schemaData] of Object.entries(parsed.schemas)) {
    if (typeof schemaData !== "object" || schemaData === null) {
      throw new Error(
        `Invalid schema entry for "${schemaName}": expected an object`
      );
    }
    const sd = schemaData as any;
    if (!sd.annotations || typeof sd.annotations !== "object") {
      throw new Error(
        `Schema "${schemaName}" missing "annotations" field`
      );
    }
    if (!sd.tables || typeof sd.tables !== "object") {
      throw new Error(`Schema "${schemaName}" missing "tables" field`);
    }

    for (const [tableName, tableData] of Object.entries(sd.tables)) {
      if (typeof tableData !== "object" || tableData === null) {
        throw new Error(
          `Invalid table entry for "${schemaName}.${tableName}": expected an object`
        );
      }
      const td = tableData as any;
      if (!td.annotations || typeof td.annotations !== "object") {
        throw new Error(
          `Table "${schemaName}.${tableName}" missing "annotations" field`
        );
      }
      if (!td.columns || typeof td.columns !== "object") {
        throw new Error(
          `Table "${schemaName}.${tableName}" missing "columns" field`
        );
      }
      if (!td.keys || typeof td.keys !== "object") {
        throw new Error(
          `Table "${schemaName}.${tableName}" missing "keys" field`
        );
      }
      if (!td.foreign_keys || typeof td.foreign_keys !== "object") {
        throw new Error(
          `Table "${schemaName}.${tableName}" missing "foreign_keys" field`
        );
      }
    }
  }

  return parsed as AnnotationExport;
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

/** Compare two annotation maps and return change entries. */
function diffAnnotationMaps(
  imported: Record<string, any>,
  current: Record<string, any>,
  pathPrefix: string
): {
  entries: AnnotationDiffEntry[];
  changes: Array<{ tag: string; type: AnnotationChangeType; value?: any }>;
} {
  const entries: AnnotationDiffEntry[] = [];
  const changes: Array<{
    tag: string;
    type: AnnotationChangeType;
    value?: any;
  }> = [];

  const allTags = new Set([
    ...Object.keys(imported),
    ...Object.keys(current),
  ]);

  for (const tag of allTags) {
    const inImported = tag in imported;
    const inCurrent = tag in current;
    const shortTag = tag.split(",").pop() ?? tag;

    if (inImported && !inCurrent) {
      entries.push({
        path: `${pathPrefix} > tag:${shortTag}`,
        tag,
        type: "add",
        newValue: imported[tag],
      });
      changes.push({ tag, type: "add", value: imported[tag] });
    } else if (inImported && inCurrent) {
      if (!deepEqual(imported[tag], current[tag])) {
        entries.push({
          path: `${pathPrefix} > tag:${shortTag}`,
          tag,
          type: "update",
          oldValue: current[tag],
          newValue: imported[tag],
        });
        changes.push({ tag, type: "update", value: imported[tag] });
      }
    } else if (!inImported && inCurrent) {
      entries.push({
        path: `${pathPrefix} > tag:${shortTag}`,
        tag,
        type: "delete",
        oldValue: current[tag],
      });
      changes.push({ tag, type: "delete" });
    }
  }

  return { entries, changes };
}

/**
 * Ensure nested record path exists and return the leaf record.
 */
function ensureNested<T>(
  root: Record<string, any>,
  keys: string[]
): Record<string, T> {
  let current = root;
  for (const key of keys) {
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  return current;
}

/**
 * Compute the changes needed to make `current` match `imported`.
 *
 * Delete logic: only considers deletions at levels present in the import.
 * If a table/column/key/FK exists in current but not in the import, its
 * annotations are left untouched (the import may be partial).
 */
export function computeAnnotationDiff(
  imported: AnnotationExport,
  current: CatalogSchema
): AnnotationDiff {
  const entries: AnnotationDiffEntry[] = [];
  const affectedObjects = new Set<string>();

  const changes: AnnotationDiff["changes"] = {
    schemas: {},
    tables: {},
    columns: {},
    keys: {},
    foreign_keys: {},
  };

  // --- Catalog-level annotations ---
  if (imported._meta.scope === "catalog" && imported.annotations) {
    const result = diffAnnotationMaps(
      imported.annotations,
      current.annotations,
      "catalog"
    );
    if (result.entries.length > 0) {
      entries.push(...result.entries);
      changes.catalog = result.changes;
      affectedObjects.add("catalog");
    }
  }

  // --- Schema / table / sub-object level ---
  for (const [schemaName, importedSchema] of Object.entries(
    imported.schemas
  )) {
    const currentSchema = current.schemas[schemaName];

    // Schema-level annotations
    if (currentSchema) {
      const result = diffAnnotationMaps(
        importedSchema.annotations,
        currentSchema.annotations,
        schemaName
      );
      if (result.entries.length > 0) {
        entries.push(...result.entries);
        changes.schemas[schemaName] = result.changes;
        affectedObjects.add(`schema:${schemaName}`);
      }
    } else {
      // Schema doesn't exist in current — all imported annotations are adds
      if (hasAnnotations(importedSchema.annotations)) {
        const result = diffAnnotationMaps(
          importedSchema.annotations,
          {},
          schemaName
        );
        entries.push(...result.entries);
        changes.schemas[schemaName] = result.changes;
        affectedObjects.add(`schema:${schemaName}`);
      }
    }

    // Tables
    for (const [tableName, importedTable] of Object.entries(
      importedSchema.tables
    )) {
      const currentTable = currentSchema?.tables[tableName];
      const tablePath = `${schemaName}.${tableName}`;

      // Table-level annotations
      const currentTableAnns = currentTable?.annotations ?? {};
      const tableResult = diffAnnotationMaps(
        importedTable.annotations,
        currentTableAnns,
        tablePath
      );
      if (tableResult.entries.length > 0) {
        entries.push(...tableResult.entries);
        ensureNested(changes.tables, [schemaName]);
        changes.tables[schemaName][tableName] = tableResult.changes;
        affectedObjects.add(`table:${tablePath}`);
      }

      // Columns
      for (const [colName, importedCol] of Object.entries(
        importedTable.columns
      )) {
        const currentCol = currentTable?.columns.find(
          (c: ColumnInfo) => c.name === colName
        );
        const currentColAnns = currentCol?.annotations ?? {};
        const colResult = diffAnnotationMaps(
          importedCol.annotations,
          currentColAnns,
          `${tablePath} > column:${colName}`
        );
        if (colResult.entries.length > 0) {
          entries.push(...colResult.entries);
          ensureNested(changes.columns, [schemaName, tableName]);
          changes.columns[schemaName][tableName][colName] = colResult.changes;
          affectedObjects.add(`column:${tablePath}.${colName}`);
        }
      }

      // Keys
      for (const [keyName, importedKey] of Object.entries(
        importedTable.keys
      )) {
        const currentKey = currentTable?.keys.find(
          (k: KeyInfo) => k.constraint_name[1] === keyName
        );
        const currentKeyAnns = currentKey?.annotations ?? {};
        const keyResult = diffAnnotationMaps(
          importedKey.annotations,
          currentKeyAnns,
          `${tablePath} > key:${keyName}`
        );
        if (keyResult.entries.length > 0) {
          entries.push(...keyResult.entries);
          ensureNested(changes.keys, [schemaName, tableName]);
          changes.keys[schemaName][tableName][keyName] = keyResult.changes;
          affectedObjects.add(`key:${tablePath}.${keyName}`);
        }
      }

      // Foreign keys
      for (const [fkName, importedFk] of Object.entries(
        importedTable.foreign_keys
      )) {
        const currentFk = currentTable?.foreign_keys.find(
          (fk: ForeignKeyInfo) => fk.constraint_name[1] === fkName
        );
        const currentFkAnns = currentFk?.annotations ?? {};
        const fkResult = diffAnnotationMaps(
          importedFk.annotations,
          currentFkAnns,
          `${tablePath} > fk:${fkName}`
        );
        if (fkResult.entries.length > 0) {
          entries.push(...fkResult.entries);
          ensureNested(changes.foreign_keys, [schemaName, tableName]);
          changes.foreign_keys[schemaName][tableName][fkName] =
            fkResult.changes;
          affectedObjects.add(`fk:${tablePath}.${fkName}`);
        }
      }

      // Delete detection for sub-objects that exist in current but not in import:
      // We only delete annotations on sub-objects that the import explicitly
      // covers. If the imported table has a columns section, we diff columns
      // that appear in both. But columns in current that are NOT in import
      // are left alone (partial import).
    }
  }

  const summary = {
    additions: entries.filter((e) => e.type === "add").length,
    updates: entries.filter((e) => e.type === "update").length,
    deletions: entries.filter((e) => e.type === "delete").length,
    objectsAffected: affectedObjects.size,
  };

  return { entries, summary, changes };
}

// ---------------------------------------------------------------------------
// Count helper
// ---------------------------------------------------------------------------

/**
 * Count total annotation tags and objects that have annotations.
 * Useful for preview display.
 */
export function countAnnotations(data: AnnotationExport): {
  tags: number;
  objects: number;
} {
  let tags = 0;
  let objects = 0;

  // Catalog-level
  if (data.annotations && hasAnnotations(data.annotations)) {
    tags += Object.keys(data.annotations).length;
    objects += 1;
  }

  for (const schemaData of Object.values(data.schemas)) {
    // Schema-level
    if (hasAnnotations(schemaData.annotations)) {
      tags += Object.keys(schemaData.annotations).length;
      objects += 1;
    }

    for (const tableData of Object.values(schemaData.tables)) {
      // Table-level
      if (hasAnnotations(tableData.annotations)) {
        tags += Object.keys(tableData.annotations).length;
        objects += 1;
      }

      // Columns
      for (const colData of Object.values(tableData.columns)) {
        if (hasAnnotations(colData.annotations)) {
          tags += Object.keys(colData.annotations).length;
          objects += 1;
        }
      }

      // Keys
      for (const keyData of Object.values(tableData.keys)) {
        if (hasAnnotations(keyData.annotations)) {
          tags += Object.keys(keyData.annotations).length;
          objects += 1;
        }
      }

      // Foreign keys
      for (const fkData of Object.values(tableData.foreign_keys)) {
        if (hasAnnotations(fkData.annotations)) {
          tags += Object.keys(fkData.annotations).length;
          objects += 1;
        }
      }
    }
  }

  return { tags, objects };
}
