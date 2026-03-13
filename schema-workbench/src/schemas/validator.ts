/**
 * Custom AJV validator for RJSF that handles:
 * - Cross-schema $ref resolution (all 21 schemas pre-loaded)
 * - Deriva-specific custom validation keywords (no-op for now)
 *
 * The custom keywords (valid-column, valid-source-key, etc.) are
 * catalog-aware validators in the canonical schemas. We register them
 * as no-ops here since the form editor doesn't have live catalog context.
 * These can be upgraded to live-validate against the connected catalog later.
 */

import { customizeValidator } from "@rjsf/validator-ajv8";
import type { CustomValidatorOptionsType } from "@rjsf/validator-ajv8";
import { SCHEMA_BY_ID } from "./index";

/** Deriva-specific custom validation keywords to register as no-ops. */
const CUSTOM_KEYWORDS = [
  "valid-column",
  "valid-source-key",
  "valid-source-path",
  "valid-constraint",
  "valid-table",
] as const;

/**
 * Create the RJSF validator with all schemas pre-loaded,
 * custom keywords registered, and strict mode off.
 */
function createValidatorWithKeywords() {
  const keywordDefs = CUSTOM_KEYWORDS.map((keyword) => ({
    keyword,
    validate: () => true,
    errors: false as const,
  }));

  const options: CustomValidatorOptionsType = {
    ajvOptionsOverrides: {
      schemas: Object.values(SCHEMA_BY_ID),
      strict: false,
      keywords: keywordDefs,
    },
  };

  return customizeValidator(options);
}

/** Singleton validator instance — shared across all SchemaFormEditor instances. */
export const derivaValidator = createValidatorWithKeywords();
