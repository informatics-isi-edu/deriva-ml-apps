import { useState, useEffect, useMemo, useRef } from "react";
import {
  Download,
  Upload,
  FileJson,
  AlertTriangle,
  Check,
  X,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatalogSchema } from "@/types";
import {
  extractCatalogAnnotations,
  extractSchemaAnnotations,
  extractTableAnnotations,
  downloadAnnotationExport,
  dumpAnnotationsToDirectory,
  parseAnnotationExport,
  restoreAnnotationsFromDirectory,
  computeAnnotationDiff,
  countAnnotations,
  hasFileSystemAccess,
  type AnnotationExport,
  type AnnotationDiff,
} from "@/annotation-io";
import { bulkSaveAnnotations } from "@/ermrest-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "export" | "import";
  schema: CatalogSchema;
  activeSchema: string | null;
  selectedTable: string | null; // "schema.TableName" format
  onImportComplete: () => void; // called after successful import to refresh schema
}

type ExportScope = "catalog" | "schema" | "table";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the short name from an annotation tag URI. */
function shortTagName(tag: string): string {
  const parts = tag.split(",");
  return parts[parts.length - 1] ?? tag;
}

/** Format an ISO date string for display. */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Export panel
// ---------------------------------------------------------------------------

function ExportPanel({
  schema,
  activeSchema,
  selectedTable,
  onOpenChange,
}: {
  schema: CatalogSchema;
  activeSchema: string | null;
  selectedTable: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const schemaNames = useMemo(
    () => Object.keys(schema.schemas).sort(),
    [schema]
  );

  // Derive default scope from context
  const defaultScope: ExportScope = selectedTable
    ? "table"
    : activeSchema
      ? "schema"
      : "catalog";

  const [scope, setScope] = useState<ExportScope>(defaultScope);
  const [dumping, setDumping] = useState(false);
  const [dumpProgress, setDumpProgress] = useState<{ done: number; total: number } | null>(null);
  const useDirectoryApi = hasFileSystemAccess();

  // Parse selectedTable into schema + table parts
  const selectedParts = useMemo(() => {
    if (!selectedTable) return null;
    const dotIdx = selectedTable.indexOf(".");
    if (dotIdx < 0) return null;
    return {
      schema: selectedTable.slice(0, dotIdx),
      table: selectedTable.slice(dotIdx + 1),
    };
  }, [selectedTable]);

  const [scopeSchema, setScopeSchema] = useState<string>(
    selectedParts?.schema ?? activeSchema ?? schemaNames[0] ?? ""
  );
  const [scopeTable, setScopeTable] = useState<string>(
    selectedParts?.table ?? ""
  );

  // Available tables for the selected schema
  const tableNames = useMemo(() => {
    const s = schema.schemas[scopeSchema];
    if (!s) return [];
    return Object.keys(s.tables).sort();
  }, [schema, scopeSchema]);

  // Reset table when schema changes
  useEffect(() => {
    if (scope === "table" && !tableNames.includes(scopeTable)) {
      setScopeTable(tableNames[0] ?? "");
    }
  }, [scope, scopeSchema, tableNames, scopeTable]);

  // Compute preview counts
  const preview = useMemo(() => {
    try {
      let exportData: AnnotationExport;
      if (scope === "catalog") {
        exportData = extractCatalogAnnotations(schema);
      } else if (scope === "schema") {
        exportData = extractSchemaAnnotations(schema, scopeSchema);
      } else {
        if (!scopeTable) return null;
        exportData = extractTableAnnotations(schema, scopeSchema, scopeTable);
      }
      return countAnnotations(exportData);
    } catch {
      return null;
    }
  }, [schema, scope, scopeSchema, scopeTable]);

  function getExportData(): AnnotationExport {
    if (scope === "catalog") {
      return extractCatalogAnnotations(schema);
    } else if (scope === "schema") {
      return extractSchemaAnnotations(schema, scopeSchema);
    } else {
      return extractTableAnnotations(schema, scopeSchema, scopeTable);
    }
  }

  async function handleDumpToDirectory() {
    setDumping(true);
    setDumpProgress(null);
    try {
      const exportData = getExportData();
      const result = await dumpAnnotationsToDirectory(exportData, (done, total) => {
        setDumpProgress({ done, total });
      });
      onOpenChange(false);
      toast.success(`Saved ${result.filesWritten} files to "${result.directory}"`);
    } catch (err: any) {
      // User cancelled the directory picker
      if (err?.name === "AbortError") return;
      toast.error(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setDumping(false);
      setDumpProgress(null);
    }
  }

  function handleDownloadFile() {
    try {
      const exportData = getExportData();
      downloadAnnotationExport(exportData);
      onOpenChange(false);
      toast.success("Annotation export downloaded");
    } catch (err) {
      toast.error(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <Download className="h-4 w-4" />
          Save Annotations
        </DialogTitle>
        <DialogDescription className="text-xs text-slate-500">
          Save annotations to a directory on your filesystem, compatible with
          the deriva-workbench format.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Scope selection */}
        <div className="space-y-2">
          <Label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Scope
          </Label>
          <RadioGroup
            value={scope}
            onValueChange={(v) => setScope(v as ExportScope)}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="catalog" id="scope-catalog" />
              <Label htmlFor="scope-catalog" className="text-xs cursor-pointer">
                Catalog
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="schema" id="scope-schema" />
              <Label htmlFor="scope-schema" className="text-xs cursor-pointer">
                Schema
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="table" id="scope-table" />
              <Label htmlFor="scope-table" className="text-xs cursor-pointer">
                Table
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Schema dropdown (schema + table scope) */}
        {(scope === "schema" || scope === "table") && (
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-slate-500">
              Schema
            </Label>
            <Select value={scopeSchema} onValueChange={setScopeSchema}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select schema" />
              </SelectTrigger>
              <SelectContent>
                {schemaNames.map((name) => (
                  <SelectItem key={name} value={name} className="text-xs">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Table dropdown (table scope) */}
        {scope === "table" && (
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-slate-500">
              Table
            </Label>
            <Select value={scopeTable} onValueChange={setScopeTable}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select table" />
              </SelectTrigger>
              <SelectContent>
                {tableNames.map((name) => (
                  <SelectItem key={name} value={name} className="text-xs">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <FileJson className="h-3.5 w-3.5 text-slate-400" />
            <span>
              {preview.tags} annotation tag{preview.tags !== 1 ? "s" : ""} across{" "}
              {preview.objects} object{preview.objects !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {dumping && dumpProgress && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-4 w-4 text-slate-400 animate-spin" />
            <p className="text-xs text-slate-600">
              Writing files... ({dumpProgress.done}/{dumpProgress.total})
            </p>
          </div>
          <Progress
            value={dumpProgress.total > 0 ? (dumpProgress.done / dumpProgress.total) * 100 : 0}
          />
        </div>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => onOpenChange(false)}
          disabled={dumping}
        >
          Cancel
        </Button>
        {!useDirectoryApi && (
          <Button
            size="sm"
            className="text-xs gap-1.5"
            onClick={handleDownloadFile}
            disabled={(scope === "table" && !scopeTable) || dumping}
          >
            <Download className="h-3.5 w-3.5" />
            Download JSON
          </Button>
        )}
        {useDirectoryApi && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={handleDownloadFile}
              disabled={(scope === "table" && !scopeTable) || dumping}
              title="Download as a single JSON file"
            >
              <FileJson className="h-3.5 w-3.5" />
              JSON file
            </Button>
            <Button
              size="sm"
              className="text-xs gap-1.5"
              onClick={handleDumpToDirectory}
              disabled={(scope === "table" && !scopeTable) || dumping}
              title="Save to a directory (workbench format)"
            >
              <Download className="h-3.5 w-3.5" />
              Save to directory
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Import panel
// ---------------------------------------------------------------------------

function ImportPanel({
  schema,
  onOpenChange,
  onImportComplete,
}: {
  schema: CatalogSchema;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}) {
  const [importData, setImportData] = useState<AnnotationExport | null>(null);
  const [diff, setDiff] = useState<AnnotationDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [applyResult, setApplyResult] = useState<{
    saved: number;
    failed: Array<{ path: string; error: string }>;
  } | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const useDirectoryApi = hasFileSystemAccess();

  function loadImportData(data: AnnotationExport) {
    setImportData(data);
    const d = computeAnnotationDiff(data, schema);
    setDiff(d);
    setError(null);
    setApplyResult(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = parseAnnotationExport(text);
      loadImportData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setImportData(null);
      setDiff(null);
    }
  }

  async function handleRestoreFromDirectory() {
    setRestoring(true);
    setError(null);
    try {
      const data = await restoreAnnotationsFromDirectory();
      loadImportData(data);
    } catch (err: any) {
      if (err?.name === "AbortError") return; // user cancelled picker
      setError(err instanceof Error ? err.message : String(err));
      setImportData(null);
      setDiff(null);
    } finally {
      setRestoring(false);
    }
  }

  async function handleApply() {
    if (!diff) return;
    setApplying(true);
    try {
      const result = await bulkSaveAnnotations(
        diff,
        schema,
        (done: number, total: number) => {
          setProgress({ done, total });
        }
      );
      setApplyResult(result);
      if (result.failed.length === 0) {
        toast.success(`Applied ${result.saved} annotation changes`);
        onImportComplete();
      } else {
        toast.warning(
          `Applied ${result.saved} changes, ${result.failed.length} failed`
        );
      }
    } catch (err) {
      toast.error(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setApplying(false);
    }
  }

  function togglePath(path: string) {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  // Group diff entries by object path (everything before " > tag:")
  const groupedEntries = useMemo(() => {
    if (!diff) return [];
    const groups = new Map<
      string,
      Array<(typeof diff.entries)[number]>
    >();
    for (const entry of diff.entries) {
      const tagIdx = entry.path.lastIndexOf(" > tag:");
      const objectPath = tagIdx >= 0 ? entry.path.slice(0, tagIdx) : entry.path;
      if (!groups.has(objectPath)) {
        groups.set(objectPath, []);
      }
      groups.get(objectPath)!.push(entry);
    }
    return Array.from(groups.entries());
  }, [diff]);

  const totalChanges = diff
    ? diff.summary.additions + diff.summary.updates + diff.summary.deletions
    : 0;

  // Determine phase
  const phase: "file" | "diff" | "applying" | "complete" = applyResult
    ? "complete"
    : applying
      ? "applying"
      : diff
        ? "diff"
        : "file";

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" />
          Restore Annotations
        </DialogTitle>
        <DialogDescription className="text-xs text-slate-500">
          Load annotations from a directory or JSON file and apply them to the catalog.
        </DialogDescription>
      </DialogHeader>

      {/* File selection phase */}
      {phase === "file" && (
        <div className="space-y-4">
          {useDirectoryApi && (
            <div
              className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:border-slate-300 hover:bg-slate-50/50 transition-colors"
              onClick={restoring ? undefined : handleRestoreFromDirectory}
            >
              {restoring ? (
                <>
                  <RefreshCw className="h-8 w-8 text-slate-300 mx-auto mb-3 animate-spin" />
                  <p className="text-xs text-slate-600 font-medium">
                    Reading directory...
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-xs text-slate-600 font-medium">
                    Select annotation directory
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Directory previously saved from Schema Workbench or deriva-workbench
                  </p>
                </>
              )}
            </div>
          )}

          <div
            className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:border-slate-300 hover:bg-slate-50/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileJson className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-xs text-slate-600 font-medium">
              {useDirectoryApi ? "Or select a JSON file" : "Select annotation export file"}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              JSON file previously exported from Schema Workbench
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </div>
      )}

      {/* Diff preview phase */}
      {phase === "diff" && diff && importData && (
        <div className="space-y-4">
          {/* Source info */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Source
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              <span className="text-slate-500">Hostname:</span>
              <span className="text-slate-700 font-mono text-[11px]">
                {importData._meta.hostname}
              </span>
              <span className="text-slate-500">Catalog:</span>
              <span className="text-slate-700 font-mono text-[11px]">
                {importData._meta.catalog_id}
              </span>
              <span className="text-slate-500">Scope:</span>
              <span className="text-slate-700">
                {importData._meta.scope}
                {importData._meta.scope_name && (
                  <span className="text-slate-400 ml-1">
                    ({importData._meta.scope_name})
                  </span>
                )}
              </span>
              <span className="text-slate-500">Exported:</span>
              <span className="text-slate-700">
                {formatDate(importData._meta.exported_at)}
              </span>
            </div>
          </div>

          {/* Summary line */}
          {totalChanges === 0 ? (
            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-md">
              <Check className="h-4 w-4 text-slate-400" />
              <p className="text-xs text-slate-500">
                No changes detected — the catalog already matches the export
                file.
              </p>
            </div>
          ) : (
            <div className="text-xs text-slate-600">
              <span className="text-emerald-600 font-medium">
                {diff.summary.additions} addition
                {diff.summary.additions !== 1 ? "s" : ""}
              </span>
              {", "}
              <span className="text-amber-600 font-medium">
                {diff.summary.updates} update
                {diff.summary.updates !== 1 ? "s" : ""}
              </span>
              {", "}
              <span className="text-red-600 font-medium">
                {diff.summary.deletions} deletion
                {diff.summary.deletions !== 1 ? "s" : ""}
              </span>
              {" across "}
              <span className="font-medium">
                {diff.summary.objectsAffected} object
                {diff.summary.objectsAffected !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Diff entries */}
          {totalChanges > 0 && (
            <ScrollArea className="max-h-64 border border-slate-200 rounded-md">
              <div className="divide-y divide-slate-100">
                {groupedEntries.map(([objectPath, entries]) => {
                  const isExpanded = expandedPaths.has(objectPath);
                  return (
                    <div key={objectPath}>
                      <button
                        onClick={() => togglePath(objectPath)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                      >
                        <ChevronRight
                          className={`h-3 w-3 text-slate-400 flex-shrink-0 transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                        <span className="text-xs text-slate-700 font-medium truncate flex-1">
                          {objectPath}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {entries.length} change
                          {entries.length !== 1 ? "s" : ""}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="bg-slate-50/50">
                          {entries.map((entry, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 px-3 py-1.5 pl-8"
                            >
                              <span className="text-[11px] text-slate-600 truncate flex-1 font-mono">
                                {shortTagName(entry.tag)}
                              </span>
                              <Badge
                                variant="secondary"
                                className={`text-[10px] px-1.5 py-0 ${
                                  entry.type === "add"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : entry.type === "update"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-red-100 text-red-700"
                                }`}
                              >
                                {entry.type === "add"
                                  ? "Add"
                                  : entry.type === "update"
                                    ? "Update"
                                    : "Delete"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* Deletion warning */}
          {diff.summary.deletions > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                This will delete {diff.summary.deletions} annotation
                {diff.summary.deletions !== 1 ? "s" : ""} from the catalog.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs gap-1.5"
              onClick={handleApply}
              disabled={totalChanges === 0}
            >
              <Upload className="h-3.5 w-3.5" />
              Apply to Catalog
            </Button>
          </DialogFooter>
        </div>
      )}

      {/* Applying phase */}
      {phase === "applying" && (
        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-4 w-4 text-slate-400 animate-spin" />
            <p className="text-xs text-slate-600">
              Applying changes...{" "}
              {progress && (
                <span className="font-medium">
                  ({progress.done}/{progress.total})
                </span>
              )}
            </p>
          </div>
          {progress && (
            <Progress
              value={
                progress.total > 0
                  ? (progress.done / progress.total) * 100
                  : 0
              }
            />
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" disabled>
              Cancel
            </Button>
            <Button size="sm" className="text-xs" disabled>
              Applying...
            </Button>
          </DialogFooter>
        </div>
      )}

      {/* Complete phase */}
      {phase === "complete" && applyResult && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
            <Check className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700">
              Saved {applyResult.saved} change
              {applyResult.saved !== 1 ? "s" : ""}.
            </p>
          </div>

          {applyResult.failed.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <X className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">
                  {applyResult.failed.length} change
                  {applyResult.failed.length !== 1 ? "s" : ""} failed:
                </p>
              </div>
              <ScrollArea className="max-h-32">
                <div className="space-y-1 px-1">
                  {applyResult.failed.map((f, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-red-600 font-mono truncate"
                      title={`${f.path}: ${f.error}`}
                    >
                      {f.path}: {f.error}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <DialogFooter>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export default function ExportImportDialog({
  open,
  onOpenChange,
  mode,
  schema,
  activeSchema,
  selectedTable,
  onImportComplete,
}: ExportImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={mode === "import" ? "max-w-2xl" : "max-w-xl"}
      >
        {mode === "export" ? (
          <ExportPanel
            schema={schema}
            activeSchema={activeSchema}
            selectedTable={selectedTable}
            onOpenChange={onOpenChange}
          />
        ) : (
          <ImportPanel
            schema={schema}
            onOpenChange={onOpenChange}
            onImportComplete={onImportComplete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
