import type { RegistryResponse, AppsResponse, LaunchResponse } from "./types";

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

export async function launchApp(
  appId: string,
  hostname?: string,
  catalogId?: string,
): Promise<LaunchResponse> {
  const body: Record<string, string> = { app_id: appId };
  if (hostname) body.hostname = hostname;
  if (catalogId) body.catalog_id = catalogId;

  const res = await fetch("/api/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<LaunchResponse>;
}
