import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Database,
  HardDrive,
  Rocket,
  Layout,
  Lock,
  ExternalLink,
  ChevronDown,
  Server,
  Tag,
  Check,
  AlertCircle,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { fetchApps, fetchRegistry, launchApp } from "@/api";
import type { AppEntry, ServerConnection } from "@/types";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  database: Database,
  "hard-drive": HardDrive,
  rocket: Rocket,
  layout: Layout,
};

const KNOWN_SERVERS = [
  { host: "localhost", label: "localhost" },
  { host: "www.facebase.org", label: "FaceBase" },
  { host: "www.atlas-d2k.org", label: "ATLAS-D2K" },
  { host: "dev.eye-ai.org", label: "EyeAI" },
];

export default function App() {
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [connection, setConnection] = useState<ServerConnection | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const result = await fetchApps(controller.signal);
        if (result.status === "success") {
          setApps(result.apps.filter((a) => a.id !== "app-launcher"));
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      } finally {
        setLoadingApps(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const handleConnect = useCallback((conn: ServerConnection) => {
    setConnection(conn);
    setSelectedCatalog(null);
    toast.success(`Connected to ${conn.hostname}`, {
      description: `${conn.catalogs.length} catalog${conn.catalogs.length !== 1 ? "s" : ""}`,
    });
  }, []);

  const handleLaunch = useCallback(
    async (app: AppEntry) => {
      setLaunching(app.id);
      try {
        const result = await launchApp(
          app.id,
          connection?.hostname ?? undefined,
          selectedCatalog ?? undefined,
        );
        if (result.status === "success") {
          toast.success(`${result.app_name} is ready`, {
            description: result.url,
          });
          setTimeout(() => window.open(result.url, "_blank"), 600);
        } else {
          toast.error("Launch failed", { description: result.error });
        }
      } catch (e: unknown) {
        toast.error("Launch failed", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
      } finally {
        setLaunching(null);
      }
    },
    [connection, selectedCatalog],
  );

  const hasContext = Boolean(connection && selectedCatalog);

  return (
    <div className="h-screen flex flex-col">
      <ChaiseNavbar
        apps={apps}
        connection={connection}
        selectedCatalog={selectedCatalog}
        onConnect={handleConnect}
        onSelectCatalog={setSelectedCatalog}
        onLaunch={handleLaunch}
        launching={launching}
      />

      {/* Main content area */}
      <main className="flex-1 overflow-auto bg-[#f5f5f5]">
        {loadingApps ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 text-[#4674a7] animate-spin" />
          </div>
        ) : (
          <div className="max-w-5xl mx-auto px-8 py-10">
            {/* Context indicator */}
            {connection && (
              <div className="mb-6 flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-[#ccc]">
                  <Server className="h-3.5 w-3.5 text-[#4674a7]" />
                  <span className="font-mono text-[#333]">{connection.hostname}</span>
                </div>
                {selectedCatalog && (
                  <>
                    <span className="text-[#bbb]">/</span>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-[#4674a7]">
                      <Database className="h-3.5 w-3.5 text-[#4674a7]" />
                      <span className="font-mono text-[#333]">
                        {selectedCatalog}
                        {_aliasLabel(connection, selectedCatalog)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {apps.map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  hasContext={hasContext}
                  launching={launching === app.id}
                  onLaunch={handleLaunch}
                />
              ))}
            </div>

            {apps.length === 0 && (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <Rocket className="h-10 w-10 text-[#ccc] mb-4" />
                <p className="text-[#777]">No applications available</p>
                <p className="text-xs text-[#999] mt-1">
                  Build apps from the deriva-ml-apps repository
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      <Toaster />
    </div>
  );
}

function _aliasLabel(conn: ServerConnection, catalogId: string): string {
  const alias = conn.aliases.find((a) => a.alias_target === catalogId);
  return alias ? ` — ${alias.id}` : "";
}

// ==========================================================================
// ChaiseNavbar — mirrors Chaise's navbar-inverse exactly, with dropdowns
// ==========================================================================

function ChaiseNavbar({
  apps,
  connection,
  selectedCatalog,
  onConnect,
  onSelectCatalog,
  onLaunch,
  launching,
}: {
  apps: AppEntry[];
  connection: ServerConnection | null;
  selectedCatalog: string | null;
  onConnect: (conn: ServerConnection) => void;
  onSelectCatalog: (id: string) => void;
  onLaunch: (app: AppEntry) => void;
  launching: string | null;
}) {
  return (
    <nav
      className="flex-shrink-0 flex items-center"
      style={{
        backgroundColor: "#000",
        minHeight: 50,
        height: 50,
        padding: "0 5px 0 20px",
      }}
    >
      {/* Brand */}
      <a
        href="/"
        className="no-underline"
        style={{ color: "#59C4FF", padding: "15px", fontSize: 18, lineHeight: "20px" }}
      >
        DerivaML
      </a>

      {/* Left nav items — dropdown menus matching Chaise's style */}
      <div className="flex items-center" style={{ marginRight: "auto" }}>
        <NavDropdown label="Applications">
          {apps.length === 0 ? (
            <div className="px-4 py-3 text-xs text-[#999] italic">
              No apps available
            </div>
          ) : (
            apps.map((app) => {
              const needsCatalog = app.requires_catalog;
              const canLaunch = !needsCatalog || Boolean(connection && selectedCatalog);
              const IconComponent = ICON_MAP[app.icon] || Layout;
              const isLaunching = launching === app.id;
              return (
                <button
                  key={app.id}
                  onClick={() => canLaunch && !isLaunching && onLaunch(app)}
                  disabled={!canLaunch || isLaunching}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    canLaunch
                      ? "hover:bg-[#428bca] hover:text-white text-[#333]"
                      : "text-[#bbb] cursor-not-allowed"
                  }`}
                >
                  {isLaunching ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#4674a7] shrink-0" />
                  ) : (
                    <IconComponent className={`h-4 w-4 shrink-0 ${canLaunch ? "text-[#4674a7]" : "text-[#ccc]"}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{app.name}</div>
                    <div className={`text-[11px] ${canLaunch ? "text-[#777]" : "text-[#ccc]"}`}>
                      {app.description}
                    </div>
                  </div>
                  {needsCatalog && !canLaunch && (
                    <Lock className="h-3 w-3 text-[#ccc] shrink-0" />
                  )}
                  {canLaunch && !isLaunching && (
                    <ExternalLink className="h-3 w-3 text-[#bbb] shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </NavDropdown>

        <ServerDropdown
          connection={connection}
          onConnect={onConnect}
        />

        {connection && (
          <CatalogDropdown
            connection={connection}
            selectedCatalog={selectedCatalog}
            onSelect={onSelectCatalog}
          />
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center">
        {connection && selectedCatalog && (
          <span className="text-xs font-mono" style={{ color: "#c1c1c1", padding: "15px" }}>
            {connection.hostname}
            <span style={{ color: "#59C4FF" }}> / {selectedCatalog}</span>
          </span>
        )}
        <a
          href="https://docs.derivacloud.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm no-underline hover:text-white transition-colors"
          style={{ color: "#c1c1c1", padding: "15px" }}
        >
          Help
        </a>
      </div>
    </nav>
  );
}

// ==========================================================================
// NavDropdown — a generic Chaise-style navbar dropdown
// ==========================================================================

function NavDropdown({
  label,
  children,
  badge,
}: {
  label: string;
  children: React.ReactNode;
  badge?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm transition-colors hover:text-white"
        style={{ color: "#c1c1c1", padding: "15px", lineHeight: "20px" }}
      >
        {label}
        {badge && (
          <span className="ml-1 px-1.5 py-0 rounded text-[10px] font-mono bg-[#428bca] text-white leading-4">
            {badge}
          </span>
        )}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute top-[50px] left-0 z-50 min-w-[320px] bg-white rounded-b border border-t-0 border-[#ccc] shadow-lg overflow-hidden"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ==========================================================================
// ServerDropdown — pick a server from known list or type custom
// ==========================================================================

function ServerDropdown({
  connection,
  onConnect,
}: {
  connection: ServerConnection | null;
  onConnect: (conn: ServerConnection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customHost, setCustomHost] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const connect = useCallback(
    async (host: string) => {
      setLoading(host);
      setError(null);
      try {
        const result = await fetchRegistry(host);
        if (result.status === "error") {
          setError(result.error);
          return;
        }
        onConnect({
          hostname: host,
          catalogs: result.catalogs,
          aliases: result.aliases,
        });
        setOpen(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Connection failed");
      } finally {
        setLoading(null);
      }
    },
    [onConnect],
  );

  const label = connection ? connection.hostname : "Server";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm transition-colors hover:text-white"
        style={{ color: connection ? "#59C4FF" : "#c1c1c1", padding: "15px", lineHeight: "20px" }}
      >
        <Server className="h-3.5 w-3.5" />
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute top-[50px] left-0 z-50 min-w-[280px] bg-white rounded-b border border-t-0 border-[#ccc] shadow-lg overflow-hidden"
        >
          {/* Custom hostname input */}
          <div className="px-3 py-2.5 border-b border-[#eee]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (customHost.trim()) connect(customHost.trim());
              }}
              className="flex gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={customHost}
                onChange={(e) => setCustomHost(e.target.value)}
                placeholder="Enter hostname..."
                className="flex-1 h-7 px-2 text-xs font-mono rounded border border-[#ccc] bg-[#f1f1f1] text-[#333] placeholder:text-[#999] focus:outline-none focus:ring-1 focus:ring-[#428bca] focus:border-[#428bca]"
              />
              <button
                type="submit"
                disabled={!customHost.trim() || loading !== null}
                className="h-7 px-3 text-[11px] font-medium rounded bg-[#4674a7] text-white hover:bg-[#428bca] disabled:opacity-40 transition-colors"
              >
                Go
              </button>
            </form>
          </div>

          {/* Known servers */}
          <div className="py-1">
            <div className="px-3 py-1.5 text-[10px] font-medium text-[#999] uppercase tracking-wider">
              Known Servers
            </div>
            {KNOWN_SERVERS.map(({ host, label }) => {
              const isActive = connection?.hostname === host;
              const isLoading = loading === host;
              return (
                <button
                  key={host}
                  onClick={() => connect(host)}
                  disabled={loading !== null}
                  className={`w-full text-left px-3 py-2 flex items-center gap-3 text-sm transition-colors ${
                    isActive
                      ? "bg-[#d0e0f0]"
                      : "hover:bg-[#f7f0cf]"
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 text-[#4674a7] animate-spin shrink-0" />
                  ) : (
                    <Server className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-[#4674a7]" : "text-[#bbb]"}`} />
                  )}
                  <div className="flex-1">
                    <div className="text-[#333] font-medium">{label}</div>
                    <div className="text-[11px] font-mono text-[#999]">{host}</div>
                  </div>
                  {isActive && <Check className="h-3.5 w-3.5 text-[#4674a7] shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 border-t border-[#eee] flex items-center gap-2 text-xs text-[#d9534f]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================================================
// CatalogDropdown — pick a catalog from the connected server
// ==========================================================================

function CatalogDropdown({
  connection,
  selectedCatalog,
  onSelect,
}: {
  connection: ServerConnection;
  selectedCatalog: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = selectedCatalog
    ? `Catalog ${selectedCatalog}`
    : "Catalog";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm transition-colors hover:text-white"
        style={{
          color: selectedCatalog ? "#59C4FF" : "#c1c1c1",
          padding: "15px",
          lineHeight: "20px",
        }}
      >
        <Database className="h-3.5 w-3.5" />
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute top-[50px] left-0 z-50 min-w-[300px] max-h-80 overflow-auto bg-white rounded-b border border-t-0 border-[#ccc] shadow-lg"
        >
          <div className="px-3 py-1.5 text-[10px] font-medium text-[#999] uppercase tracking-wider border-b border-[#eee]">
            {connection.catalogs.length} Catalogs on {connection.hostname}
          </div>
          {connection.catalogs.map((catalog) => {
            const aliases = connection.aliases.filter(
              (a) => a.alias_target === catalog.id,
            );
            const isSelected = selectedCatalog === catalog.id;
            return (
              <button
                key={catalog.id}
                onClick={() => {
                  onSelect(catalog.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors border-b border-[#f5f5f5] last:border-b-0 ${
                  isSelected ? "bg-[#d0e0f0]" : "hover:bg-[#f7f0cf]"
                }`}
              >
                <span className="font-mono font-semibold text-xs text-[#4674a7] w-6 text-right shrink-0">
                  {catalog.id}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#333] truncate">
                    {catalog.name || `Catalog ${catalog.id}`}
                  </div>
                  {aliases.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Tag className="h-2.5 w-2.5 text-[#bbb]" />
                      {aliases.map((a) => (
                        <span
                          key={a.id}
                          className="font-mono text-[10px] px-1 rounded bg-[#f1f1f1] text-[#777]"
                        >
                          {a.id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-[#4674a7] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================================================
// AppCard
// ==========================================================================

function AppCard({
  app,
  hasContext,
  launching,
  onLaunch,
}: {
  app: AppEntry;
  hasContext: boolean;
  launching: boolean;
  onLaunch: (app: AppEntry) => void;
}) {
  const IconComponent = ICON_MAP[app.icon] || Layout;
  const needsCatalog = app.requires_catalog;
  const canLaunch = !needsCatalog || hasContext;

  return (
    <button
      onClick={() => canLaunch && !launching && onLaunch(app)}
      disabled={!canLaunch || launching}
      className={`
        app-card group relative text-left rounded border p-5 transition-all
        ${
          canLaunch
            ? "bg-white hover:border-[#428bca] hover:shadow-md cursor-pointer border-[#ccc]"
            : "bg-[#f4f4f4] border-[#ddd] cursor-not-allowed opacity-60"
        }
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={`p-2 rounded transition-colors ${
            canLaunch ? "bg-[#d0e0f0]" : "bg-[#f1f1f1]"
          }`}
        >
          {launching ? (
            <Loader2 className="h-5 w-5 text-[#4674a7] animate-spin" />
          ) : (
            <IconComponent
              className={`h-5 w-5 ${canLaunch ? "text-[#4674a7]" : "text-[#999]"}`}
            />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {needsCatalog && !hasContext && (
            <div className="flex items-center gap-1 text-[10px] text-[#999] bg-[#f1f1f1] px-2 py-0.5 rounded-full">
              <Lock className="h-2.5 w-2.5" />
              Needs catalog
            </div>
          )}
          <span className="text-[10px] font-medium text-[#777] uppercase tracking-wider bg-[#f1f1f1] px-2 py-0.5 rounded-full">
            {app.category}
          </span>
        </div>
      </div>

      <h3
        className={`text-base font-semibold mb-1 transition-colors ${
          canLaunch ? "text-[#333] group-hover:text-[#4674a7]" : "text-[#999]"
        }`}
      >
        {app.name}
      </h3>

      <p className="text-xs text-[#777] leading-relaxed mb-4">
        {app.description}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-[#bbb]">{app.id}</span>
        {canLaunch && !launching && (
          <div className="flex items-center gap-1 text-xs text-[#4674a7] opacity-0 group-hover:opacity-100 transition-opacity">
            Launch
            <ExternalLink className="h-3 w-3" />
          </div>
        )}
        {launching && (
          <span className="text-[10px] text-[#4674a7]">Starting...</span>
        )}
      </div>
    </button>
  );
}
