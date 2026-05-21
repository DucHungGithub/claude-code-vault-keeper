#!/usr/bin/env node
/**
 * add-template — scaffold a new template file for the vault.
 *
 * Generates `templates/<name>-template.md` with a complete v0.9.0
 * composable-schema skeleton: fields block, $path pattern, section-rules
 * fences, and inline comments explaining each primitive.
 *
 * Usage (via multi-tool entry):
 *   vault-keeper add-template <name>
 *   vault-keeper add-template <name> --root <path>
 *   vault-keeper add-template <name> --force   (overwrite existing)
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveProjectRoot } from '../lib/vault-config.js';

/**
 * Generate the scaffold content for a new template.
 *
 * @param {string} name - template name (e.g. "book", "decision")
 * @returns {string} full markdown content for the template file
 */
export function generateTemplateScaffold(name) {
  // Capitalize first letter for display
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);

  return `---
# ── Template metadata ────────────────────────────────────────────────────────
template_path: templates/${name}-template.md
document_type: ${name}

# tier: groups this template in LSP completions (e.g. KNOWLEDGE, ENGINEERING)
# tier: KNOWLEDGE

# sections: declares the canonical H2 heading order for the formatter.
# Headings not listed here are allowed (unless strict: true below).
# sections:
#   - Overview
#   - Details
#   - References

# strict: true → reject frontmatter keys not declared in fields:
# strict: false

# ── Field schema ─────────────────────────────────────────────────────────────
# Each key under fields: is a frontmatter field name.
# Primitives: type, required, enum, pattern, min, max, exists, uniqueItems
# Modifiers (expanded form): { value: ..., when: "expr", severity: warning }
fields:

  # Enforce the file path pattern (synthetic field, not written to frontmatter)
  $path:
    pattern: '^${name}s/[a-z0-9-]+-[a-z0-9-]+\\.md$'
    # ^ Edit this regex to match where your ${name} docs live.
    # Example: '^docs/${name}s/${name}-\\d{3}-[a-z0-9-]+\\.md$'

  # Required: document must declare which template it uses
  template:
    required: true

  title:
    type: string
    required: true
    description: Human-readable title of the ${name}

  status:
    type: string
    required: true
    enum:
      - draft
      - review
      - published
      - archived
    # State machine: uncomment to enforce valid transitions via previous_status
    # (requires document to carry previous_status field when status changes)

  owner:
    type: string
    required: true
    description: Person or team responsible for this ${name}

  # created:
  #   type: date
  #   required: true

  # tags:
  #   type: array
  #   uniqueItems: true

  # score:
  #   type: integer
  #   min: 1
  #   max: 10

  # related_doc:
  #   type: string
  #   exists: true   # validates that the referenced file exists in the repo
---

# ${displayName} template

<!-- This is a scaffold. Edit the frontmatter fields: block above to match
     your ${name} schema, then replace these section bodies with your actual
     content structure. Remove this comment when done. -->

## Overview

\`\`\`yaml section-rules
required: true
\`\`\`

Describe the ${name} here.

## Details

Content and specifics.

## References

\`\`\`yaml section-rules
required: false
\`\`\`

Links and related documents.
`;
}

/**
 * Main entry point — called by cli/main.js dispatch.
 *
 * @param {string[]} argv - args after the 'add-template' subcommand token
 */
export async function main(argv = []) {
  const force = argv.includes('--force');
  const cliRoot = argv.includes('--root')
    ? argv[argv.indexOf('--root') + 1]
    : undefined;

  // Positional: first non-flag, non-value arg is the template name
  const flagsWithValue = new Set(['--root']);
  const positional = argv.filter((a, i) => {
    if (a.startsWith('--')) return false;
    if (i > 0 && flagsWithValue.has(argv[i - 1])) return false;
    return true;
  });

  const name = positional[0];
  if (!name) {
    console.error('Usage: vault-keeper add-template <name> [--root <path>] [--force]');
    console.error('Example: vault-keeper add-template decision');
    process.exit(1);
  }

  // Validate name: lowercase slugs only
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    console.error(`Invalid template name: "${name}"`);
    console.error('Names must be lowercase slugs (letters, digits, hyphens). Example: "book" or "meeting-note"');
    process.exit(1);
  }

  const projectRoot = resolveProjectRoot({ root: cliRoot });
  const templatesDir = join(projectRoot, 'templates');
  const outPath = resolve(templatesDir, `${name}-template.md`);

  if (existsSync(outPath) && !force) {
    console.error(`Template already exists: ${outPath}`);
    console.error('Pass --force to overwrite.');
    process.exit(1);
  }

  mkdirSync(templatesDir, { recursive: true });
  const content = generateTemplateScaffold(name);
  writeFileSync(outPath, content, 'utf-8');

  console.log(`✅ Created: templates/${name}-template.md`);
  console.log(`   Edit the fields: block to match your ${name} schema.`);
  console.log(`   Run 'vault-keeper lint-templates' to validate the new template.`);
}
