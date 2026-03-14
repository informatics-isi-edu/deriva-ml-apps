import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StorageEntry, SortField, SortDirection } from "@/types";

const SIZE_WARN_BYTES = 100 * 1024 * 1024; // 100 MB
const SIZE_DANGER_BYTES = 1024 ** 3; // 1 GB

interface Props {
  entries: StorageEntry[];
  selected: Set<string>;
  onToggleSelect: (path: string) => void;
  sortField: SortField;
  sortDir: SortDirection;
  onSort: (field: SortField) => void;
}

function SortIcon({
  field,
  activeField,
  dir,
}: {
  field: SortField;
  activeField: SortField;
  dir: SortDirection;
}) {
  if (field !== activeField) {
    return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />;
  }
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3 text-amber" />
  ) : (
    <ArrowDown className="h-3 w-3 text-amber" />
  );
}

function CategoryBadge({ category }: { category: string }) {
  const cls =
    category === "dataset"
      ? "badge-dataset"
      : category === "execution"
        ? "badge-execution"
        : "badge-other";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${cls}`}
    >
      {category}
    </span>
  );
}

function formatModified(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function ariaSort(
  field: SortField,
  activeField: SortField,
  dir: SortDirection,
): "ascending" | "descending" | "none" {
  if (field !== activeField) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

export function StorageTable({
  entries,
  selected,
  onToggleSelect,
  sortField,
  sortDir,
  onSort,
}: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b-border hover:bg-transparent">
          <TableHead className="w-10 px-4">
            <span className="sr-only">Select</span>
          </TableHead>
          <TableHead aria-sort={ariaSort("location", sortField, sortDir)}>
            <button
              onClick={() => onSort("location")}
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Location
              <SortIcon field="location" activeField={sortField} dir={sortDir} />
            </button>
          </TableHead>
          <TableHead aria-sort={ariaSort("label", sortField, sortDir)}>
            <button
              onClick={() => onSort("label")}
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              RID
              <SortIcon field="label" activeField={sortField} dir={sortDir} />
            </button>
          </TableHead>
          <TableHead aria-sort={ariaSort("category", sortField, sortDir)}>
            <button
              onClick={() => onSort("category")}
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Type
              <SortIcon field="category" activeField={sortField} dir={sortDir} />
            </button>
          </TableHead>
          <TableHead className="text-right" aria-sort={ariaSort("size", sortField, sortDir)}>
            <button
              onClick={() => onSort("size")}
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              Size
              <SortIcon field="size" activeField={sortField} dir={sortDir} />
            </button>
          </TableHead>
          <TableHead className="text-right" aria-sort={ariaSort("items", sortField, sortDir)}>
            <button
              onClick={() => onSort("items")}
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              Items
              <SortIcon field="items" activeField={sortField} dir={sortDir} />
            </button>
          </TableHead>
          <TableHead aria-sort={ariaSort("modified", sortField, sortDir)}>
            <button
              onClick={() => onSort("modified")}
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Modified
              <SortIcon field="modified" activeField={sortField} dir={sortDir} />
            </button>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const isSelected = selected.has(entry.path);
          return (
            <TableRow
              key={entry.path}
              className={`storage-row cursor-pointer transition-colors ${
                isSelected
                  ? "bg-amber/5 hover:bg-amber/8 border-l-2 border-l-amber"
                  : "hover:bg-muted/50 border-l-2 border-l-transparent"
              }`}
              onClick={() => onToggleSelect(entry.path)}
            >
              <TableCell className="px-4">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelect(entry.path)}
                  onClick={(e) => e.stopPropagation()}
                  className="data-[state=checked]:bg-amber data-[state=checked]:border-amber"
                />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {entry.location || "\u2014"}
              </TableCell>
              <TableCell className="font-mono text-xs font-medium text-foreground">
                {entry.label}
              </TableCell>
              <TableCell>
                <CategoryBadge category={entry.category} />
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                <span
                  className={
                    entry.size_bytes > SIZE_DANGER_BYTES
                      ? "text-destructive font-bold"
                      : entry.size_bytes > SIZE_WARN_BYTES
                        ? "text-amber font-medium"
                        : "text-muted-foreground"
                  }
                >
                  {entry.size}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                {entry.item_count.toLocaleString()}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatModified(entry.modified)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
