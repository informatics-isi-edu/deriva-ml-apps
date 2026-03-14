import type { RegistryResponse, AppsResponse } from "./types";

export async function fetchRegistry(
  hostname: string,
  signal?: AbortSignal,
): Promise<RegistryResponse> {
  const res = await fetch(
    `/api/registry?hostname=${encodeURIComponent(hostname)}`,
    { signal },
  );
  return res.json() as Promise<RegistryResponse>;
}

export async function fetchApps(
  signal?: AbortSignal,
): Promise<AppsResponse> {
  const res = await fetch("/api/apps", { signal });
  return res.json() as Promise<AppsResponse>;
}
