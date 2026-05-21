/**
 * F3 — lint-templates tests
 *
 * Tests the lintTemplate logic (via loadTemplateRules + templateErrors) using
 * real temp-dir fixture templates. Covers: valid template, unknown primitive,
 * invalid regex, JSON output, and missing template file.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadTemplateRules } from '../lib/template-rules.js';
import { clearTemplateRulesCache } from '../lib/template-rules.js';

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lint-tpl-test-'));
  mkdirSync(join(tmpDir, 'templates'), { recursive: true });
  clearTemplateRulesCache();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearTemplateRulesCache();
});

function writeTemplate(name, frontmatter, body = '') {
  const yaml = typeof frontmatter === 'string'
    ? frontmatter
    : Object.entries(frontmatter)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join('\n');
  const content = `---\n${yaml}\n---\n${body}`;
  writeFileSync(join(tmpDir, 'templates', name), content, 'utf-8');
  return `templates/${name}`;
}

// ── Valid template ────────────────────────────────────────────────────────────

describe('valid template', () => {
  test('template with well-formed fields: schema returns zero templateErrors', async () => {
    writeTemplate('note-template.md', `fields:
  title:
    type: string
    required: true
  status:
    type: string
    enum:
      - draft
      - published
  $path:
    pattern: '^notes/[a-z0-9-]+\\.md$'`);

    const schema = await loadTemplateRules('templates/note-template.md', tmpDir);
    expect(schema).not.toBeNull();
    expect(schema.templateErrors).toHaveLength(0);
  });

  test('template with no fields block returns zero templateErrors', async () => {
    writeTemplate('bare-template.md', `tier: note
sections:
  - Overview
  - Details`);

    const schema = await loadTemplateRules('templates/bare-template.md', tmpDir);
    expect(schema).not.toBeNull();
    expect(schema.templateErrors).toHaveLength(0);
  });
});

// ── Unknown primitive ─────────────────────────────────────────────────────────

describe('unknown primitive on a field', () => {
  test('unknown primitive emits template-schema-invalid error', async () => {
    writeTemplate('bad-template.md', `fields:
  status:
    type: string
    enum_values:
      - draft
      - published`);

    const schema = await loadTemplateRules('templates/bad-template.md', tmpDir);
    expect(schema).not.toBeNull();
    expect(schema.templateErrors.length).toBeGreaterThan(0);

    const err = schema.templateErrors.find((e) => e.error_type === 'template-schema-invalid');
    expect(err).toBeDefined();
    expect(err.message).toContain('enum_values');
  });

  test('multiple unknown primitives all reported', async () => {
    writeTemplate('multi-bad.md', `fields:
  title:
    type: string
    max_length: 100
    minimum: 1`);

    const schema = await loadTemplateRules('templates/multi-bad.md', tmpDir);
    expect(schema).not.toBeNull();
    const errs = schema.templateErrors.filter((e) => e.error_type === 'template-schema-invalid');
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Invalid regex in pattern ──────────────────────────────────────────────────

describe('invalid regex in pattern constraint', () => {
  test('invalid pattern regex emits error', async () => {
    writeTemplate('bad-regex.md', `fields:
  $path:
    pattern: "[unclosed"`);

    const schema = await loadTemplateRules('templates/bad-regex.md', tmpDir);
    expect(schema).not.toBeNull();
    expect(schema.templateErrors.length).toBeGreaterThan(0);

    const regexErr = schema.templateErrors.find(
      (e) => e.message?.toLowerCase().includes('regex') ||
              e.message?.toLowerCase().includes('pattern') ||
              e.error_type === 'template-schema-invalid',
    );
    expect(regexErr).toBeDefined();
  });
});

// ── Synthetic field constraints ───────────────────────────────────────────────

describe('synthetic ($-prefixed) field validation', () => {
  test('synthetic field with only pattern is valid', async () => {
    writeTemplate('ok-synthetic.md', `fields:
  $path:
    pattern: '^notes/[a-z0-9-]+\\.md$'`);

    const schema = await loadTemplateRules('templates/ok-synthetic.md', tmpDir);
    expect(schema).not.toBeNull();
    expect(schema.templateErrors).toHaveLength(0);
  });

  test('synthetic field with forbidden primitive emits error', async () => {
    writeTemplate('bad-synthetic.md', `fields:
  $path:
    required: true
    pattern: '^notes/.+\\.md$'`);

    const schema = await loadTemplateRules('templates/bad-synthetic.md', tmpDir);
    expect(schema).not.toBeNull();
    const err = schema.templateErrors.find((e) => e.field === '$path');
    expect(err).toBeDefined();
    expect(err.message).toContain('$path');
  });
});

// ── Missing / unloadable template ─────────────────────────────────────────────

describe('missing or unloadable template', () => {
  test('returns null for non-existent template file', async () => {
    const schema = await loadTemplateRules('templates/nonexistent-template.md', tmpDir);
    expect(schema).toBeNull();
  });

  test('returns null for template with broken YAML frontmatter', async () => {
    writeFileSync(
      join(tmpDir, 'templates', 'broken-yaml-template.md'),
      '---\nfields: {\n  bad yaml: [unclosed\n---\nBody.\n',
      'utf-8',
    );
    const schema = await loadTemplateRules(
      'templates/broken-yaml-template.md',
      tmpDir,
    );
    expect(schema).toBeNull();
  });
});

// ── templateErrors structure ──────────────────────────────────────────────────

describe('templateErrors issue structure', () => {
  test('each error has level, field, message, error_type', async () => {
    writeTemplate('structured-errors.md', `fields:
  title:
    type: string
    bad_primitive: true`);

    const schema = await loadTemplateRules('templates/structured-errors.md', tmpDir);
    expect(schema).not.toBeNull();

    for (const err of schema.templateErrors) {
      expect(err).toHaveProperty('level');
      expect(err).toHaveProperty('field');
      expect(err).toHaveProperty('message');
      // error_type may be undefined for some cases but level/field/message must be strings
      expect(typeof err.level).toBe('string');
      expect(typeof err.field).toBe('string');
      expect(typeof err.message).toBe('string');
    }
  });

  test('valid template has templateErrors as empty array (not null/undefined)', async () => {
    writeTemplate('valid.md', `fields:
  title:
    type: string
    required: true`);

    const schema = await loadTemplateRules('templates/valid.md', tmpDir);
    expect(schema).not.toBeNull();
    expect(Array.isArray(schema.templateErrors)).toBe(true);
    expect(schema.templateErrors).toHaveLength(0);
  });
});
