/**
 * Annotation editor panel modeled after the deriva-workbench Qt application.
 *
 * Features:
 * - Target selector: table, columns, keys, foreign keys
 * - Two-panel browser: tag list (present + available) / specialized editor
 * - Local draft state — edits accumulate without writing to the catalog
 * - Explicit Save button to batch-write all changes
 * - Undo/Restore to revert to previous server state after saving
 * - Specialized read-only editors for Display, Visible Columns/FKs,
 *   Table Display, Column Display, Asset, Citation, Foreign Key, Key Display,
 *   Source Definitions
 */

import { useState, useCallback, useEffect } from "react";
import { Plus, Trash2, Save, Undo2, RotateCcw, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EnrichedTable } from "@/types";
import {
  putTableAnnotation,
  putColumnAnnotation,
  putSchemaAnnotation,
  putKeyAnnotation,
  putForeignKeyAnnotation,
  putCatalogAnnotation,
  deleteTableAnnotation,
  deleteColumnAnnotation,
  deleteSchemaAnnotation,
  deleteKeyAnnotation,
  deleteForeignKeyAnnotation,
  deleteCatalogAnnotation,
} from "@/ermrest-client";
import {
  TAG,
  getTagInfo,
  getMissingTags,
  shortTagName,
  type ModelObjectType,
} from "@/annotation-registry";
import {
  useAnnotationDraft,
  type AnnotationChange,
} from "@/hooks/useAnnotationDraft";
import { getSchemaForTag, classifySchema } from "@/schemas";
import { SchemaFormEditor, FlagAnnotationEditor } from "@/components/erd/rjsf";
import { validateAnnotation } from "@/annotation-validator";

// Tag alias for custom editor override
const TAG_DISPLAY = TAG.display;

// Known context names
const CONTEXT_LABELS: Record<string, string> = {
  "*": "Default (*)",
  compact: "Compact",
  "compact/brief": "Compact/Brief",
  "compact/brief/inline": "Compact/Brief/Inline",
  "compact/select": "Compact/Select",
  detailed: "Detailed",
  entry: "Entry",
  "entry/create": "Entry/Create",
  "entry/edit": "Entry/Edit",
  export: "Export",
  filter: "Filter",
  row_name: "Row Name",
  "row_name/compact": "Row Name/Compact",
  "row_name/detailed": "Row Name/Detailed",
};

const SYSTEM_COLS = new Set(["RID", "RCT", "RMT", "RCB", "RMB"]);

function contextLabel(ctx: string): string {
  return CONTEXT_LABELS[ctx] || ctx;
}

function hasAnnotations(annotations: Record<string, any>): boolean {
  return Object.keys(annotations).length > 0;
}

// ── Target types for the selector ───────────────────────────────

type AnnotationTarget =
  | { kind: "table" }
  | { kind: "column"; name: string }
  | { kind: "key"; index: number }
  | { kind: "foreignkey"; index: number };

function targetKey(t: AnnotationTarget): string {
  switch (t.kind) {
    case "table": return "table";
    case "column": return `col:${t.name}`;
    case "key": return `key:${t.index}`;
    case "foreignkey": return `fk:${t.index}`;
  }
}

// ── Save/Undo bar component ──────────────────────────────────────

function SaveBar({
  isDirty,
  changeCount,
  saving,
  canUndo,
  onSave,
  onDiscard,
  onUndo,
}: {
  isDirty: boolean;
  changeCount: number;
  saving: boolean;
  canUndo: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onUndo: () => void;
}) {
  if (!isDirty && !canUndo) return null;

  return (
    <div className={`flex items-center gap-2 px-2 py-2 border-t border-slate-200 mt-auto flex-shrink-0 rounded-b ${isDirty ? "bg-amber-50/40" : "bg-slate-50/50"}`}>
      {isDirty && (
        <>
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving}
            className="h-7 text-xs gap-1.5 bg-brand hover:bg-brand/90"
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving…" : `Save ${changeCount} change${changeCount !== 1 ? "s" : ""}`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDiscard}
            disabled={saving}
            className="h-7 text-xs gap-1.5"
          >
            <RotateCcw className="h-3 w-3" />
            Discard
          </Button>
        </>
      )}
      {canUndo && !isDirty && (
        <Button
          variant="outline"
          size="sm"
          onClick={onUndo}
          disabled={saving}
          className="h-7 text-xs gap-1.5"
        >
          <Undo2 className="h-3 w-3" />
          Undo last save
        </Button>
      )}
      {isDirty && (
        <span className="text-[10px] text-amber-600 ml-auto">
          {changeCount} unsaved change{changeCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ── Catalog write helpers ────────────────────────────────────────
// These apply a list of AnnotationChanges to the catalog via ERMrest API.

type WriteFn = (tag: string, value: any) => Promise<void>;
type DeleteFn = (tag: string) => Promise<void>;

async function applyChangesToCatalog(
  changes: AnnotationChange[],
  writeFn: WriteFn,
  deleteFn: DeleteFn
): Promise<void> {
  for (const change of changes) {
    switch (change.type) {
      case "add":
      case "update":
        await writeFn(change.tag, change.value);
        break;
      case "delete":
        await deleteFn(change.tag);
        break;
    }
  }
}

/** Apply a full annotation snapshot to the catalog (for undo/restore) */
async function applySnapshotToCatalog(
  snapshot: Record<string, any>,
  currentAnnotations: Record<string, any>,
  writeFn: WriteFn,
  deleteFn: DeleteFn
): Promise<void> {
  // Delete tags that are in current but not in snapshot
  for (const tag of Object.keys(currentAnnotations)) {
    if (!(tag in snapshot)) {
      await deleteFn(tag);
    }
  }
  // Add/update tags from snapshot
  for (const [tag, value] of Object.entries(snapshot)) {
    await writeFn(tag, value);
  }
}

// ── Main export: Table-level annotations ─────────────────────────

interface AnnotationsPanelProps {
  table: EnrichedTable;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function AnnotationsPanel({ table, onDirtyChange }: AnnotationsPanelProps) {
  const [target, setTarget] = useState<AnnotationTarget>({ kind: "table" });
  const [remountKey, setRemountKey] = useState(0);

  // Resolve server annotations and object type from target
  const resolveTarget = () => {
    switch (target.kind) {
      case "table":
        return {
          annotations: table.info.annotations,
          objectType: "table" as ModelObjectType,
          targetLabel: "",
        };
      case "column": {
        const col = table.info.columns.find((c) => c.name === target.name);
        return {
          annotations: col?.annotations || {},
          objectType: "column" as ModelObjectType,
          targetLabel: target.name,
        };
      }
      case "key": {
        const k = table.info.keys[target.index];
        return {
          annotations: k?.annotations || {},
          objectType: "key" as ModelObjectType,
          targetLabel: k ? k.columns.join(", ") : "",
        };
      }
      case "foreignkey": {
        const fk = table.info.foreign_keys[target.index];
        return {
          annotations: fk?.annotations || {},
          objectType: "foreignkey" as ModelObjectType,
          targetLabel: fk ? `${fk.columns.join(", ")} → ${fk.referenced_table}` : "",
        };
      }
    }
  };

  const { annotations, objectType } = resolveTarget();

  // Build write/delete functions for the current target
  const makeWriteFn = (): WriteFn => {
    switch (target.kind) {
      case "table":
        return (tag, value) => putTableAnnotation(table.schema, table.name, tag, value);
      case "column":
        return (tag, value) => putColumnAnnotation(table.schema, table.name, target.name, tag, value);
      case "key": {
        const k = table.info.keys[target.index];
        return (tag, value) => putKeyAnnotation(table.schema, table.name, k.columns, tag, value);
      }
      case "foreignkey": {
        const fk = table.info.foreign_keys[target.index];
        const [refSchema, refTable] = fk.referenced_table.split(".");
        return (tag, value) =>
          putForeignKeyAnnotation(table.schema, table.name, fk.columns, refSchema, refTable, fk.referenced_columns, tag, value);
      }
    }
  };

  const makeDeleteFn = (): DeleteFn => {
    switch (target.kind) {
      case "table":
        return (tag) => deleteTableAnnotation(table.schema, table.name, tag);
      case "column":
        return (tag) => deleteColumnAnnotation(table.schema, table.name, target.name, tag);
      case "key": {
        const k = table.info.keys[target.index];
        return (tag) => deleteKeyAnnotation(table.schema, table.name, k.columns, tag);
      }
      case "foreignkey": {
        const fk = table.info.foreign_keys[target.index];
        const [refSchema, refTable] = fk.referenced_table.split(".");
        return (tag) =>
          deleteForeignKeyAnnotation(table.schema, table.name, fk.columns, refSchema, refTable, fk.referenced_columns, tag);
      }
    }
  };

  // Apply saved annotations back to the in-memory table object
  const syncToMemory = (newAnnotations: Record<string, any>) => {
    switch (target.kind) {
      case "table":
        // Replace in-place
        for (const key of Object.keys(table.info.annotations)) delete table.info.annotations[key];
        Object.assign(table.info.annotations, newAnnotations);
        break;
      case "column": {
        const col = table.info.columns.find((c) => c.name === target.name);
        if (col) {
          for (const key of Object.keys(col.annotations)) delete col.annotations[key];
          Object.assign(col.annotations, newAnnotations);
        }
        break;
      }
      case "key": {
        const k = table.info.keys[target.index];
        if (k) {
          for (const key of Object.keys(k.annotations)) delete k.annotations[key];
          Object.assign(k.annotations, newAnnotations);
        }
        break;
      }
      case "foreignkey": {
        const fk = table.info.foreign_keys[target.index];
        if (fk) {
          for (const key of Object.keys(fk.annotations)) delete fk.annotations[key];
          Object.assign(fk.annotations, newAnnotations);
        }
        break;
      }
    }
  };

  const userColumns = table.info.columns.filter((c) => !SYSTEM_COLS.has(c.name));

  return (
    <div className="flex flex-col h-full pt-2">
      {/* Target selector — grouped by object type */}
      <div className="px-0 mb-3 space-y-2">
        {/* Table */}
        <TargetGroup label="Table">
          <TargetButton
            active={target.kind === "table"}
            onClick={() => setTarget({ kind: "table" })}
            label={table.name}
            hasAnnotations={hasAnnotations(table.info.annotations)}
          />
        </TargetGroup>

        {/* Columns */}
        {userColumns.length > 0 && (
          <TargetGroup label="Columns">
            {userColumns.map((col) => (
              <TargetButton
                key={col.name}
                active={target.kind === "column" && target.name === col.name}
                onClick={() => setTarget({ kind: "column", name: col.name })}
                label={col.name}
                mono
                hasAnnotations={hasAnnotations(col.annotations)}
              />
            ))}
          </TargetGroup>
        )}

        {/* Keys */}
        {table.info.keys.length > 0 && (
          <TargetGroup label="Keys">
            {table.info.keys.map((k, i) => (
              <TargetButton
                key={`key-${i}`}
                active={target.kind === "key" && target.index === i}
                onClick={() => setTarget({ kind: "key", index: i })}
                label={`Key(${k.columns.join(",")})`}
                mono
                hasAnnotations={hasAnnotations(k.annotations)}
                color="amber"
              />
            ))}
          </TargetGroup>
        )}

        {/* Foreign Keys */}
        {table.info.foreign_keys.length > 0 && (
          <TargetGroup label="Foreign Keys">
            {table.info.foreign_keys.map((fk, i) => (
              <TargetButton
                key={`fk-${i}`}
                active={target.kind === "foreignkey" && target.index === i}
                onClick={() => setTarget({ kind: "foreignkey", index: i })}
                label={`FK(${fk.columns.join(",")})`}
                mono
                hasAnnotations={hasAnnotations(fk.annotations)}
                color="rose"
              />
            ))}
          </TargetGroup>
        )}
      </div>

      {/* Target info header */}
      {target.kind === "column" && (
        <TargetHeader
          label={target.name}
          sublabel={(() => {
            const col = table.info.columns.find((c) => c.name === target.name);
            return col ? `${col.type}${col.nullok ? ", nullable" : ""}` : "";
          })()}
        />
      )}
      {target.kind === "key" && (
        <TargetHeader
          label={`Key: ${table.info.keys[target.index]?.columns.join(", ")}`}
          sublabel={table.info.keys[target.index]?.constraint_name[1] || ""}
        />
      )}
      {target.kind === "foreignkey" && (
        <TargetHeader
          label={`FK: ${table.info.foreign_keys[target.index]?.columns.join(", ")}`}
          sublabel={`→ ${table.info.foreign_keys[target.index]?.referenced_table}`}
        />
      )}

      {/* Two-panel annotation browser with draft state */}
      <AnnotationBrowser
        key={`${targetKey(target)}-${remountKey}`}
        serverAnnotations={annotations}
        objectType={objectType}
        writeFn={makeWriteFn()}
        deleteFn={makeDeleteFn()}
        syncToMemory={syncToMemory}
        onUndoComplete={() => setRemountKey((k) => k + 1)}
        onDirtyChange={onDirtyChange}
      />
    </div>
  );
}

// ── Schema annotations panel ────────────────────────────────────

interface SchemaAnnotationsPanelProps {
  annotations: Record<string, any>;
  schemaName?: string;
  onDirtyChange?: (dirty: boolean) => void;
}

export function SchemaAnnotationsPanel({
  annotations,
  schemaName,
  onDirtyChange,
}: SchemaAnnotationsPanelProps) {
  const [remountKey, setRemountKey] = useState(0);
  const writeFn: WriteFn | undefined = schemaName
    ? (tag, value) => putSchemaAnnotation(schemaName, tag, value)
    : undefined;
  const deleteFn: DeleteFn | undefined = schemaName
    ? (tag) => deleteSchemaAnnotation(schemaName, tag)
    : undefined;

  const syncToMemory = (newAnnotations: Record<string, any>) => {
    for (const key of Object.keys(annotations)) delete annotations[key];
    Object.assign(annotations, newAnnotations);
  };

  return (
    <AnnotationBrowser
      key={`schema-${remountKey}`}
      serverAnnotations={annotations}
      objectType="schema"
      writeFn={writeFn}
      deleteFn={deleteFn}
      syncToMemory={syncToMemory}
      onUndoComplete={() => setRemountKey((k) => k + 1)}
      onDirtyChange={onDirtyChange}
    />
  );
}

// ── Catalog annotations panel ───────────────────────────────────

interface CatalogAnnotationsPanelProps {
  annotations: Record<string, any>;
  onDirtyChange?: (dirty: boolean) => void;
}

export function CatalogAnnotationsPanel({
  annotations,
  onDirtyChange,
}: CatalogAnnotationsPanelProps) {
  const [remountKey, setRemountKey] = useState(0);
  const writeFn: WriteFn = (tag, value) => putCatalogAnnotation(tag, value);
  const deleteFn: DeleteFn = (tag) => deleteCatalogAnnotation(tag);

  const syncToMemory = (newAnnotations: Record<string, any>) => {
    for (const key of Object.keys(annotations)) delete annotations[key];
    Object.assign(annotations, newAnnotations);
  };

  return (
    <AnnotationBrowser
      key={`catalog-${remountKey}`}
      serverAnnotations={annotations}
      objectType="catalog"
      writeFn={writeFn}
      deleteFn={deleteFn}
      syncToMemory={syncToMemory}
      onUndoComplete={() => setRemountKey((k) => k + 1)}
      onDirtyChange={onDirtyChange}
    />
  );
}

// ── Target selector button ──────────────────────────────────────

function TargetButton({
  active,
  onClick,
  label,
  mono,
  hasAnnotations: hasAnno,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  mono?: boolean;
  hasAnnotations?: boolean;
  color?: "amber" | "rose";
}) {
  const dotColor = color === "amber" ? "bg-amber-400" : color === "rose" ? "bg-rose-400" : "bg-blue-400";
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-[11px] transition-colors ${
        mono ? "font-mono" : "font-medium"
      } ${
        active
          ? "bg-brand text-white"
          : hasAnno
          ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
          : "bg-white text-slate-300 border border-slate-100 hover:bg-slate-50 hover:text-slate-500"
      }`}
    >
      {label}
      {hasAnno && !active && (
        <span className={`ml-1 inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
      )}
    </button>
  );
}

function TargetGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <div className="bg-slate-50 px-2 py-1 border-b border-slate-200">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <div className="px-2 py-1.5 flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function TargetHeader({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <div className="text-[11px] text-slate-500 mb-2">
      <span className="font-mono font-medium text-slate-700">{label}</span>
      {sublabel && (
        <span className="text-slate-400 ml-1">({sublabel})</span>
      )}
    </div>
  );
}

// ── Two-panel annotation browser (workbench style) with draft ────

function AnnotationBrowser({
  serverAnnotations,
  objectType,
  writeFn,
  deleteFn,
  syncToMemory,
  onUndoComplete,
  onDirtyChange,
}: {
  serverAnnotations: Record<string, any>;
  objectType: ModelObjectType;
  writeFn?: WriteFn;
  deleteFn?: DeleteFn;
  syncToMemory: (annotations: Record<string, any>) => void;
  onUndoComplete?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const draft = useAnnotationDraft(serverAnnotations);
  const presentTags = Object.keys(draft.annotations);
  const missing = getMissingTags(objectType, draft.annotations);
  const [selectedTag, setSelectedTag] = useState<string | null>(
    presentTags[0] || null
  );
  const [editSource, setEditSource] = useState(false);
  const [saving, setSaving] = useState(false);

  // Notify parent of dirty state changes
  useEffect(() => {
    onDirtyChange?.(draft.isDirty);
  }, [draft.isDirty, onDirtyChange]);

  const effectiveTag =
    selectedTag && selectedTag in draft.annotations
      ? selectedTag
      : presentTags[0] || null;

  // Add a tag locally (no server call)
  const handleAdd = (tag: string) => {
    draft.addTag(tag);
    setSelectedTag(tag);
  };

  // Delete a tag locally (no server call)
  const handleDelete = (tag: string) => {
    draft.deleteTag(tag);
    if (selectedTag === tag) setSelectedTag(null);
  };

  // Update tag value locally (no server call)
  const handleUpdateJson = (tag: string, value: any) => {
    draft.updateTag(tag, value);
  };

  // Save all changes to catalog
  const handleSave = async () => {
    if (!writeFn || !deleteFn) return;
    const changes = draft.getChanges();
    if (changes.length === 0) return;

    setSaving(true);
    try {
      await applyChangesToCatalog(changes, writeFn, deleteFn);
      // Update in-memory model
      syncToMemory(JSON.parse(JSON.stringify(draft.annotations)));
      draft.commitSave();
      toast.success(`Saved ${changes.length} change${changes.length !== 1 ? "s" : ""}`);
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  };

  // Discard local changes
  const handleDiscard = () => {
    draft.discard();
    // Reset selection if deleted tag was selected
    const serverTags = Object.keys(serverAnnotations);
    if (selectedTag && !serverTags.includes(selectedTag)) {
      setSelectedTag(serverTags[0] || null);
    }
  };

  // Undo last save — restore previous server state
  const handleUndo = async () => {
    if (!draft.undoSnapshot || !writeFn || !deleteFn) return;
    setSaving(true);
    try {
      const snapshot = draft.undoSnapshot;
      await applySnapshotToCatalog(snapshot, draft.annotations, writeFn, deleteFn);
      // Update in-memory model
      syncToMemory(JSON.parse(JSON.stringify(snapshot)));
      // Reset draft to snapshot
      draft.clearUndo();
      toast.success("Restored previous state");
      // Force re-mount so useAnnotationDraft re-initializes from the restored server state
      onUndoComplete?.();
    } catch (err) {
      toast.error(`Undo failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  };

  if (presentTags.length === 0 && missing.length === 0) {
    return (
      <div className="text-[11px] text-slate-400 py-4 text-center italic">
        No annotations available for this object type
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex gap-0 border border-slate-200 rounded-md overflow-hidden flex-1 min-h-0">
        {/* Left: tag list */}
        <div className="w-[140px] flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col min-h-0">
          <div className="px-2 py-1.5 text-xs font-semibold text-chaise-header-text uppercase tracking-wider border-b border-slate-200 bg-chaise-header/20">
            Annotations
          </div>
          <ScrollArea className="flex-1">
            <div className="py-0.5">
              {presentTags.map((tag) => {
                const info = getTagInfo(tag);
                const name = info?.name || shortTagName(tag);
                const validation = validateAnnotation(tag, draft.annotations[tag]);
                return (
                  <button
                    key={tag}
                    onClick={() => { setSelectedTag(tag); setEditSource(false); }}
                    className={`w-full text-left px-2 py-1.5 text-[11px] transition-colors border-l-2 ${
                      effectiveTag === tag
                        ? "bg-white border-l-brand text-slate-900 font-medium"
                        : "border-l-transparent text-slate-600 hover:bg-chaise-hover/50 hover:text-slate-800"
                    }`}
                    title={tag}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {validation.hasSchema && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            validation.valid ? "bg-emerald-500" : "bg-red-500"
                          }`}
                          title={validation.valid ? "Valid" : `${validation.errors.length} validation error(s)`}
                        />
                      )}
                      <span className="truncate">{name}</span>
                    </div>
                    {info?.contextualized && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        contextualized
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Available (missing) tags — clickable to add */}
              {missing.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-300 uppercase tracking-wider border-t border-slate-200 mt-1">
                    Available
                  </div>
                  {missing.map((info) => (
                    <button
                      key={info.tag}
                      onClick={() => writeFn ? handleAdd(info.tag) : undefined}
                      disabled={!writeFn}
                      className={`w-full text-left px-2 py-1.5 text-[11px] border-l-2 border-l-transparent transition-colors group ${
                        writeFn
                          ? "text-slate-400 hover:bg-chaise-hover/50 hover:text-slate-600 cursor-pointer"
                          : "text-slate-300 cursor-default"
                      }`}
                      title={`Add "${info.name}": ${info.description}`}
                    >
                      <div className="flex items-center gap-1">
                        {writeFn && (
                          <Plus className="h-3 w-3 text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
                        )}
                        <span className="truncate">{info.name}</span>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: editor area */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {effectiveTag ? (
            <TagEditor
              tag={effectiveTag}
              data={draft.annotations[effectiveTag]}
              editSource={editSource}
              onToggleSource={() => setEditSource((v) => !v)}
              onDelete={writeFn ? () => handleDelete(effectiveTag) : undefined}
              onUpdateJson={writeFn ? (value: any) => handleUpdateJson(effectiveTag, value) : undefined}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[11px] text-slate-400 px-4 text-center">
              {presentTags.length === 0
                ? writeFn
                  ? "No annotations set. Click an available annotation on the left to add it."
                  : "No annotations set."
                : "Select an annotation to view its configuration."}
            </div>
          )}
        </div>
      </div>

      {/* Save / Discard / Undo bar */}
      {writeFn && deleteFn && (
        <SaveBar
          isDirty={draft.isDirty}
          changeCount={draft.changeCount}
          saving={saving}
          canUndo={draft.canUndo}
          onSave={handleSave}
          onDiscard={handleDiscard}
          onUndo={handleUndo}
        />
      )}
    </div>
  );
}

// ── Tag editor router (mirrors workbench editor.py) ─────────────

function TagEditor({
  tag,
  data,
  editSource,
  onToggleSource,
  onDelete,
  onUpdateJson,
}: {
  tag: string;
  data: any;
  editSource: boolean;
  onToggleSource: () => void;
  onDelete?: () => void;
  onUpdateJson?: (value: any) => void;
}) {
  const info = getTagInfo(tag);

  const header = (
    <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-slate-800 truncate">
            {info?.name || shortTagName(tag)}
          </span>
          {info && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-xs leading-snug">
                  <p>{info.description}</p>
                  {info.contextualized && (
                    <p className="mt-1 text-primary-foreground/70">Supports per-context values (e.g., compact, detailed, entry).</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {/* Delete */}
        {onDelete && (
          <button
            onClick={onDelete}
            className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0"
            title="Delete annotation"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
        {tag}
      </div>

      {/* View mode tabs */}
      <div className="flex items-center gap-1 mt-2">
        <button
          onClick={() => { if (editSource) onToggleSource(); }}
          className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
            !editSource
              ? "bg-brand text-white"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
          }`}
        >
          Structured
        </button>
        <button
          onClick={() => { if (!editSource) onToggleSource(); }}
          className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
            editSource
              ? "bg-brand text-white"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
          }`}
        >
          JSON
        </button>
      </div>
    </div>
  );

  // Edit Source mode: editable JSON (updates draft locally)
  if (editSource) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {header}
        <div className="flex-1 min-h-0 px-3 py-2">
          <DraftJsonEditor data={data} onUpdate={onUpdateJson} />
        </div>
      </div>
    );
  }

  // Route to editor: custom override → schema-driven → JSON fallback
  let editor: React.ReactNode;

  // Custom override: DisplayEditor has hand-crafted UX that's better than auto-generated
  if (tag === TAG_DISPLAY) {
    editor = <DisplayEditor data={data} onUpdate={onUpdateJson} />;
  } else {
    // Schema-driven routing
    const schema = getSchemaForTag(tag);
    if (schema) {
      const category = classifySchema(tag, schema);
      switch (category) {
        case "placeholder":
          editor = <FlagAnnotationEditor info={info || undefined} />;
          break;
        case "open":
          // Open schemas (like chaise_config) fall back to JSON editor
          editor = onUpdateJson
            ? <DraftJsonEditor data={data} onUpdate={onUpdateJson} />
            : <ReadOnlyJsonViewer data={data} />;
          break;
        case "rich":
          editor = <SchemaFormEditor schema={schema} formData={data} onChange={onUpdateJson} />;
          break;
      }
    } else {
      // No schema available — JSON fallback
      editor = onUpdateJson
        ? <DraftJsonEditor data={data} onUpdate={onUpdateJson} />
        : <ReadOnlyJsonViewer data={data} />;
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {header}
      <ScrollArea className="flex-1">
        <div className="px-3 py-2">{editor}</div>
      </ScrollArea>
    </div>
  );
}

// ── Draft JSON editor (updates draft locally, no server calls) ───

function DraftJsonEditor({
  data,
  onUpdate,
}: {
  data: any;
  onUpdate?: (value: any) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(data, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  // Check if text has changed from current data
  const isModified = text !== JSON.stringify(data, null, 2);

  const handleApply = () => {
    if (!onUpdate) return;
    try {
      const parsed = JSON.parse(text);
      setError(null);
      onUpdate(parsed);
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError(`Invalid JSON: ${err.message}`);
      }
    }
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
          setApplied(false);
        }}
        className="flex-1 min-h-[120px] text-[11px] font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-400"
        spellCheck={false}
      />
      {error && (
        <div className="text-[10px] text-red-500 bg-red-50 rounded px-2 py-1">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-slate-400">
          {applied ? (
            <span className="text-green-600">Applied to draft</span>
          ) : isModified ? (
            <span className="text-amber-600">Modified — click Apply</span>
          ) : (
            "No changes"
          )}
        </div>
        {onUpdate && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleApply}
            disabled={!isModified}
            className="h-7 text-[11px]"
          >
            Apply
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Read-only JSON viewer (for tags without specialized editors) ─

function ReadOnlyJsonViewer({ data }: { data: any }) {
  return (
    <pre className="text-[10px] font-mono text-slate-600 whitespace-pre-wrap break-all bg-slate-50 rounded p-2 max-h-[400px] overflow-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ── Display annotation editor (interactive form) ────────────────

function DisplayEditor({ data, onUpdate }: { data: any; onUpdate?: (value: any) => void }) {
  // Deep clone data for local mutation, then push back via onUpdate
  const update = useCallback(
    (mutator: (d: any) => void) => {
      if (!onUpdate) return;
      const next = JSON.parse(JSON.stringify(data));
      mutator(next);
      onUpdate(next);
    },
    [data, onUpdate]
  );

  const editable = !!onUpdate;

  return (
    <div className="space-y-4">
      {/* ── Name ── */}
      <EditFormGroup title="Name" help="Control the display name shown in the Chaise UI.">
        <EditFormRow label="Display Name" help="Plain text display name (overrides the model element name).">
          {editable ? (
            <Input
              value={data.name || ""}
              onChange={(e) => update((d) => {
                if (e.target.value) { d.name = e.target.value; delete d.markdown_name; }
                else delete d.name;
              })}
              placeholder="Enter a display name"
              className="h-7 text-xs"
            />
          ) : (
            <span className="text-[11px] text-slate-600">{data.name || <EmptyField />}</span>
          )}
        </EditFormRow>
        <EditFormRow label="Markdown Name" help="Display name using markdown syntax (mutually exclusive with plain name).">
          {editable ? (
            <Input
              value={data.markdown_name || ""}
              onChange={(e) => update((d) => {
                if (e.target.value) { d.markdown_name = e.target.value; delete d.name; }
                else delete d.markdown_name;
              })}
              placeholder="Enter a markdown display name"
              className="h-7 text-xs font-mono"
            />
          ) : (
            <span className="text-[11px] text-slate-600 font-mono">{data.markdown_name || <EmptyField />}</span>
          )}
        </EditFormRow>
      </EditFormGroup>

      {/* ── Name Style ── */}
      <EditFormGroup title="Name Style" help="Automatic formatting applied to the model element name.">
        <EditSwitchRow
          label="Underline → Space"
          help="Convert underscore characters (_) into spaces."
          checked={!!data.name_style?.underline_space}
          onCheckedChange={editable ? (v) => update((d) => {
            d.name_style = { ...d.name_style || {}, underline_space: v };
          }) : undefined}
        />
        <EditSwitchRow
          label="Title Case"
          help="Capitalize the first character of each word."
          checked={!!data.name_style?.title_case}
          onCheckedChange={editable ? (v) => update((d) => {
            d.name_style = { ...d.name_style || {}, title_case: v };
          }) : undefined}
        />
        <EditSwitchRow
          label="Markdown"
          help="Interpret the element's actual name as a markdown string."
          checked={!!data.name_style?.markdown}
          onCheckedChange={editable ? (v) => update((d) => {
            d.name_style = { ...d.name_style || {}, markdown: v };
          }) : undefined}
        />
      </EditFormGroup>

      {/* ── Comment (contextualized) ── */}
      <EditFormGroup title="Comment" help="Tooltip text shown for this element. Can differ by UI context.">
        <ContextualizedEditor
          property="comment"
          data={data}
          editable={editable}
          defaultValue={false}
          onUpdate={update}
          renderContext={(_ctx, value, onChange) => (
            <CommentContextEditor ctx={_ctx} value={value} onChange={onChange} editable={editable} />
          )}
        />
      </EditFormGroup>

      {/* ── Comment Display (contextualized) ── */}
      <EditFormGroup title="Comment Display" help="How comments are rendered: inline text or hover tooltip.">
        <ContextualizedEditor
          property="comment_display"
          data={data}
          editable={editable}
          defaultValue={{}}
          onUpdate={update}
          renderContext={(_ctx, value, onChange) => (
            <CommentDisplayContextEditor value={value} onChange={onChange} editable={editable} />
          )}
        />
      </EditFormGroup>

      {/* ── Show Null (contextualized) ── */}
      <EditFormGroup title="Show Null" help="How NULL values are displayed. Can show, hide, or use a custom indicator.">
        <ContextualizedEditor
          property="show_null"
          data={data}
          editable={editable}
          defaultValue={true}
          onUpdate={update}
          renderContext={(_ctx, value, onChange) => (
            <ShowNullContextEditor value={value} onChange={onChange} editable={editable} />
          )}
        />
      </EditFormGroup>

      {/* ── Show FK Link (contextualized) ── */}
      <EditFormGroup title="Show FK Link" help="Whether foreign key values render as clickable links to the referenced row.">
        <ContextualizedEditor
          property="show_foreign_key_link"
          data={data}
          editable={editable}
          defaultValue={true}
          onUpdate={update}
          renderContext={(_ctx, value, onChange) => (
            <ShowFkLinkContextEditor value={value} onChange={onChange} editable={editable} />
          )}
        />
      </EditFormGroup>
    </div>
  );
}

// ── Reusable form components for guided editing ─────────────────

function EditFormGroup({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-100 rounded-md overflow-hidden">
      <div className="bg-chaise-header/40 px-3 py-1.5 flex items-center gap-1.5 border-b border-chaise-header/50">
        <span className="text-xs font-semibold text-chaise-header-text uppercase tracking-wider">{title}</span>
        {help && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-slate-400 hover:text-slate-600 transition-colors">
                  <HelpCircle className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[220px] text-xs">{help}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="px-3 py-2 space-y-2">{children}</div>
    </div>
  );
}

function EditFormRow({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-[7rem] flex-shrink-0 pt-1">
        <div className="flex items-center gap-1">
          <Label className="text-[11px] text-slate-500 font-normal">{label}</Label>
          {help && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-slate-300 hover:text-slate-500 transition-colors">
                    <HelpCircle className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px] text-xs">{help}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function EditSwitchRow({
  label,
  help,
  checked,
  onCheckedChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onCheckedChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-[11px] text-slate-600 font-normal cursor-pointer">{label}</Label>
        {help && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-slate-300 hover:text-slate-500 transition-colors">
                  <HelpCircle className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px] text-xs">{help}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={!onCheckedChange}
        className="scale-75"
      />
    </div>
  );
}

// ── Contextualized property editor ──────────────────────────────
// Manages per-context tabs with add/remove, mirrors the Qt EasyTabbedContextsWidget

function ContextualizedEditor({
  property,
  data,
  editable,
  defaultValue,
  onUpdate,
  renderContext,
}: {
  property: string;
  data: any;
  editable: boolean;
  defaultValue: any;
  onUpdate: (mutator: (d: any) => void) => void;
  renderContext: (ctx: string, value: any, onChange: (value: any) => void) => React.ReactNode;
}) {
  const propData = data[property];
  const [newCtx, setNewCtx] = useState("");

  // Handle legacy string values
  if (typeof propData === "string") {
    return (
      <div className="text-[11px] text-slate-600">
        <span className="text-slate-400 italic">Legacy string value: </span>
        {propData}
        {editable && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] ml-2"
            onClick={() => onUpdate((d) => { d[property] = { "*": propData }; })}
          >
            Convert to contextualized
          </Button>
        )}
      </div>
    );
  }

  if (typeof propData === "boolean" || typeof propData === "number") {
    return (
      <div className="text-[11px] text-slate-600">
        <span className="text-slate-400 italic">Simple value: </span>
        {String(propData)}
        {editable && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] ml-2"
            onClick={() => onUpdate((d) => { d[property] = { "*": propData }; })}
          >
            Convert to contextualized
          </Button>
        )}
      </div>
    );
  }

  if (!propData || typeof propData !== "object") {
    // Property not set — offer to add it
    if (!editable) return <EmptyField />;
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[10px] gap-1"
        onClick={() => onUpdate((d) => { d[property] = { "*": defaultValue }; })}
      >
        <Plus className="h-3 w-3" />
        Add {property}
      </Button>
    );
  }

  const contexts = Object.keys(propData);
  const availableContexts = Object.keys(CONTEXT_LABELS).filter((c) => !contexts.includes(c));

  return (
    <div>
      <ContextTabs contexts={contexts}>
        {(ctx) => {
          const value = propData[ctx];
          const onChange = (newValue: any) => {
            onUpdate((d) => {
              if (!d[property]) d[property] = {};
              d[property][ctx] = newValue;
            });
          };
          return (
            <div>
              {renderContext(ctx, value, onChange)}
              {editable && (
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => onUpdate((d) => {
                      if (d[property]) {
                        delete d[property][ctx];
                        if (Object.keys(d[property]).length === 0) delete d[property];
                      }
                    })}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Remove {contextLabel(ctx)}
                  </Button>
                </div>
              )}
            </div>
          );
        }}
      </ContextTabs>
      {editable && availableContexts.length > 0 && (
        <div className="flex items-center gap-1 mt-2">
          <Select value={newCtx} onValueChange={setNewCtx}>
            <SelectTrigger className="h-7 text-[10px] flex-1">
              <SelectValue placeholder="Add context..." />
            </SelectTrigger>
            <SelectContent>
              {availableContexts.map((c) => (
                <SelectItem key={c} value={c} className="text-[11px]">
                  {contextLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            disabled={!newCtx}
            onClick={() => {
              if (!newCtx) return;
              onUpdate((d) => {
                if (!d[property]) d[property] = {};
                d[property][newCtx] = JSON.parse(JSON.stringify(defaultValue));
              });
              setNewCtx("");
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Comment context editor ──────────────────────────────────────

function CommentContextEditor({
  ctx,
  value,
  onChange,
  editable,
}: {
  ctx: string;
  value: any;
  onChange: (v: any) => void;
  editable: boolean;
}) {
  const isDisabled = value === false;
  const text = typeof value === "string" ? value : "";

  if (!editable) {
    if (value === false) return <span className="text-[11px] text-slate-400 italic">Comments hidden</span>;
    return <span className="text-[11px] text-slate-600">{text || <EmptyField />}</span>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={`comment-${ctx}`}
            checked={!isDisabled}
            onChange={() => onChange("")}
            className="accent-[hsl(var(--brand))]"
          />
          <span className="text-[11px] text-slate-600">Show comment</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={`comment-${ctx}`}
            checked={isDisabled}
            onChange={() => onChange(false)}
            className="accent-[hsl(var(--brand))]"
          />
          <span className="text-[11px] text-slate-600">Hide comment</span>
        </label>
      </div>
      {!isDisabled && (
        <Input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter comment text"
          className="h-7 text-xs"
        />
      )}
    </div>
  );
}

// ── Comment Display context editor ──────────────────────────────

function CommentDisplayContextEditor({
  value,
  onChange,
  editable,
}: {
  value: any;
  onChange: (v: any) => void;
  editable: boolean;
}) {
  const obj = typeof value === "object" && value ? value : {};

  if (!editable) {
    return (
      <div className="space-y-1">
        {obj.table_comment_display && <FormRow label="Table" value={obj.table_comment_display} />}
        {obj.column_comment_display && <FormRow label="Column" value={obj.column_comment_display} />}
        {!obj.table_comment_display && !obj.column_comment_display && <EmptyField />}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <EditFormRow label="Table Comment">
        <Select
          value={obj.table_comment_display || ""}
          onValueChange={(v) => onChange({ ...obj, table_comment_display: v || undefined })}
        >
          <SelectTrigger className="h-7 text-[10px]">
            <SelectValue placeholder="Select display mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inline" className="text-[11px]">Inline</SelectItem>
            <SelectItem value="tooltip" className="text-[11px]">Tooltip</SelectItem>
          </SelectContent>
        </Select>
      </EditFormRow>
      <EditFormRow label="Column Comment">
        <Select
          value={obj.column_comment_display || ""}
          onValueChange={(v) => onChange({ ...obj, column_comment_display: v || undefined })}
        >
          <SelectTrigger className="h-7 text-[10px]">
            <SelectValue placeholder="Select display mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inline" className="text-[11px]">Inline</SelectItem>
            <SelectItem value="tooltip" className="text-[11px]">Tooltip</SelectItem>
          </SelectContent>
        </Select>
      </EditFormRow>
    </div>
  );
}

// ── Show Null context editor ────────────────────────────────────

function ShowNullContextEditor({
  value,
  onChange,
  editable,
}: {
  value: any;
  onChange: (v: any) => void;
  editable: boolean;
}) {
  const isTrue = value === true;
  const isFalse = value === false;
  const isCustom = !isTrue && !isFalse;
  const customText = typeof value === "string" ? value : "";

  if (!editable) {
    if (isTrue) return <span className="text-[11px] text-slate-600">Show NULL values</span>;
    if (isFalse) return <span className="text-[11px] text-slate-600">Hide NULL values</span>;
    return <span className="text-[11px] text-slate-600">Custom indicator: "{customText}"</span>;
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="shownull" checked={isTrue} onChange={() => onChange(true)} className="accent-[hsl(var(--brand))]" />
          <span className="text-[11px] text-slate-600">Show NULL values</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="shownull" checked={isFalse} onChange={() => onChange(false)} className="accent-[hsl(var(--brand))]" />
          <span className="text-[11px] text-slate-600">Hide NULL values</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="shownull" checked={isCustom} onChange={() => onChange("")} className="accent-[hsl(var(--brand))]" />
          <span className="text-[11px] text-slate-600">Custom indicator</span>
        </label>
      </div>
      {isCustom && (
        <Input
          value={customText}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter text to display for NULL values"
          className="h-7 text-xs"
        />
      )}
    </div>
  );
}

// ── Show FK Link context editor ─────────────────────────────────

function ShowFkLinkContextEditor({
  value,
  onChange,
  editable,
}: {
  value: any;
  onChange: (v: any) => void;
  editable: boolean;
}) {
  if (!editable) {
    return <span className="text-[11px] text-slate-600">{value ? "Show with link" : "Without link"}</span>;
  }

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input type="radio" name="fklink" checked={value === true} onChange={() => onChange(true)} className="accent-[hsl(var(--brand))]" />
        <span className="text-[11px] text-slate-600">Show FK values with a link to the referenced row</span>
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input type="radio" name="fklink" checked={value === false} onChange={() => onChange(false)} className="accent-[hsl(var(--brand))]" />
        <span className="text-[11px] text-slate-600">Show FK values without links</span>
      </label>
    </div>
  );
}

// ── Removed: VisibleColumnsEditor, VisibleForeignKeysEditor, TableDisplayEditor,
// ── ColumnDisplayEditor, AssetEditor, CitationEditor, SourceDefinitionsEditor,
// ── ForeignKeyEditor, KeyDisplayEditor — replaced by schema-driven SchemaFormEditor

// ── Shared form components ──────────────────────────────────────

/** Read-only label/value row used in DisplayEditor sub-editors. */
function FormRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="text-[11px] text-slate-500 w-[7rem] flex-shrink-0">{label}</span>
      <span className="text-[11px] text-slate-700 break-all">{value}</span>
    </div>
  );
}

function EmptyField() {
  return <span className="text-[11px] text-slate-400 italic underline decoration-dashed decoration-slate-300 underline-offset-2">Not set</span>;
}

// ── Context tabs ────────────────────────────────────────────────

/** Help text for Chaise UI contexts */
const CONTEXT_HELP: Record<string, string> = {
  "*": "Default fallback context — used when no more specific context matches.",
  compact: "Compact view — rows shown in a table or list (e.g., related entity tables).",
  "compact/brief": "Brief compact — minimal columns for inline display (e.g., FK dropdowns).",
  "compact/brief/inline": "Inline brief — used inside markdown templates for inline FK references.",
  "compact/select": "Selection context — columns shown in FK selection popups.",
  detailed: "Detailed view — the full record page showing all information.",
  entry: "Data entry — columns shown in both create and edit forms.",
  "entry/create": "Create form — columns shown only when creating a new record.",
  "entry/edit": "Edit form — columns shown only when editing an existing record.",
  export: "Export context — columns included in data exports (CSV, BDBag).",
  filter: "Facet sidebar — facets available for filtering the recordset.",
  row_name: "Row name — how a record appears when referenced by other tables.",
  "row_name/compact": "Compact row name — abbreviated name for compact views.",
  "row_name/detailed": "Detailed row name — full name for the record page title.",
};

function ContextTabs({ contexts, children }: { contexts: string[]; children: (ctx: string) => React.ReactNode }) {
  const [active, setActive] = useState(contexts[0] || "*");
  if (contexts.length === 0) return null;

  return (
    <div>
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-wrap gap-1 mb-2">
          {contexts.map((ctx) => {
            const help = CONTEXT_HELP[ctx];
            const btn = (
              <button
                key={ctx}
                onClick={() => setActive(ctx)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all duration-150 ${active === ctx ? "bg-brand text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                {contextLabel(ctx)}
              </button>
            );

            if (help) {
              return (
                <Tooltip key={ctx}>
                  <TooltipTrigger asChild>{btn}</TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px] text-xs leading-snug">
                    {help}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return btn;
          })}
        </div>
      </TooltipProvider>
      {children(active)}
    </div>
  );
}
