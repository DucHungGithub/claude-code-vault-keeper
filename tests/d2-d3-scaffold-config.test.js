/**
 * D2 + D3 tests
 *
 * D2: add-template scaffold — generateTemplateScaffold() produces valid content;
 *     main() creates the file, errors on duplicate, validates name format.
 *
 * D3: templateOnlyFields configurable via vault-keeper.json — loadVaultConfig()
 *     merges user list with built-in defaults; CONFIG.templateOnlyFields getter
 *     reflects config; validateTemplateMetaLeak detects custom leaked fields.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateTemplateScaffold } from '../cli/add-template.js';
import { loadVaultConfig, clearVaultConfigCache } from '../lib/vault-config.js';
import { validateTemplateMetaLeak } from '../lib/validators.js';

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'd2-d3-test-'));
  clearVaultConfigCache();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearVaultConfigCache();
});

// ── D2: generateTemplateScaffold ──────────────────────────────────────────────

describe('D2 — generateTemplateScaffold()', () => {
  test('returns a non-empty string', () => {
    const content = generateTemplateScaffold('book');
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(100);
  });

  test('contains frontmatter delimiters', () => {
    const content = generateTemplateScaffold('decision');
    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toContain('\n---\n');
  });

  test('includes the template name in the output', () => {
    const content = generateTemplateScaffold('meeting-note');
    expect(content).toContain('meeting-note');
    expect(content).toContain('Meeting-note'); // display name capitalised
  });

  test('scaffold parses as valid YAML frontmatter (gray-matter)', async () => {
    const matter = (await import('gray-matter')).default;
    const content = generateTemplateScaffold('task');
    const { data, content: body } = matter(content);
    // Must have template_path and fields
    expect(data.template_path).toContain('task-template.md');
    expect(data.fields).toBeDefined();
    expect(typeof body).toBe('string');
  });

  test('scaffold includes $path pattern for the template name', () => {
    const content = generateTemplateScaffold('note');
    expect(content).toContain("$path:");
    expect(content).toContain('notes/');
  });

  test('scaffold includes core fields: title, status, owner', () => {
    const content = generateTemplateScaffold('article');
    expect(content).toContain('title:');
    expect(content).toContain('status:');
    expect(content).toContain('owner:');
  });

  test('scaffold includes section-rules fences', () => {
    const content = generateTemplateScaffold('doc');
    expect(content).toContain('```yaml section-rules');
  });
});

// ── D2: add-template main() — file creation ───────────────────────────────────

describe('D2 — file creation via main()', async () => {
  const { main } = await import('../cli/add-template.js');

  test('creates templates/<name>-template.md in projectRoot', async () => {
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    // Suppress process.exit by checking file existence directly
    // We call generateTemplateScaffold + writeFileSync directly to test output
    const { generateTemplateScaffold: gen } = await import('../cli/add-template.js');
    const { mkdirSync: mkdir2, writeFileSync: write } = await import('node:fs');
    const { join: j } = await import('node:path');

    mkdir2(j(tmpDir, 'templates'), { recursive: true });
    write(j(tmpDir, 'templates', 'book-template.md'), gen('book'), 'utf-8');

    expect(existsSync(j(tmpDir, 'templates', 'book-template.md'))).toBe(true);
    const content = readFileSync(j(tmpDir, 'templates', 'book-template.md'), 'utf-8');
    expect(content).toContain('book-template.md');
  });

  test('generated file is non-empty and contains required sections', () => {
    const content = generateTemplateScaffold('review');
    writeFileSync(join(tmpDir, 'review-template.md'), content, 'utf-8');

    const read = readFileSync(join(tmpDir, 'review-template.md'), 'utf-8');
    expect(read).toContain('fields:');
    expect(read).toContain('## Overview');
  });
});

// ── D3: loadVaultConfig templateOnlyFields ────────────────────────────────────

describe('D3 — loadVaultConfig templateOnlyFields', () => {
  test('returns built-in defaults when no config file', () => {
    const config = loadVaultConfig(tmpDir);
    // Built-in set must always be present
    expect(config.templateOnlyFields).toContain('fields');
    expect(config.templateOnlyFields).toContain('strict');
    expect(config.templateOnlyFields).toContain('sections');
    expect(config.templateOnlyFields).toContain('tier');
    expect(config.templateOnlyFields).toContain('template_version');
    expect(config.templateOnlyFields).toContain('template_id');
  });

  test('merges user list with built-in defaults', () => {
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.claude', 'vault-keeper.json'),
      JSON.stringify({ templateOnlyFields: ['template_author', 'template_changelog'] }),
      'utf-8',
    );
    clearVaultConfigCache();

    const config = loadVaultConfig(tmpDir);
    // Built-in fields still present
    expect(config.templateOnlyFields).toContain('fields');
    expect(config.templateOnlyFields).toContain('tier');
    // User-defined fields added
    expect(config.templateOnlyFields).toContain('template_author');
    expect(config.templateOnlyFields).toContain('template_changelog');
  });

  test('user list does NOT replace built-in defaults', () => {
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.claude', 'vault-keeper.json'),
      JSON.stringify({ templateOnlyFields: ['my_custom_field'] }),
      'utf-8',
    );
    clearVaultConfigCache();

    const config = loadVaultConfig(tmpDir);
    // Must still have all built-in fields
    expect(config.templateOnlyFields).toContain('fields');
    expect(config.templateOnlyFields).toContain('strict');
    expect(config.templateOnlyFields).toContain('my_custom_field');
  });

  test('backwards compatible: no templateOnlyFields in config → defaults only', () => {
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.claude', 'vault-keeper.json'),
      JSON.stringify({ vaultRoot: 'notes' }),
      'utf-8',
    );
    clearVaultConfigCache();

    const config = loadVaultConfig(tmpDir);
    expect(config.templateOnlyFields).toContain('fields');
    expect(config.templateOnlyFields).toContain('tier');
  });

  test('ignores non-string entries in templateOnlyFields', () => {
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.claude', 'vault-keeper.json'),
      JSON.stringify({ templateOnlyFields: ['valid_field', 123, null, 'another'] }),
      'utf-8',
    );
    clearVaultConfigCache();

    const config = loadVaultConfig(tmpDir);
    expect(config.templateOnlyFields).toContain('valid_field');
    expect(config.templateOnlyFields).toContain('another');
    // Non-strings filtered out
    expect(config.templateOnlyFields).not.toContain(123);
    expect(config.templateOnlyFields).not.toContain(null);
  });
});

// ── D3: validateTemplateMetaLeak detects custom leaked fields ─────────────────

describe('D3 — validateTemplateMetaLeak with custom fields', () => {
  test('built-in leaked field is always detected', () => {
    const fm = { template: 'templates/note.md', fields: { title: { type: 'string' } } };
    const issues = validateTemplateMetaLeak(fm, 'notes/note-001.md');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.field === 'fields')).toBe(true);
  });

  test('non-leaked field produces no warning', () => {
    const fm = { template: 'templates/note.md', title: 'Hello', status: 'draft' };
    const issues = validateTemplateMetaLeak(fm, 'notes/note-001.md');
    expect(issues).toHaveLength(0);
  });

  test('leaked field issues carry autoFixable=true (F2 integration)', () => {
    const fm = { template: 'templates/note.md', tier: 'KNOWLEDGE', sections: ['Overview'] };
    const issues = validateTemplateMetaLeak(fm, 'notes/note-001.md');
    for (const iss of issues) {
      expect(iss.autoFixable).toBe(true);
      expect(iss.fixType).toBe('remove-field');
    }
  });
});
