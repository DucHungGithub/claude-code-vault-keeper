/**
 * T2 — focused tests for file-existence validation
 *
 * In v0.9.0, file-existence checking is split into two mechanisms:
 *
 * 1. `validatePaths(fm, body)` — detects relative path syntax (../  ./)
 *    in frontmatter relationship objects and in prose body text.
 *    Already has good unit tests in validate-documents.test.js; this file
 *    adds edge cases not covered there.
 *
 * 2. `exists` primitive in schema-engine — checks that a string field value
 *    is a repo-relative path that actually exists on disk. Wired via
 *    `docMeta.fileExists` in validateDocument(). Unit tests exist in
 *    schema-engine.test.js; this file adds integration tests with a real
 *    temp filesystem.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validatePaths } from '../lib/validators.js';
import { applyFieldSchema } from '../lib/schema-engine.js';
import { validateDocument } from '../cli/validate-documents.js';

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 't2-link-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(rel, content) {
  const abs = join(tmpDir, rel);
  mkdirSync(abs.substring(0, abs.lastIndexOf('/')), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
  return abs;
}

// ── validatePaths — edge cases not covered in validate-documents.test.js ─────

describe('validatePaths — edge cases', () => {
  test('no relationships key → no issues', () => {
    const fm = { template: 'templates/note.md', title: 'Hello', status: 'draft' };
    expect(validatePaths(fm, '')).toEqual([]);
  });

  test('empty relationships object → no issues', () => {
    expect(validatePaths({ relationships: {} }, '')).toEqual([]);
  });

  test('relationships with empty arrays → no issues', () => {
    const fm = { relationships: { parent: [], implements: [] } };
    expect(validatePaths(fm, '')).toEqual([]);
  });

  test('relationship items without path key → no issues', () => {
    // Items may carry {id, title} without a path — these should not be flagged
    const fm = { relationships: { related: [{ id: 'prd-001', title: 'PRD' }] } };
    expect(validatePaths(fm, '')).toEqual([]);
  });

  test('body anchor link with relative prefix is detected', () => {
    // './doc.md#section' — the leading ./ is the relative-path signal
    const body = 'See also ["./doc.md#section"](./doc.md#section).';
    const issues = validatePaths({}, body);
    // The body scan catches quoted relative paths regardless of anchor
    expect(issues.some((i) => i.field === 'body')).toBe(true);
  });

  test('absolute path with anchor in body → no issues', () => {
    // 'docs/note.md#section' — absolute, anchor stripped conceptually
    const body = 'See [link](docs/note.md#section) for details.';
    expect(validatePaths({}, body)).toEqual([]);
  });

  test('numeric frontmatter values → no issues (not treated as paths)', () => {
    const fm = { count: 42, ratio: 0.5, active: true };
    expect(validatePaths(fm, '')).toEqual([]);
  });

  test('null frontmatter value → no issues', () => {
    const fm = { relationships: null };
    expect(validatePaths(fm, '')).toEqual([]);
  });

  test('relative path in body inside code block → no warning (code-region skip)', () => {
    const body = '# Doc\n\n```js\nconst p = require("./utils.js");\n```\n\nDone.';
    // Code regions are stripped before the relative-path scan
    const issues = validatePaths({}, body);
    expect(issues).toHaveLength(0);
  });

  test('two different relationship types with one relative each → 2 errors', () => {
    const fm = {
      relationships: {
        parent: [{ path: '../parent.md' }],
        child:  [{ path: './child.md' }],
      },
    };
    const errors = validatePaths(fm, '').filter((i) => i.level === 'error');
    expect(errors).toHaveLength(2);
  });
});

// ── exists primitive — unit (applyFieldSchema with fileExists callback) ───────

describe('exists primitive — applyFieldSchema with fileExists callback', () => {
  test('file exists → no issues', () => {
    writeFile('docs/target.md', '---\ntitle: Target\n---');

    const schema = { fields: { ref: { type: 'string', exists: true } } };
    const fm = { ref: 'docs/target.md' };
    const docMeta = { repoRelativePath: 'notes/doc.md', fileExists: (p) => p === 'docs/target.md' };

    const issues = applyFieldSchema(schema, fm, docMeta);
    expect(issues).toHaveLength(0);
  });

  test('file does not exist → exists-missing error', () => {
    const schema = { fields: { ref: { type: 'string', exists: true } } };
    const fm = { ref: 'docs/missing.md' };
    const docMeta = { repoRelativePath: 'notes/doc.md', fileExists: () => false };

    const issues = applyFieldSchema(schema, fm, docMeta);
    expect(issues).toHaveLength(1);
    expect(issues[0].error_type).toBe('exists-missing');
    expect(issues[0].message).toContain('missing.md');
  });

  test('null/missing field value → no exists check (required handles it)', () => {
    const schema = { fields: { ref: { exists: true } } };
    const fm = {};
    const docMeta = { repoRelativePath: 'notes/doc.md', fileExists: () => false };

    // No value → exists primitive skips (not-required field simply absent)
    const issues = applyFieldSchema(schema, fm, docMeta);
    expect(issues).toHaveLength(0);
  });

  test('non-string value → exists check skipped', () => {
    const schema = { fields: { count: { exists: true } } };
    const fm = { count: 42 };
    const docMeta = { repoRelativePath: 'notes/doc.md', fileExists: () => false };

    const issues = applyFieldSchema(schema, fm, docMeta);
    expect(issues).toHaveLength(0);
  });

  test('exists:false → no file check performed', () => {
    // exists: false is a no-op (the primitive only fires when param is truthy)
    const schema = { fields: { ref: { type: 'string', exists: false } } };
    const fm = { ref: 'docs/missing.md' };
    const docMeta = { repoRelativePath: 'notes/doc.md', fileExists: () => false };

    const issues = applyFieldSchema(schema, fm, docMeta);
    expect(issues).toHaveLength(0);
  });
});

// ── exists primitive — integration via validateDocument + real filesystem ─────

describe('exists primitive — validateDocument integration', () => {
  test('field references existing file → valid document', async () => {
    // Create template with exists: true on a `related` field
    writeFile('templates/note-template.md', `---
fields:
  template:
    required: true
  title:
    type: string
    required: true
  related:
    type: string
    exists: true
---
# Note template
`);
    // Create the referenced file
    writeFile('notes/other.md', '---\ntitle: Other\n---');
    // Create the document
    const docPath = writeFile('notes/doc.md', `---
template: templates/note-template.md
title: My Note
related: notes/other.md
---
# My Note
`);

    const result = await validateDocument(docPath, { projectRoot: tmpDir });
    const existsErrors = result.errors.filter((e) => e.error_type === 'exists-missing');
    expect(existsErrors).toHaveLength(0);
  });

  test('field references missing file → exists-missing error', async () => {
    writeFile('templates/note-template.md', `---
fields:
  template:
    required: true
  title:
    type: string
    required: true
  related:
    type: string
    exists: true
---
# Note template
`);
    const docPath = writeFile('notes/doc.md', `---
template: templates/note-template.md
title: My Note
related: notes/nonexistent.md
---
# My Note
`);

    const result = await validateDocument(docPath, { projectRoot: tmpDir });
    const existsErrors = result.errors.filter((e) => e.error_type === 'exists-missing');
    expect(existsErrors).toHaveLength(1);
    expect(existsErrors[0].message).toContain('nonexistent.md');
    expect(existsErrors[0].fix).toBeDefined();
  });

  test('optional exists field absent → no exists-missing error', async () => {
    writeFile('templates/note-template.md', `---
fields:
  template:
    required: true
  title:
    type: string
    required: true
  related:
    type: string
    exists: true
---
# Note template
`);
    const docPath = writeFile('notes/doc.md', `---
template: templates/note-template.md
title: My Note
---
# My Note
`);

    const result = await validateDocument(docPath, { projectRoot: tmpDir });
    // `related` is optional (no `required: true`) and absent → no exists error
    const existsErrors = result.errors.filter((e) => e.error_type === 'exists-missing');
    expect(existsErrors).toHaveLength(0);
  });

  test('exists check uses repo-relative paths (not absolute)', async () => {
    writeFile('templates/asset-template.md', `---
fields:
  template:
    required: true
  title:
    type: string
    required: true
  asset:
    type: string
    exists: true
---
# Asset template
`);
    writeFile('assets/logo.png', 'binary');
    const docPath = writeFile('docs/doc.md', `---
template: templates/asset-template.md
title: Doc
asset: assets/logo.png
---
# Doc
`);

    const result = await validateDocument(docPath, { projectRoot: tmpDir });
    const existsErrors = result.errors.filter((e) => e.error_type === 'exists-missing');
    expect(existsErrors).toHaveLength(0);
  });
});
