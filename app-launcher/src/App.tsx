import { useCallback, useEffect, useState } from "react";
import { Rocket, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { ServerPanel } from "@/components/ServerPanel";
import { AppGrid } from "@/components/AppGrid";
import { fetchApps } from "@/api";
import type { AppEntry, ServerConnection } from "@/types";

export default function App() {
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [connection, setConnection] = useState<ServerConnection | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);

  // Load app catalog on mount
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const result = await fetchApps(controller.signal);
        if (result.status === "success") {
          // Exclude the launcher itself from the list
          setApps(result.apps.filter((a) => a.id !== "app-launcher"));
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("Failed to load apps:", e);
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
      description: `${conn.catalogs.length} catalogs, ${conn.aliases.length} aliases`,
    });
  }, []);

  const handleLaunch = useCallback(
    (app: AppEntry) => {
      // Build the URL for the target app
      // When launched via the MCP proxy, apps are at /<app-id>/
      // For now, we'll construct the URL with hash params
      const params = new URLSearchParams();

      if (connection?.hostname) {
        params.set("host", connection.hostname);
      }
      if (selectedCatalog) {
        params.set("catalog", selectedCatalog);
      }

      // Open the app in a new window
      // The MCP start_app tool will handle this properly;
      // for standalone use, construct the URL
      const appUrl = `/${app.id}/#${params.toString().replace(/&/g, "&")}`;

      toast.info(`Launching ${app.name}...`, {
        description: selectedCatalog
          ? `${connection?.hostname} / catalog ${selectedCatalog}`
          : undefined,
      });

      window.open(appUrl, "_blank");
    },
    [connection, selectedCatalog],
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-brand/10 border border-brand/20">
              <Rocket className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h1 className="font-display text-xl tracking-tight text-foreground italic">
                DerivaML
              </h1>
              <p className="text-[11px] text-muted-foreground font-mono">
                Application Launcher
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {connection && (
              <>
                <span>
                  <span className="font-mono text-foreground">
                    {connection.hostname}
                  </span>
                </span>
                {selectedCatalog && (
                  <>
                    <Separator orientation="vertical" className="h-4" />
                    <span>
                      catalog{" "}
                      <span className="font-mono text-brand font-semibold">
                        {selectedCatalog}
                      </span>
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Server / Registry browser */}
        <div className="w-80 flex-shrink-0 border-r border-border bg-card/50 overflow-hidden flex flex-col">
          <ServerPanel
            connection={connection}
            onConnect={handleConnect}
            selectedCatalog={selectedCatalog}
            onSelectCatalog={setSelectedCatalog}
          />
        </div>

        {/* Right panel: App grid */}
        <div className="flex-1 overflow-auto bg-grid bg-hero-gradient">
          {loadingApps ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-5 w-5 text-brand animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Loading applications...
                </p>
              </div>
            </div>
          ) : (
            <AppGrid
              apps={apps}
              selectedCatalog={selectedCatalog}
              hostname={connection?.hostname ?? null}
              onLaunch={handleLaunch}
            />
          )}
        </div>
      </div>
    </div>
  );
}
