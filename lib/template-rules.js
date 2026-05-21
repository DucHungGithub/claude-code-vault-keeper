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

import { readFile, stat } from "fs/promises";
import { join, isAbsolute } from "path";
import matter from "gray-matter";
import { parseBodySchema } from "./template-section-rules.js";
import {
  validateTemplateSchema,
  validateBodyTemplateSchema,
} from "./schema-engine.js";

// ── Template schema cache ───────────────────────────────────────────────────
// Keyed by absolute path → { rules, mtime }. Avoids re-reading + re-parsing the
// same template file on every doc validation. Invalidated per-entry when the
// file's mtime changes. Mirrors the mtime-cache pattern used in vault-config.js.
const _cache = new Map();

/**
 * Clear the in-memory template schema cache.
 * Call this in tests (beforeEach) or after programmatic template edits.
 */
export function clearTemplateRulesCache() {
  _cache.clear();
}

/**
 * Build a fresh top-level schema object from a cached one, copying the mutable
 * arrays so a caller mutating the result cannot corrupt the cached entry. This
 * preserves the defensive-copy guarantee the non-cached path provides while
 * still skipping the expensive disk read + parse + meta-validation.
 *
 * @param {object} rules - cached TemplateSchema
 * @returns {object} a new TemplateSchema with copied arrays
 */
function cloneSchema(rules) {
  return {
    fields: rules.fields,
    strict: rules.strict,
    sections: [...rules.sections],
    tier: rules.tier,
    bodySchema: rules.bodySchema,
    templateErrors: [...rules.templateErrors],
  };
}

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

  // ── Cache check ──────────────────────────────────────────────────────────
  // stat() first to detect mtime changes. If the file is missing, return null
  // immediately (do not cache missing files — they might appear later).
  let mtime;
  try {
    const s = await stat(absPath);
    mtime = s.mtimeMs;
  } catch {
    return null; // file not found or not accessible
  }

  const cached = _cache.get(absPath);
  if (cached && cached.mtime === mtime) {
    // Cache hit — skip the disk read + parse + meta-validation (the dominant
    // cost). Return a fresh top-level object with the mutable arrays copied so
    // callers keep the defensive-copy guarantee they had before caching; a
    // caller mutating result.sections must not corrupt the cached entry.
    return cloneSchema(cached.rules);
  }

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

  const rules = {
    fields,
    strict,
    sections,
    tier,
    bodySchema,
    templateErrors,
  };

  // Store in cache keyed by absPath + mtime for next call. Return a defensive
  // copy (same as the cache-hit path) so the caller can never mutate the
  // cached entry's arrays.
  _cache.set(absPath, { rules, mtime });

  return cloneSchema(rules);
}
