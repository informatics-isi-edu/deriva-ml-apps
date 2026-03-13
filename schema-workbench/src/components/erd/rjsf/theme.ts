/**
 * RJSF theme — bundles custom templates and widgets that wrap shadcn/ui
 * components to match the schema-workbench design language.
 *
 * Templates control layout (how objects, arrays, and fields are arranged).
 * Widgets control individual inputs (text, checkbox, select, etc.).
 */

import type { TemplatesType, RegistryWidgetsType } from "@rjsf/utils";
import {
  BaseObjectFieldTemplate,
  BaseFieldTemplate,
  BaseArrayFieldTemplate,
  BaseTitleFieldTemplate,
  BaseDescriptionFieldTemplate,
  BaseErrorListTemplate,
} from "./templates";
import {
  TextWidget,
  TextareaWidget,
  CheckboxWidget,
  SelectWidget,
} from "./widgets";

export const derivaTemplates: Partial<TemplatesType> = {
  ObjectFieldTemplate: BaseObjectFieldTemplate,
  FieldTemplate: BaseFieldTemplate,
  ArrayFieldTemplate: BaseArrayFieldTemplate,
  TitleFieldTemplate: BaseTitleFieldTemplate,
  DescriptionFieldTemplate: BaseDescriptionFieldTemplate,
  ErrorListTemplate: BaseErrorListTemplate,
};

export const derivaWidgets: RegistryWidgetsType = {
  TextWidget,
  TextareaWidget,
  CheckboxWidget,
  SelectWidget,
};
