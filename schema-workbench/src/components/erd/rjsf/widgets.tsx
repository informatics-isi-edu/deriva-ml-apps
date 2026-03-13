/**
 * RJSF widgets — shadcn/ui-based input components.
 *
 * Each widget wraps the corresponding shadcn/ui primitive and applies
 * the schema-workbench's compact styling (h-7, text-xs, etc.).
 */

import type { WidgetProps, EnumOptionsType } from "@rjsf/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Sentinel value for "not set" in Select — Radix disallows empty string. */
const UNSET_VALUE = "__unset__";

// ── Text Widget ─────────────────────────────────────────────────

export function TextWidget(props: WidgetProps) {
  const { id, value, required, disabled, readonly, onChange, onBlur, onFocus, placeholder, schema } = props;

  return (
    <Input
      id={id}
      value={value ?? ""}
      required={required}
      disabled={disabled || readonly}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
      placeholder={placeholder || schema.description || ""}
      className="h-7 text-xs"
    />
  );
}

// ── Textarea Widget ─────────────────────────────────────────────

export function TextareaWidget(props: WidgetProps) {
  const { id, value, required, disabled, readonly, onChange, onBlur, onFocus, placeholder, schema } = props;

  return (
    <textarea
      id={id}
      value={value ?? ""}
      required={required}
      disabled={disabled || readonly}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
      placeholder={placeholder || schema.description || ""}
      rows={3}
      className="w-full min-h-[60px] text-[11px] font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-slate-400"
      spellCheck={false}
    />
  );
}

// ── Checkbox Widget (rendered as Switch) ────────────────────────

export function CheckboxWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, onChange, label, schema } = props;

  return (
    <div className="flex items-center justify-between py-0.5">
      <label htmlFor={id} className="text-[11px] text-slate-600 font-normal cursor-pointer">
        {label || schema.title || ""}
      </label>
      <Switch
        id={id}
        checked={!!value}
        onCheckedChange={(v) => onChange(v)}
        disabled={disabled || readonly}
        className="scale-75"
      />
    </div>
  );
}

// ── Select Widget (for enum fields) ─────────────────────────────

export function SelectWidget(props: WidgetProps) {
  const { id, value, required, disabled, readonly, onChange, options, placeholder } = props;
  const enumOptions = (options.enumOptions || []) as EnumOptionsType[];

  return (
    <Select
      value={value ?? UNSET_VALUE}
      onValueChange={(v) => onChange(v === UNSET_VALUE ? undefined : v)}
      disabled={disabled || readonly}
    >
      <SelectTrigger id={id} className="h-7 text-[10px]">
        <SelectValue placeholder={placeholder || "Select..."} />
      </SelectTrigger>
      <SelectContent>
        {!required && (
          <SelectItem value={UNSET_VALUE} className="text-[11px] text-slate-400 italic">
            Not set
          </SelectItem>
        )}
        {enumOptions.map((opt) => (
          <SelectItem key={String(opt.value)} value={String(opt.value)} className="text-[11px]">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
