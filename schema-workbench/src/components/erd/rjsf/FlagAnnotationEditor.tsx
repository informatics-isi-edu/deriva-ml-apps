/**
 * Editor for flag/placeholder annotations (generated, immutable,
 * required, non_deletable).
 *
 * These annotations have no editable properties — their presence
 * or absence IS the setting. The value is always null or {}.
 */

import type { AnnotationTagInfo } from "@/annotation-registry";

interface FlagAnnotationEditorProps {
  info?: AnnotationTagInfo;
}

export default function FlagAnnotationEditor({ info }: FlagAnnotationEditorProps) {
  return (
    <div className="py-4 px-2 text-center space-y-2">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-xs font-medium text-emerald-700">Active</span>
      </div>
      <p className="text-[11px] text-slate-500 max-w-[300px] mx-auto">
        {info?.description || "This is a flag annotation."}
        {" "}Its presence indicates the setting is enabled. Delete the annotation to disable it.
      </p>
    </div>
  );
}
