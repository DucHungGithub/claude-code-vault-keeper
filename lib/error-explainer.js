/**
 * lib/error-explainer.js — Maps validation errors to plain-language explanations.
 *
 * All returned strings are plain text — no HTML tags.
 */

/**
 * @typedef {{ title: string, description: string, fix: string }} Explanation
 */

/**
 * Explain a validation error in plain language with actionable fix instructions.
 *
 * @param {{ field: string, message: string, error_type?: string, allowed?: string[], pattern?: string }} err
 * @returns {Explanation}
 */
export function explainError(err) {
  const field = String(err.field || 'unknown');
  const message = String(err.message || '');
  const errorType = String(err.error_type || detectErrorType(message));
  const allowed = Array.isArray(err.allowed) ? err.allowed : [];
  const pattern = String(err.pattern || '');

  switch (errorType) {
    case 'required':
      return {
        title: 'Missing required field',
        description: 'The field "' + field + '" must be present in the document frontmatter. It is defined as required by the template.',
        fix: 'Add "' + field + ':" to the frontmatter of this document. Check the template for the expected value format.',
      };

    case 'enum': {
      const options = allowed.length > 0 ? allowed : extractEnumFromMessage(message);
      const optionList = options.length > 0 ? options.join(', ') : 'the values listed in the template';
      return {
        title: 'Invalid field value',
        description: 'The value for "' + field + '" is not one of the allowed options defined in the template.',
        fix: 'Set "' + field + '" to one of: ' + optionList + '.',
      };
    }

    case 'pattern':
      return {
        title: 'Value format mismatch',
        description: 'The value for "' + field + '" does not match the required format pattern.',
        fix: 'Ensure the value for "' + field + '" matches the required pattern' + (pattern ? ': ' + pattern : '') + '. Check the template definition for examples.',
      };

    case 'type':
      return {
        title: 'Wrong field type',
        description: 'The value for "' + field + '" has the wrong data type. The template specifies a particular type for this field.',
        fix: 'Check the template definition for "' + field + '" and provide a value of the correct type (e.g. string, integer, date, boolean).',
      };

    case 'min':
    case 'max':
      return {
        title: 'Value out of range',
        description: 'The value for "' + field + '" does not meet the length or range requirement.',
        fix: 'Check the template definition for "' + field + '" and provide a value within the allowed range.',
      };

    case 'exists':
      return {
        title: 'Referenced file not found',
        description: 'The value for "' + field + '" should be a path to a file that exists in the vault, but no file was found at that path.',
        fix: 'Make sure the file referenced by "' + field + '" exists in the vault, or update the value to point to an existing file.',
      };

    case 'unique':
      return {
        title: 'Duplicate values',
        description: 'The array field "' + field + '" contains duplicate items, but the template requires all items to be unique.',
        fix: 'Remove duplicate values from the "' + field + '" array.',
      };

    default:
      return {
        title: 'Validation error',
        description: message || 'This document does not meet the requirements defined in its template.',
        fix: 'Review the template definition for "' + field + '" and correct the value to match the template rules.',
      };
  }
}

/** Infer error type from message string when error_type is not set. */
function detectErrorType(message) {
  const lower = message.toLowerCase();
  if (lower.includes('required') || lower.includes('missing')) return 'required';
  if (lower.includes('enum') || lower.includes('allowed') || lower.includes('invalid value')) return 'enum';
  if (lower.includes('pattern') || lower.includes('format') || lower.includes('does not match')) return 'pattern';
  if (lower.includes('type') || lower.includes('expected')) return 'type';
  if (lower.includes('exist') || lower.includes('not found')) return 'exists';
  if (lower.includes('unique') || lower.includes('duplicate')) return 'unique';
  if (lower.includes('min') || lower.includes('too short') || lower.includes('too few')) return 'min';
  if (lower.includes('max') || lower.includes('too long') || lower.includes('too many')) return 'max';
  return 'unknown';
}

/** Extract enum values from an error message like 'must be one of: draft, review, approved' */
function extractEnumFromMessage(message) {
  const colonIdx = message.lastIndexOf(':');
  if (colonIdx < 0) return [];
  return message.slice(colonIdx + 1).split(',').map((s) => s.trim()).filter(Boolean);
}
