import { useCallback, useEffect, useMemo, useState } from "react";
import { HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StorageTable } from "@/components/StorageTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { fetchStorageEntries, deleteStorageEntries } from "@/api";
import { humanSize } from "@/lib/format";
import type {
  StorageEntry,
  CategoryFilter,
  SortField,
  SortDirection,
} from "@/types";

export default function App() {
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortField, setSortField] = useState<SortField>("size");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadEntries = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStorageEntries("all", signal);
      if (data.status === "error") {
        setError(data.error ?? "Unknown error");
        return;
      }
      setEntries(data.entries);
      setSelected(new Set());
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadEntries(controller.signal);
    return () => controller.abort();
  }, [loadEntries]);

  // Clear selection when category filter changes to prevent cross-tab deletion
  useEffect(() => {
    setSelected(new Set());
  }, [categoryFilter]);

  // Filter + sort
  const visibleEntries = useMemo(() => {
    let filtered = entries;
    if (categoryFilter !== "all") {
      filtered = entries.filter((e) => e.category === categoryFilter);
    }

    const sorted = [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "label":
          return dir * (a.label ?? "").localeCompare(b.label ?? "");
        case "location":
          return dir * a.location.localeCompare(b.location);
        case "category":
          return dir * a.category.localeCompare(b.category);
        case "size":
          return dir * (a.size_bytes - b.size_bytes);
        case "items":
          return dir * (a.item_count - b.item_count);
        case "modified": {
          const am = a.modified ?? "";
          const bm = b.modified ?? "";
          return dir * am.localeCompare(bm);
        }
        default:
          return 0;
      }
    });
    return sorted;
  }, [entries, categoryFilter, sortField, sortDir]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir(field === "size" ? "desc" : "asc");
      }
    },
    [sortField],
  );

  const toggleSelect = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(visibleEntries.map((e) => e.path)));
  }, [visibleEntries]);

  const selectNone = useCallback(() => {
    setSelected(new Set());
  }, []);

  const selectedEntries = useMemo(
    () => entries.filter((e) => selected.has(e.path)),
    [entries, selected],
  );

  const selectedSize = useMemo(
    () => selectedEntries.reduce((sum, e) => sum + e.size_bytes, 0),
    [selectedEntries],
  );

  const totalSize = useMemo(
    () => entries.reduce((sum, e) => sum + e.size_bytes, 0),
    [entries],
  );

  const categoryCounts = useMemo(() => {
    const counts = { all: 0, dataset: 0, execution: 0, other: 0 };
    for (const e of entries) {
      counts.all++;
      counts[e.category]++;
    }
    return counts;
  }, [entries]);

  const handleDelete = useCallback(async () => {
    const rids = selectedEntries
      .map((e) => e.rid)
      .filter((r): r is string => r !== null);

    if (rids.length === 0) return;

    setDeleting(true);
    try {
      const result = await deleteStorageEntries(rids, true);
      if (result.status === "success") {
        const { deleted, size_freed, errors } = result;
        // Remove deleted entries from state
        const deletedPaths = new Set(deleted.map((e) => e.path));
        setEntries((prev) => prev.filter((e) => !deletedPaths.has(e.path)));
        setSelected(new Set());

        toast.success(`Deleted ${deleted.length} entries, freed ${size_freed}`);

        if (errors.length > 0) {
          toast.warning(
            `${errors.length} entries failed to delete: ${errors.map((e) => e.error).join(", ")}`,
          );
        }
      } else if (result.status === "error") {
        toast.error("Failed to delete entries: " + result.error);
      }
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : "Unknown error";
      toast.error("Failed to delete entries: " + errorMessage);
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  }, [selectedEntries]);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-amber/10 border border-amber/20">
              <HardDrive className="h-5 w-5 text-amber" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold tracking-tight text-foreground">
                Storage Manager
              </h1>
              <p className="text-xs text-muted-foreground font-mono">
                ~/.deriva-ml
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Summary stats */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                <span className="font-mono text-foreground">
                  {entries.length}
                </span>{" "}
                entries
              </span>
              <span>
                <span className="font-mono text-foreground">
                  {humanSize(totalSize)}
                </span>{" "}
                total
              </span>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadEntries()}
              disabled={loading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Filter bar + selection actions */}
      <div className="flex-shrink-0 border-b border-border bg-card/50 px-6 py-2.5 flex items-center justify-between">
        <Tabs
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
        >
          <TabsList className="h-8 bg-muted/50">
            <TabsTrigger value="all" className="text-xs px-3 h-6">
              All ({categoryCounts.all})
            </TabsTrigger>
            <TabsTrigger value="dataset" className="text-xs px-3 h-6">
              Datasets ({categoryCounts.dataset})
            </TabsTrigger>
            <TabsTrigger value="execution" className="text-xs px-3 h-6">
              Executions ({categoryCounts.execution})
            </TabsTrigger>
            <TabsTrigger value="other" className="text-xs px-3 h-6">
              Other ({categoryCounts.other})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <div className="flex items-center gap-3 animate-fade-in">
              <span className="text-xs text-muted-foreground">
                <span className="font-mono text-amber font-bold">
                  {selected.size}
                </span>{" "}
                selected
                <span className="mx-1.5 text-border">|</span>
                <span className="font-mono text-destructive font-bold">
                  {humanSize(selectedSize)}
                </span>{" "}
                to free
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={selectNone}
                className="text-xs h-7 px-2"
              >
                Clear
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowConfirm(true)}
                className="gap-1.5 text-xs h-7"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            </div>
          )}
          {selected.size === 0 && visibleEntries.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAll}
              className="text-xs h-7 px-2 text-muted-foreground"
            >
              Select all
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="inline-block p-3 rounded-full bg-muted/50 mb-3">
                <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">
                Scanning directories...
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <p className="text-sm font-medium text-destructive mb-2">
                Failed to load storage entries
              </p>
              <p className="text-xs text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" size="sm" onClick={() => loadEntries()}>
                Retry
              </Button>
            </div>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <HardDrive className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {entries.length === 0
                  ? "No storage entries found"
                  : "No entries match this filter"}
              </p>
            </div>
          </div>
        ) : (
          <StorageTable
            entries={visibleEntries}
            selected={selected}
            onToggleSelect={toggleSelect}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}
      </div>

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        entries={selectedEntries}
        totalSize={selectedSize}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
