/**
 * RJSF templates — control the layout of form elements.
 *
 * These wrap shadcn/ui components and match the existing
 * EditFormGroup / EditFormRow design language from AnnotationsPanel.
 */

import type {
  ObjectFieldTemplateProps,
  FieldTemplateProps,
  ArrayFieldTemplateProps,
  TitleFieldProps,
  DescriptionFieldProps,
  ErrorListProps,
} from "@rjsf/utils";
import { HelpCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Object Template ─────────────────────────────────────────────
// Renders an object's properties as a group with a title header.

export function BaseObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { title, description, properties, fieldPathId } = props;
  const isRoot = !fieldPathId || fieldPathId.$id === "root";

  // Root object: no wrapper, just render properties
  if (isRoot) {
    return (
      <div className="space-y-4">
        {description && (
          <p className="text-[11px] text-slate-500">{description}</p>
        )}
        {properties.map((prop) => prop.content)}
      </div>
    );
  }

  // Nested object: render with group styling
  return (
    <div className="border border-slate-100 rounded-md overflow-hidden">
      {title && (
        <div className="bg-chaise-header/40 px-3 py-1.5 flex items-center gap-1.5 border-b border-chaise-header/50">
          <span className="text-xs font-semibold text-chaise-header-text uppercase tracking-wider">
            {title}
          </span>
          {description && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-slate-400 hover:text-slate-600 transition-colors">
                    <HelpCircle className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px] text-xs">
                  {description}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
      <div className="px-3 py-2 space-y-2">
        {properties.map((prop) => prop.content)}
      </div>
    </div>
  );
}

// ── Field Template ──────────────────────────────────────────────
// Wraps individual fields with label and description.

export function BaseFieldTemplate(props: FieldTemplateProps) {
  const {
    id,
    label,
    children,
    errors,
    help,
    description,
    hidden,
    required,
    displayLabel,
    schema,
  } = props;

  if (hidden) return <div className="hidden">{children}</div>;

  // For object and array types, the children handle their own layout
  if (schema.type === "object" || schema.type === "array") {
    return (
      <div className="space-y-1">
        {children}
        {errors}
        {help}
      </div>
    );
  }

  // Don't show label for boolean fields (checkbox has its own label)
  if (schema.type === "boolean") {
    return (
      <div className="space-y-1">
        {children}
        {errors}
        {help}
      </div>
    );
  }

  // Standard field: label left, input right
  if (!displayLabel) {
    return (
      <div className="space-y-1">
        {children}
        {errors}
        {help}
      </div>
    );
  }

  const schemaComment = (schema as Record<string, unknown>).$comment as string | undefined;
  const helpText = description || schemaComment;

  return (
    <div className="flex items-start gap-2">
      <div className="w-[8rem] flex-shrink-0 pt-1">
        <div className="flex items-center gap-1">
          <label htmlFor={id} className="text-[11px] text-slate-500 font-normal">
            {label}
            {required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {helpText && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-slate-300 hover:text-slate-500 transition-colors">
                    <HelpCircle className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px] text-xs">
                  {helpText}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        {children}
        {errors}
        {help}
      </div>
    </div>
  );
}

// ── Array Template ──────────────────────────────────────────────
// In RJSF v5, items are pre-rendered ReactElements. The template
// wraps them with a title and add button.

export function BaseArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { title, items, canAdd, onAddClick } = props;

  return (
    <div className="border border-slate-100 rounded-md overflow-hidden">
      {title && (
        <div className="bg-chaise-header/40 px-3 py-1.5 flex items-center justify-between border-b border-chaise-header/50">
          <span className="text-xs font-semibold text-chaise-header-text uppercase tracking-wider">
            {title}
          </span>
          {canAdd && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddClick}
              className="h-6 text-[10px] gap-1 text-slate-500 hover:text-slate-700"
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          )}
        </div>
      )}
      <div className="divide-y divide-slate-50">
        {items.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-slate-400 italic">
            No items
          </div>
        )}
        {items.map((item, idx) => (
          <div key={idx} className="px-3 py-1.5">
            {item}
          </div>
        ))}
      </div>
      {!title && canAdd && (
        <div className="px-3 py-1.5 border-t border-slate-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddClick}
            className="h-6 text-[10px] gap-1 text-slate-500 hover:text-slate-700"
          >
            <Plus className="h-3 w-3" />
            Add item
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Title Template ──────────────────────────────────────────────

export function BaseTitleFieldTemplate(props: TitleFieldProps) {
  const { title, id } = props;
  if (!title) return null;
  return (
    <h4
      id={id}
      className="text-xs font-semibold text-slate-700 mb-1"
    >
      {title}
    </h4>
  );
}

// ── Description Template ────────────────────────────────────────

export function BaseDescriptionFieldTemplate(props: DescriptionFieldProps) {
  const { description, id } = props;
  if (!description) return null;
  return (
    <p id={id} className="text-[10px] text-slate-500 mb-1">
      {description}
    </p>
  );
}

// ── Error List Template ─────────────────────────────────────────

export function BaseErrorListTemplate(props: ErrorListProps) {
  const { errors } = props;
  if (!errors || errors.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {errors.map((error, i) => (
        <div key={i} className="text-[10px] text-red-500 bg-red-50 rounded px-2 py-0.5">
          {error.stack}
        </div>
      ))}
    </div>
  );
}
