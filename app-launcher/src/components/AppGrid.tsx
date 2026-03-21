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
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
        app-card group relative text-left rounded border p-5 transition-all
        ${
          canLaunch
            ? "bg-white hover:border-[#428bca] hover:shadow-md cursor-pointer border-[#ccc]"
            : "bg-[#f4f4f4] border-[#ddd] cursor-not-allowed opacity-60"
        }
      `}
    >
      {/* Top row: icon + category */}
      <div className="flex items-start justify-between mb-3">
        <div
          className={`
            p-2 rounded transition-colors
            ${canLaunch ? "bg-[#d0e0f0]" : "bg-[#f1f1f1]"}
          `}
        >
          <IconComponent
            className={`h-5 w-5 ${canLaunch ? "text-[#4674a7]" : "text-[#999]"}`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {needsCatalog && !hasCatalog && (
            <div className="flex items-center gap-1 text-[10px] text-[#999] bg-[#f1f1f1] px-2 py-0.5 rounded-full">
              <Lock className="h-2.5 w-2.5" />
              Catalog required
            </div>
          )}
          <span className="text-[10px] font-medium text-[#777] uppercase tracking-wider bg-[#f1f1f1] px-2 py-0.5 rounded-full">
            {app.category}
          </span>
        </div>
      </div>

      {/* Name */}
      <h3
        className={`text-base font-semibold mb-1 transition-colors ${
          canLaunch
            ? "text-[#333] group-hover:text-[#4674a7]"
            : "text-[#999]"
        }`}
      >
        {app.name}
      </h3>

      {/* Description */}
      <p className="text-xs text-[#777] leading-relaxed mb-4">
        {app.description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-[#bbb]">
          {app.id}
        </span>
        {canLaunch && (
          <div className="flex items-center gap-1 text-xs text-[#4674a7] opacity-0 group-hover:opacity-100 transition-opacity">
            Launch
            <ExternalLink className="h-3 w-3" />
          </div>
        )}
      </div>
    </button>
  );
}
