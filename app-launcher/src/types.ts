export interface AppEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  requires_catalog: boolean;
  dist_path: string;
  built?: boolean;
}

export interface CatalogEntry {
  id: string;
  name: string | null;
  description: string | null;
  is_persistent?: boolean;
}

export interface AliasEntry {
  id: string;
  name: string | null;
  description: string | null;
  alias_target: string;
}

export type RegistryResponse =
  | { status: "success"; hostname: string; catalogs: CatalogEntry[]; aliases: AliasEntry[] }
  | { status: "error"; error: string };

export type AppsResponse =
  | { status: "success"; apps: AppEntry[] }
  | { status: "error"; error: string };

export interface ServerConnection {
  hostname: string;
  catalogs: CatalogEntry[];
  aliases: AliasEntry[];
}

export type LaunchResponse =
  | { status: "success"; app_id: string; url: string; port: number; app_name: string }
  | { status: "error"; error: string };
