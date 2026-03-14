import type { StorageListResponse, DeleteResponse } from "./types.ts";

const API_BASE = "/api/storage";

export async function fetchStorageEntries(filter = "all"): Promise<StorageListResponse> {
  const res = await fetch(`${API_BASE}?filter=${encodeURIComponent(filter)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch storage entries: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function deleteStorageEntries(
  rids: string[],
  confirm: boolean,
): Promise<DeleteResponse> {
  const res = await fetch(`${API_BASE}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rids, confirm }),
  });
  if (!res.ok) {
    throw new Error(`Failed to delete storage entries: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
