import type { StorageListResponse, DeleteResponse } from "./types.ts";

const API_BASE = "/api/storage";

function validateStatus(data: unknown): asserts data is { status: string } {
  if (
    typeof data !== "object" ||
    data === null ||
    !("status" in data) ||
    typeof (data as Record<string, unknown>).status !== "string"
  ) {
    throw new Error("Invalid API response: missing or non-string 'status' field");
  }
}

export async function fetchStorageEntries(
  filter = "all",
  signal?: AbortSignal,
): Promise<StorageListResponse> {
  const res = await fetch(`${API_BASE}?filter=${encodeURIComponent(filter)}`, {
    signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch storage entries: ${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  validateStatus(data);
  return data as StorageListResponse;
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
  const data: unknown = await res.json();
  validateStatus(data);
  return data as DeleteResponse;
}
