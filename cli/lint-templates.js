#!/usr/bin/env node
/**
 * lint-templates — meta-validate all template files in the vault.
 *
 * Templates declare the schema that documents must conform to. A broken
 * template causes confusing errors on every document that references it.
 * This command validates the templates themselves — before running the full
 * validate pass — so authors catch authoring mistakes at the source.
 *
 * Checks performed (via lib/schema-engine.js validateTemplateSchema +
 * validateBodyTemplateSchema, already wired inside loadTemplateRules):
 *   - Unknown primitives on fields
 *   - Invalid modifiers in expanded-form constraints
 *   - Synthetic ($-prefixed) fields using unsupported primitives
 *   - Invalid regex in `pattern` constraints
 *   - Malformed `enum` (must be array)
 *   - Invalid `type` values
 *   - Malformed section-rules fences in template body
 *
 * Usage (via multi-tool entry):
 *   vault-keeper lint-templates [template-path ...]
 *   vault-keeper lint-templates --json
 *   vault-keeper lint-templates --root <path>
 *
 * Exit codes:
 *   0  all templates valid
 *   1  one or more templates have issues, or runtime error
 */

import { join, relative } from 'node:path';
import { glob } from 'glob';
import { resolveProjectRoot } from '../lib/vault-config.js';
import { loadTemplateRules } from '../lib/template-rules.js';

/**
 * Lint a single template file.
 *
 * @param {string} templateRelPath - repo-relative path (e.g. 'templates/prd-template.md')
 * @param {string} projectRoot     - absolute vault root
 * @returns {{ path: string, issues: Issue[], loadError: string|null }}
 */
async function lintTemplate(templateRelPath, projectRoot) {
  const schema = await loadTemplateRules(templateRelPath, projectRoot);
  if (schema === null) {
    // loadTemplateRules returns null when the file is missing or YAML is broken.
    // Surface this as a load error distinct from schema issues.
    return {
      path: templateRelPath,
      issues: [],
      loadError: `Cannot load template '${templateRelPath}' — file not found or malformed YAML`,
    };
  }
  return {
    path: templateRelPath,
    issues: schema.templateErrors ?? [],
    loadError: null,
  };
}

/**
 * Discover all template files in the vault.
 *
 * @param {string[]} explicit  - explicit paths passed on CLI (relative or absolute)
 * @param {string}   projectRoot
 * @returns {string[]} repo-relative paths
 */
async function discoverTemplates(explicit, projectRoot) {
  if (explicit.length > 0) {
    return explicit.map((p) => {
      // Accept both absolute and repo-relative forms
      const rel = p.startsWith(projectRoot) ? relative(projectRoot, p) : p;
      return rel.replace(/\\/g, '/');
    });
  }
  const found = glob.sync('templates/*-template.md', { cwd: projectRoot });
  return found.sort();
}

/**
 * Main entry point — called by cli/main.js dispatch.
 *
 * @param {string[]} argv - args after the 'lint-templates' subcommand token
 */
export async function main(argv = []) {
  const wantJson = argv.includes('--json');
  const cliRoot = argv.includes('--root')
    ? argv[argv.indexOf('--root') + 1]
    : undefined;
  const resolvedRoot = resolveProjectRoot({ root: cliRoot });

  // Positional args that are not flags or flag-values
  const flagNames = new Set(['--json', '--root']);
  const explicit = argv.filter((a, i) => {
    if (a.startsWith('--')) return false;
    if (i > 0 && flagNames.has(argv[i - 1])) return false; // value of --root
    return true;
  });

  const templatePaths = await discoverTemplates(explicit, resolvedRoot);

  if (templatePaths.length === 0) {
    if (!wantJson) {
      console.log('No templates found. Expected templates/*-template.md files.');
    } else {
      console.log(JSON.stringify({ total: 0, withIssues: 0, results: [] }, null, 2));
    }
    process.exit(0);
  }

  // Lint all templates (sequential to avoid fd exhaustion on large vaults)
  const results = [];
  for (const tplPath of templatePaths) {
    results.push(await lintTemplate(tplPath, resolvedRoot));
  }

  const withIssues = results.filter((r) => r.loadError || r.issues.length > 0);
  const total = results.length;

  if (wantJson) {
    console.log(JSON.stringify({ total, withIssues: withIssues.length, results }, null, 2));
    process.exit(withIssues.length > 0 ? 1 : 0);
  }

  // Human-readable output
  console.log('');
  for (const r of results) {
    if (r.loadError) {
      console.log(`🚨 ${r.path}`);
      console.log(`   Load error: ${r.loadError}`);
    } else if (r.issues.length === 0) {
      console.log(`✅ ${r.path} — valid`);
    } else {
      const noun = r.issues.length === 1 ? 'issue' : 'issues';
      console.log(`📋 ${r.path} — ${r.issues.length} ${noun}`);
      for (const iss of r.issues) {
        const icon = iss.level === 'error' ? '🚨' : '⚠️ ';
        const fieldTag = iss.field ? `[field: ${iss.field}] ` : '';
        console.log(`   ${icon} ${fieldTag}${iss.message}`);
        if (iss.fix) {
          console.log(`      💡 Fix: ${iss.fix}`);
        }
      }
    }
  }

  // Summary line
  console.log('');
  if (withIssues.length === 0) {
    console.log(`✅ All ${total} template${total === 1 ? '' : 's'} valid.`);
  } else {
    console.log(`⚠️  ${withIssues.length} of ${total} template${total === 1 ? '' : 's'} with issues.`);
  }

  process.exit(withIssues.length > 0 ? 1 : 0);
}
