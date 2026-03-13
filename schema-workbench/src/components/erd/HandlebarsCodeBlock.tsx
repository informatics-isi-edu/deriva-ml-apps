/**
 * Handlebars template display component with syntax highlighting
 * and Chaise/Deriva-specific helper reference popover.
 *
 * Extracted from AnnotationsPanel to be reused as an RJSF custom
 * widget for markdown_pattern / *_pattern fields.
 */

import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** Detect whether a string contains Handlebars expressions */
export function isHandlebarsTemplate(value: string): boolean {
  return /\{\{[^}]+\}\}/.test(value);
}

/**
 * Chaise/Deriva Handlebars helper reference.
 * These are the helpers available in Chaise templates beyond standard Handlebars.
 */
export const HANDLEBARS_HELPERS = [
  { name: "{{#if}}", syntax: "{{#if value}}...{{else}}...{{/if}}", desc: "Conditional rendering" },
  { name: "{{#each}}", syntax: "{{#each array}}{{this}}{{/each}}", desc: "Iterate over arrays" },
  { name: "{{#unless}}", syntax: "{{#unless value}}...{{/unless}}", desc: "Inverse conditional" },
  { name: "{{#with}}", syntax: "{{#with object}}...{{/with}}", desc: "Change scope context" },
  { name: "{{encode}}", syntax: "{{#encode}}...{{/encode}}", desc: "URI-encode the enclosed content" },
  { name: "{{escape}}", syntax: "{{#escape}}...{{/escape}}", desc: "HTML-escape content to prevent XSS" },
  { name: "{{encodeFacet}}", syntax: '{{#encodeFacet}}{"and":[...]}{{/encodeFacet}}', desc: "Encode a facet blob for use in Chaise URLs" },
  { name: "{{formatDate}}", syntax: '{{formatDate value format}}', desc: 'Format a date/timestamp (e.g., "YYYY-MM-DD")' },
  { name: "{{humanizeBytes}}", syntax: "{{humanizeBytes value}}", desc: "Convert byte count to human-readable (e.g., 1.5 MB)" },
  { name: "{{$moment}}", syntax: "{{$moment.day}}, {{$moment.timestamp}}", desc: "Current date/time values" },
  { name: "{{$session}}", syntax: "{{$session.client.display_name}}", desc: "Current user session info" },
  { name: "{{$catalog}}", syntax: "{{$catalog.snapshot}}", desc: "Catalog-level variables" },
  { name: "{{$dcctx}}", syntax: "{{$dcctx.contextHeaderParams}}", desc: "Deriva client context parameters" },
  { name: "{{{value}}}", syntax: "{{{column_name}}}", desc: "Triple-brace: raw HTML output (no escaping)" },
  { name: "{{jsonStringify}}", syntax: "{{jsonStringify value}}", desc: "Serialize value as JSON string" },
  { name: "{{regexMatch}}", syntax: '{{#if (regexMatch value "pattern")}}...', desc: "Test if value matches a regex" },
  { name: "{{toTitleCase}}", syntax: "{{toTitleCase value}}", desc: "Convert text to Title Case" },
] as const;

/**
 * Code block with Handlebars syntax highlighting and a reference popover.
 *
 * Detects Handlebars expressions in the value and highlights them.
 * When templates are detected, shows a help icon that opens a popover
 * with the full Chaise/Deriva helper reference.
 */
export function CodeBlock({ value, label }: { value: string; label?: string }) {
  const isTemplate = isHandlebarsTemplate(value);

  // Simple syntax highlighting for Handlebars expressions
  const highlighted = isTemplate
    ? value.split(/(\{\{\{?[^}]+\}\}\}?)/).map((segment, i) =>
        /^\{\{/.test(segment) ? (
          <span key={i} className="text-brand font-semibold">{segment}</span>
        ) : (
          <span key={i}>{segment}</span>
        )
      )
    : value;

  return (
    <div className="group">
      {label && (
        <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
      )}
      <div className="relative">
        <code className="text-[10px] font-mono text-slate-600 bg-slate-50 rounded p-1.5 block whitespace-pre-wrap break-all">
          {highlighted}
        </code>
        {isTemplate && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="absolute top-1 right-1 p-0.5 rounded text-slate-300 hover:text-brand hover:bg-white transition-colors opacity-0 group-hover:opacity-100">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="left" align="start" className="w-[320px] max-h-[400px] overflow-y-auto p-0 z-[60]">
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                <div className="text-xs font-semibold text-slate-800">Handlebars Template Reference</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Chaise/Deriva-specific helpers and syntax</div>
              </div>
              <div className="divide-y divide-slate-50">
                {HANDLEBARS_HELPERS.map((h) => (
                  <div key={h.name} className="px-3 py-1.5 hover:bg-chaise-hover/30">
                    <code className="text-[10px] font-mono font-semibold text-brand">{h.name}</code>
                    <div className="text-[10px] text-slate-500 mt-0.5">{h.desc}</div>
                    <code className="text-[9px] font-mono text-slate-400 mt-0.5 block">{h.syntax}</code>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
                <div className="text-[10px] text-slate-400">
                  Use <code className="font-mono text-brand">{"{{column_name}}"}</code> to reference column values.
                  Triple braces <code className="font-mono text-brand">{"{{{value}}}"}</code> output raw HTML.
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
