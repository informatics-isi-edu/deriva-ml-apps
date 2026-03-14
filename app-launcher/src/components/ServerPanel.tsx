import { useCallback, useEffect, useRef, useState } from "react";
import {
  Server,
  Search,
  Database,
  Tag,
  Loader2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { fetchRegistry } from "@/api";
import type { CatalogEntry, AliasEntry, ServerConnection } from "@/types";

interface ServerPanelProps {
  connection: ServerConnection | null;
  onConnect: (connection: ServerConnection) => void;
  selectedCatalog: string | null;
  onSelectCatalog: (catalogId: string) => void;
}

const KNOWN_SERVERS = [
  "www.facebase.org",
  "www.atlas-d2k.org",
  "dev.eye-ai.org",
  "localhost",
];

export function ServerPanel({
  connection,
  onConnect,
  selectedCatalog,
  onSelectCatalog,
}: ServerPanelProps) {
  const [hostname, setHostname] = useState(connection?.hostname ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleConnect = useCallback(
    async (host?: string) => {
      const target = host ?? hostname.trim();
      if (!target) return;

      setHostname(target);
      setLoading(true);
      setError(null);

      try {
        const result = await fetchRegistry(target);
        if (result.status === "error") {
          setError(result.error);
          return;
        }
        onConnect({
          hostname: target,
          catalogs: result.catalogs,
          aliases: result.aliases,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Connection failed");
      } finally {
        setLoading(false);
      }
    },
    [hostname, onConnect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleConnect();
    },
    [handleConnect],
  );

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Server input */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <Server className="h-3.5 w-3.5" />
          Server
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="hostname (e.g. www.facebase.org)"
              className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <Button
            variant="brand"
            size="sm"
            onClick={() => handleConnect()}
            disabled={loading || !hostname.trim()}
            className="shrink-0"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Connect"
            )}
          </Button>
        </div>

        {/* Quick-connect servers */}
        <div className="flex flex-wrap gap-1.5">
          {KNOWN_SERVERS.map((server) => (
            <button
              key={server}
              onClick={() => handleConnect(server)}
              disabled={loading}
              className={`
                px-2 py-0.5 rounded text-xs font-mono transition-all
                ${
                  connection?.hostname === server
                    ? "bg-brand/15 text-brand border border-brand/30"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent"
                }
              `}
            >
              {server}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Registry results */}
      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm animate-fade-in">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Connection failed</p>
              <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!connection && !error && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="p-3 rounded-full bg-muted/50 mb-3">
              <Database className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              Connect to a Deriva server to browse catalogs
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Loader2 className="h-5 w-5 text-brand animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">
              Querying registry...
            </p>
          </div>
        )}

        {connection && !loading && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Catalogs
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                {connection.catalogs.length}
              </span>
            </div>

            <div className="space-y-1">
              {connection.catalogs.map((catalog) => (
                <CatalogRow
                  key={catalog.id}
                  catalog={catalog}
                  aliases={connection.aliases.filter(
                    (a) => a.alias_target === catalog.id,
                  )}
                  selected={selectedCatalog === catalog.id}
                  onSelect={() => onSelectCatalog(catalog.id)}
                />
              ))}
            </div>

            {connection.catalogs.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-4 text-center">
                No catalogs found on this server
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CatalogRow({
  catalog,
  aliases,
  selected,
  onSelect,
}: {
  catalog: CatalogEntry;
  aliases: AliasEntry[];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`
        catalog-row w-full text-left rounded-md px-3 py-2.5 transition-all
        ${
          selected
            ? "bg-brand/12 border border-brand/30 shadow-sm shadow-brand/5"
            : "bg-card/50 border border-transparent hover:bg-card hover:border-border"
        }
      `}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`
            flex items-center justify-center h-7 w-7 rounded-md text-xs font-mono font-semibold shrink-0
            ${selected ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground"}
          `}
        >
          {catalog.id}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-medium truncate ${selected ? "text-foreground" : "text-foreground/80"}`}
            >
              {catalog.name || `Catalog ${catalog.id}`}
            </span>
            {selected && (
              <ChevronRight className="h-3.5 w-3.5 text-brand shrink-0" />
            )}
          </div>

          {catalog.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {catalog.description}
            </p>
          )}

          {aliases.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <Tag className="h-3 w-3 text-muted-foreground/50" />
              {aliases.map((alias) => (
                <span
                  key={alias.id}
                  className="text-[10px] font-mono px-1.5 py-0 rounded bg-muted/80 text-muted-foreground"
                >
                  {alias.id}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
