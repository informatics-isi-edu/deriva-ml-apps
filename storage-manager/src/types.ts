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

export interface StorageListResponse {
  status: "success" | "error";
  filter: string;
  entries: StorageEntry[];
  total_entries: number;
  total_size_bytes: number;
  total_size: string;
  error?: string;
}

export interface DeleteResponse {
  status: "success" | "dry_run" | "error";
  message?: string;
  entries?: StorageEntry[];
  deleted?: StorageEntry[];
  entries_deleted?: number;
  bytes_freed?: number;
  size_freed?: string;
  total_bytes?: number;
  total_size?: string;
  errors?: Array<{ path: string; error: string }>;
  error?: string;
}

export type SortField = "label" | "location" | "category" | "size" | "items" | "modified";
export type SortDirection = "asc" | "desc";
export type CategoryFilter = "all" | "dataset" | "execution" | "other";
