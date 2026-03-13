/**
 * RJSF integration module — schema-driven annotation editing.
 *
 * Public API:
 * - SchemaFormEditor: Main form component for rich schemas
 * - FlagAnnotationEditor: Minimal UI for flag/placeholder schemas
 * - derivaTemplates / derivaWidgets: shadcn/ui theme for RJSF
 */

export { default as SchemaFormEditor } from "./SchemaFormEditor";
export { default as FlagAnnotationEditor } from "./FlagAnnotationEditor";
export { derivaTemplates, derivaWidgets } from "./theme";
