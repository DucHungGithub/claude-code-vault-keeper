/**
 * Load and normalize a template's schema from its frontmatter and body.
 *
 * Templates are markdown files whose frontmatter MAY include:
 *
 *   fields:          # Record<string, object> — field schema (composable primitives)
 *   strict: true     # bool — reject undeclared frontmatter keys
 *   sections: [...]  # string[] — formatter ordering vocabulary
 *   tier: "..."      # string — template tier label
 *
 * The body carries per-section `yaml section-rules` fences parsed into a
 * BodySchemaNode tree by `parseBodySchema`.
 *
 * `loadTemplateRules(templatePath, projectRoot)` returns null when:
 *   - templatePath is empty/null
 *   - the file does not exist
 *   - the frontmatter is malformed YAML
 *
 * Otherwise it returns the full schema object (even if `fields:` is absent —
 * the template may still carry body section-rules or other top-level keys).
 *
 * 100% generic — zero field names, zero section names, zero domain knowledge.
 */

import { readFile } from "fs/promises";
import { join, isAbsolute } from "path";
import matter from "gray-matter";
import { parseBodySchema } from "./template-section-rules.js";
import {
  validateTemplateSchema,
  validateBodyTemplateSchema,
} from "./schema-engine.js";

/**
 * @typedef {import('./template-section-rules.js').BodySchemaNode} BodySchemaNode
 */

/**
 * @typedef {object} TemplateSchema
 * @property {Record<string, object>|undefined} fields - field schema from frontmatter `fields:`
 * @property {boolean} strict - reject undeclared frontmatter keys
 * @property {string[]} sections - formatter ordering vocabulary
 * @property {string|null} tier - template tier label
 * @property {BodySchemaNode[]} bodySchema - parsed body section-rules tree
 * @property {Array<{level: string, field: string, message: string, error_type: string, fix?: string}>} templateErrors - meta-validation issues
 */

/**
 * Load a template's schema from disk.
 *
 * @param {string} templatePath - absolute or repo-relative path
 * @param {string} [projectRoot] - repo root for relative resolution
 * @returns {Promise<TemplateSchema|null>} null only if file missing or frontmatter won't parse
 */
export async function loadTemplateRules(templatePath, projectRoot = process.cwd()) {
  if (!templatePath) return null;

  const absPath = isAbsolute(templatePath)
    ? templatePath
    : join(projectRoot, templatePath);

  let content;
  try {
    content = await readFile(absPath, "utf-8");
  } catch {
    return null;
  }

  let frontmatter, body;
  try {
    const parsed = matter(content);
    frontmatter = parsed.data;
    body = parsed.content || "";
  } catch {
    return null;
  }

  // A template with valid frontmatter always returns an object — even if
  // `fields:` is absent. The template may carry body section-rules, tier,
  // sections, or strict mode independently.
  if (!frontmatter || typeof frontmatter !== "object") return null;

  // Extract top-level keys.
  const fields = frontmatter.fields != null && typeof frontmatter.fields === "object"
    ? frontmatter.fields
    : undefined;

  const strict = frontmatter.strict === true;

  const sections = Array.isArray(frontmatter.sections)
    ? [...frontmatter.sections]
    : [];

  const tier = typeof frontmatter.tier === "string" ? frontmatter.tier : null;

  // Parse body into BodySchemaNode tree.
  const bodySchema = parseBodySchema(body);

  // Run meta-validation on both fields and body schema.
  const fieldErrors = validateTemplateSchema(fields);
  const bodyErrors = validateBodyTemplateSchema(bodySchema);
  const templateErrors = [...fieldErrors, ...bodyErrors];

  return {
    fields,
    strict,
    sections,
    tier,
    bodySchema,
    templateErrors,
  };
}
