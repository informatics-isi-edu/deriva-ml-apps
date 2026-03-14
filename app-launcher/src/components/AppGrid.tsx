import {
  Database,
  HardDrive,
  Rocket,
  Layout,
  ExternalLink,
  Lock,
} from "lucide-react";
import type { AppEntry } from "@/types";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  database: Database,
  "hard-drive": HardDrive,
  rocket: Rocket,
  layout: Layout,
};

interface AppGridProps {
  apps: AppEntry[];
  selectedCatalog: string | null;
  hostname: string | null;
  onLaunch: (app: AppEntry) => void;
}

export function AppGrid({
  apps,
  selectedCatalog,
  hostname,
  onLaunch,
}: AppGridProps) {
  if (apps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center px-8">
        <div>
          <Rocket className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            No applications available
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Clone and build apps from the deriva-ml-apps repository
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-6">
      {apps.map((app) => (
        <AppCard
          key={app.id}
          app={app}
          selectedCatalog={selectedCatalog}
          hostname={hostname}
          onLaunch={onLaunch}
        />
      ))}
    </div>
  );
}

function AppCard({
  app,
  selectedCatalog,
  hostname,
  onLaunch,
}: {
  app: AppEntry;
  selectedCatalog: string | null;
  hostname: string | null;
  onLaunch: (app: AppEntry) => void;
}) {
  const IconComponent = ICON_MAP[app.icon] || Layout;
  const needsCatalog = app.requires_catalog;
  const hasCatalog = Boolean(selectedCatalog && hostname);
  const canLaunch = !needsCatalog || hasCatalog;

  return (
    <button
      onClick={() => canLaunch && onLaunch(app)}
      disabled={!canLaunch}
      className={`
        app-card group relative text-left rounded-lg border p-5 transition-all
        ${
          canLaunch
            ? "bg-card hover:bg-card/80 border-border hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5 cursor-pointer"
            : "bg-card/50 border-border/50 cursor-not-allowed opacity-60"
        }
      `}
    >
      {/* Top row: icon + category */}
      <div className="flex items-start justify-between mb-4">
        <div
          className={`
            p-2.5 rounded-lg transition-colors
            ${canLaunch ? "bg-brand/10 group-hover:bg-brand/15" : "bg-muted/50"}
          `}
        >
          <IconComponent
            className={`h-5 w-5 ${canLaunch ? "text-brand" : "text-muted-foreground"}`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {needsCatalog && !hasCatalog && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              <Lock className="h-2.5 w-2.5" />
              Catalog required
            </div>
          )}
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/50 px-2 py-0.5 rounded-full">
            {app.category}
          </span>
        </div>
      </div>

      {/* Name */}
      <h3 className="text-base font-semibold text-foreground mb-1.5 group-hover:text-brand transition-colors">
        {app.name}
      </h3>

      {/* Description */}
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        {app.description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground/60">
          {app.id}
        </span>
        {canLaunch && (
          <div className="flex items-center gap-1 text-xs text-brand opacity-0 group-hover:opacity-100 transition-opacity">
            Launch
            <ExternalLink className="h-3 w-3" />
          </div>
        )}
      </div>
    </button>
  );
}
