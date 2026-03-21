import { useState } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import type {
  ValidationReport,
  ValidationReportEntry,
  ValidationResult,
} from "@/annotation-validator";

interface ValidationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ValidationReport | null;
  loading: boolean;
}

/** Color for the object-type indicator dot in each entry row. */
function objectTypeColor(
  objectType: ValidationReportEntry["objectType"],
): string {
  switch (objectType) {
    case "catalog":
      return "text-purple-600";
    case "schema":
      return "text-blue-600";
    case "table":
      return "text-slate-700";
    case "column":
      return "text-emerald-600";
    case "key":
      return "text-amber-600";
    case "foreignkey":
      return "text-rose-600";
  }
}

function EntryRow({ entry }: { entry: ValidationReportEntry }) {
  const [open, setOpen] = useState(false);
  const totalErrors = entry.results.reduce(
    (sum, r) => sum + r.errors.length,
    0,
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-md hover:bg-slate-50 transition-colors group">
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        )}
        <span
          className={`text-xs font-medium truncate ${objectTypeColor(entry.objectType)}`}
        >
          {entry.objectPath}
        </span>
        <Badge className="ml-auto shrink-0 bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0 h-4 hover:bg-red-100">
          {totalErrors} {totalErrors === 1 ? "error" : "errors"}
        </Badge>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-6 mr-3 mb-2 space-y-2">
          {entry.results.map((result) => (
            <ResultDetail key={result.tag} result={result} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ResultDetail({ result }: { result: ValidationResult }) {
  return (
    <div className="border border-red-200 rounded bg-red-50/50 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <XCircle className="h-3 w-3 text-red-500 shrink-0" />
        <span className="text-[11px] font-semibold text-slate-700">
          {result.tagName}
        </span>
      </div>
      <div className="space-y-1">
        {result.errors.map((err, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px]">
            <code className="font-mono text-slate-500 bg-slate-100 rounded px-1 py-0.5 shrink-0">
              {err.path}
            </code>
            <span className="text-red-600">{err.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <div className="h-6 w-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mb-3" />
      <p className="text-xs">Validating...</p>
    </div>
  );
}

function SuccessState({ totalTags }: { totalTags: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <CheckCircle className="h-10 w-10 text-emerald-500 mb-3" />
      <p className="text-sm font-medium text-emerald-700">
        All {totalTags} annotation tags passed validation.
      </p>
    </div>
  );
}

function SummaryHeader({ report }: { report: ValidationReport }) {
  const { summary } = report;
  return (
    <div className="space-y-1 mb-3">
      <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
        <AlertTriangle className="h-3.5 w-3.5" />
        {summary.invalidTags}{" "}
        {summary.invalidTags === 1 ? "error" : "errors"} across{" "}
        {summary.objectsWithErrors}{" "}
        {summary.objectsWithErrors === 1 ? "object" : "objects"}
      </div>
      <p className="text-[11px] text-slate-400">
        {summary.validTags} tags validated
        {summary.noSchemaTags > 0 &&
          `, ${summary.noSchemaTags} without schema`}
      </p>
    </div>
  );
}

function descriptionText(
  report: ValidationReport | null,
  loading: boolean,
): string {
  if (loading) return "Validating annotations...";
  if (!report) return "";
  if (report.allValid) return "All annotations valid";
  const { summary } = report;
  return `${summary.invalidTags} invalid across ${summary.objectsWithErrors} objects — ${summary.totalTags} tags checked`;
}

export default function ValidationDialog({
  open,
  onOpenChange,
  report,
  loading,
}: ValidationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Annotation Validation</DialogTitle>
          <DialogDescription>
            {descriptionText(report, loading)}
          </DialogDescription>
        </DialogHeader>

        {loading && <LoadingState />}

        {!loading && report?.allValid && (
          <SuccessState totalTags={report.summary.totalTags} />
        )}

        {!loading && report && !report.allValid && (
          <>
            <SummaryHeader report={report} />
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-1">
                {report.entries.map((entry) => (
                  <EntryRow key={entry.objectPath} entry={entry} />
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
