/**
 * Schema-driven annotation editor — renders interactive forms from
 * JSON Schema using RJSF (React JSON Schema Form).
 *
 * This is the central component that replaces the hardcoded read-only
 * viewers. It receives a JSON Schema and annotation value, renders
 * an interactive form, and pushes changes to the draft via onChange.
 *
 * Includes an error boundary so malformed schemas degrade gracefully
 * to a JSON editor instead of crashing the entire panel.
 */

import { Component, useMemo, useCallback } from "react";
import type { ReactNode, ErrorInfo } from "react";
import Form from "@rjsf/core";
import type { IChangeEvent } from "@rjsf/core";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import { derivaValidator } from "@/schemas/validator";
import { derivaTemplates, derivaWidgets } from "./theme";

interface SchemaFormEditorProps {
  /** JSON Schema defining the annotation structure. */
  schema: RJSFSchema;
  /** Current annotation value from the draft. */
  formData: unknown;
  /** Push changes to the draft. Undefined = read-only mode. */
  onChange?: (data: unknown) => void;
  /** Optional UI schema overrides for field presentation. */
  uiSchema?: UiSchema;
  /** Fallback UI when the schema form fails to render. */
  fallback?: ReactNode;
}

// ── Error Boundary ──────────────────────────────────────────────

interface ErrorBoundaryState {
  error: Error | null;
}

class SchemaFormErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[SchemaFormEditor] Render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="p-3 text-xs text-red-600 bg-red-50 rounded border border-red-200">
            <div className="font-semibold mb-1">Schema form error</div>
            <div className="text-[10px] text-red-500 font-mono">
              {this.state.error.message}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              Falling back to JSON editor for this annotation.
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ── Schema Form Editor ──────────────────────────────────────────

/**
 * Renders an interactive form from a JSON Schema.
 *
 * - In edit mode (onChange provided): fields are interactive, changes
 *   push to the draft immediately.
 * - In read-only mode (no onChange): fields are disabled.
 * - No submit button — saving is handled by the existing SaveBar.
 */
export default function SchemaFormEditor({
  schema,
  formData,
  onChange,
  uiSchema,
  fallback,
}: SchemaFormEditorProps) {
  const readonly = !onChange;

  const handleChange = useCallback(
    (e: IChangeEvent) => {
      onChange?.(e.formData);
    },
    [onChange],
  );

  // Merge default uiSchema with any overrides
  const mergedUiSchema = useMemo(
    () => ({
      "ui:submitButtonOptions": { norender: true },
      ...uiSchema,
    }),
    [uiSchema],
  );

  return (
    <SchemaFormErrorBoundary fallback={fallback}>
      <Form
        schema={schema}
        formData={formData}
        validator={derivaValidator}
        onChange={handleChange}
        templates={derivaTemplates}
        widgets={derivaWidgets}
        uiSchema={mergedUiSchema}
        disabled={readonly}
        liveValidate={false}
        showErrorList={false}
        noHtml5Validate
      >
        {/* Empty children suppresses the default submit button */}
        <></>
      </Form>
    </SchemaFormErrorBoundary>
  );
}
