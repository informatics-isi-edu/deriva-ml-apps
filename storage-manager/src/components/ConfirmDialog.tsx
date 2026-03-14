import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { humanSize } from "@/lib/format";
import type { StorageEntry } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: StorageEntry[];
  totalSize: number;
  onConfirm: () => void;
  loading: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  entries,
  totalSize,
  onConfirm,
  loading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-destructive/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </DialogTitle>
          <DialogDescription>
            This will permanently delete{" "}
            <span className="font-mono font-bold text-destructive">
              {humanSize(totalSize)}
            </span>{" "}
            of cached data. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-48 overflow-y-auto rounded border border-border bg-muted/30 p-2 space-y-1">
          {entries.map((entry) => (
            <div
              key={entry.path}
              className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-muted-foreground shrink-0">
                  {entry.location}
                </span>
                <span className="font-mono font-medium text-foreground truncate">
                  {entry.label}
                </span>
              </div>
              <span className="font-mono text-muted-foreground shrink-0 ml-3">
                {entry.size}
              </span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              <>Delete {humanSize(totalSize)}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
