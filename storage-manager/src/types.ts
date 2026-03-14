export interface StorageEntry {
  rid: string | null;
  label: string;
  location: string;
  category: "dataset" | "execution" | "other";
  size_bytes: number;
  size: string;
  item_count: number;
  modified: string | null;
  path: string;
}

export type StorageListResponse =
  | {
      status: "success";
      entries: StorageEntry[];
      total_entries: number;
      total_size_bytes: number;
      total_size: string;
      filter: string;
    }
  | { status: "error"; error: string };

export type DeleteResponse =
  | {
      status: "success";
      deleted: StorageEntry[];
      entries_deleted: number;
      bytes_freed: number;
      size_freed: string;
      errors: Array<{ path: string; error: string }>;
    }
  | {
      status: "dry_run";
      message: string;
      entries: StorageEntry[];
      total_bytes: number;
      total_size: string;
    }
  | { status: "error"; error: string };

export type SortField = "label" | "location" | "category" | "size" | "items" | "modified";
export type SortDirection = "asc" | "desc";
export type CategoryFilter = "all" | "dataset" | "execution" | "other";
