/**
 * lib/error-explainer.js — Maps validation errors to plain-language explanations.
 */

/**
 * @typedef {{ title: string, description: string, fix: string }} Explanation
 */

/**
 * Explain a validation error in plain language.
 * @param {{ field: string, message: string, error_type?: string, allowed?: string[], pattern?: string }} err
 * @returns {Explanation}
 */
export function explainError(err) {
  // TODO: implement
  throw new Error('not implemented');
}
