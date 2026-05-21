/**
 * TDD tests for `vault-keeper init --preset <name>`
 *
 * RED: these tests fail until --preset is implemented in cli/main.js
 *
 * Presets scaffold opinionated vaults for common PKM workflows:
 *   obsidian   — note-taking with tags, aliases, MOC pattern
 *   zettelkasten — atomic notes with unique IDs + permanent/fleeting split
 *   adr        — Architecture Decision Records (software teams)
 *   book-notes — book annotation vault with author, rating, status
 *   ai-workspace — context docs, tool registry, AI instructions
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadTemplateRules, clearTemplateRulesCache } from '../lib/template-rules.js';
import { validateDocument } from '../cli/validate-documents.js';

// We test runInit by importing getPreset and generateScaffold helpers
// that will be exported from cli/main.js once implemented.
// For now we import the main() function and test via subprocess or direct call.

// Helper: import the init module
async function importInit() {
  // Will be exported once implemented
  const mod = await import('../cli/init-presets.js');
  return mod;
}

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'init-preset-test-'));
  clearTemplateRulesCache();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearTemplateRulesCache();
});

// ── Contract: module exists and exports expected surface ──────────────────────

describe('init-presets module', () => {
  test('exports PRESETS map with expected keys', async () => {
    const { PRESETS } = await importInit();
    expect(typeof PRESETS).toBe('object');
    expect('obsidian').toBeOneOf(Object.keys(PRESETS));
    expect('zettelkasten').toBeOneOf(Object.keys(PRESETS));
    expect('adr').toBeOneOf(Object.keys(PRESETS));
    expect('book-notes').toBeOneOf(Object.keys(PRESETS));
    expect('ai-workspace').toBeOneOf(Object.keys(PRESETS));
  });

  test('each preset has name, description, and files array', async () => {
    const { PRESETS } = await importInit();
    for (const [id, preset] of Object.entries(PRESETS)) {
      expect(typeof preset.name, `${id}.name`).toBe('string');
      expect(typeof preset.description, `${id}.description`).toBe('string');
      expect(Array.isArray(preset.files), `${id}.files`).toBe(true);
      expect(preset.files.length, `${id} has at least 3 files`).toBeGreaterThanOrEqual(3);
      for (const f of preset.files) {
        expect(typeof f.path, `${id} file.path`).toBe('string');
        expect(typeof f.content, `${id} file.content`).toBe('string');
      }
    }
  });

  test('exports scaffoldPreset(presetId, targetDir) function', async () => {
    const { scaffoldPreset } = await importInit();
    expect(typeof scaffoldPreset).toBe('function');
  });
});

// ── scaffoldPreset creates expected files ─────────────────────────────────────

describe('scaffoldPreset — file creation', () => {
  test('obsidian preset creates vault-keeper.json, template, and sample note', async () => {
    const { scaffoldPreset } = await importInit();
    scaffoldPreset('obsidian', tmpDir);

    expect(existsSync(join(tmpDir, '.claude', 'vault-keeper.json'))).toBe(true);
    const hasTemplate = existsSync(join(tmpDir, 'templates')) &&
      require('node:fs').readdirSync(join(tmpDir, 'templates'))
        .some(f => f.endsWith('-template.md'));
    // Check templates dir has at least one template
    const { readdirSync } = await import('node:fs');
    const templates = readdirSync(join(tmpDir, 'templates'));
    expect(templates.some(f => f.endsWith('-template.md'))).toBe(true);
  });

  test('zettelkasten preset creates correct folder structure', async () => {
    const { scaffoldPreset } = await importInit();
    scaffoldPreset('zettelkasten', tmpDir);

    expect(existsSync(join(tmpDir, '.claude', 'vault-keeper.json'))).toBe(true);
    const { readdirSync } = await import('node:fs');
    const templates = readdirSync(join(tmpDir, 'templates'));
    expect(templates.some(f => f.endsWith('-template.md'))).toBe(true);
  });

  test('adr preset creates an ADR template', async () => {
    const { scaffoldPreset } = await importInit();
    scaffoldPreset('adr', tmpDir);

    const { readdirSync } = await import('node:fs');
    const templates = readdirSync(join(tmpDir, 'templates'));
    expect(templates.some(f => f.includes('adr') || f.includes('decision'))).toBe(true);
  });

  test('book-notes preset creates book template with required fields', async () => {
    const { scaffoldPreset } = await importInit();
    scaffoldPreset('book-notes', tmpDir);

    const { readdirSync } = await import('node:fs');
    const templates = readdirSync(join(tmpDir, 'templates'));
    expect(templates.some(f => f.includes('book'))).toBe(true);
    // Book template should mention author or rating
    const bookTpl = templates.find(f => f.includes('book'));
    const content = readFileSync(join(tmpDir, 'templates', bookTpl), 'utf-8');
    expect(content).toContain('author');
  });

  test('ai-workspace preset creates context, tool, and AI context templates', async () => {
    const { scaffoldPreset } = await importInit();
    scaffoldPreset('ai-workspace', tmpDir);

    const { readdirSync } = await import('node:fs');
    const templates = readdirSync(join(tmpDir, 'templates'));
    expect(templates).toContain('context-template.md');
    expect(templates).toContain('tool-template.md');
    expect(templates).toContain('ai-context-template.md');

    const config = JSON.parse(readFileSync(join(tmpDir, '.claude', 'vault-keeper.json'), 'utf-8'));
    expect(config.vaultFolders).toEqual(['contexts', 'tools', 'ai-context']);
  });

  test('throws or returns error for unknown preset id', async () => {
    const { scaffoldPreset } = await importInit();
    expect(() => scaffoldPreset('nonexistent-preset', tmpDir)).toThrow();
  });
});

// ── Template quality: each preset's template passes lint-templates ────────────

describe('scaffoldPreset — template validity (lint)', () => {
  const presetIds = ['obsidian', 'zettelkasten', 'adr', 'book-notes', 'ai-workspace'];

  for (const presetId of presetIds) {
    test(`${presetId} template passes validateTemplateSchema`, async () => {
      const { scaffoldPreset } = await importInit();
      scaffoldPreset(presetId, tmpDir);

      const { readdirSync } = await import('node:fs');
      const templates = readdirSync(join(tmpDir, 'templates'))
        .filter(f => f.endsWith('-template.md'));

      expect(templates.length).toBeGreaterThan(0);

      for (const tplFile of templates) {
        const tplRelPath = `templates/${tplFile}`;
        const schema = await loadTemplateRules(tplRelPath, tmpDir);
        expect(schema, `${presetId}/${tplFile} should load`).not.toBeNull();
        expect(
          schema.templateErrors,
          `${presetId}/${tplFile} should have zero templateErrors`,
        ).toHaveLength(0);
      }
    });
  }
});

// ── Sample document: each preset's sample doc passes validation ───────────────

describe('scaffoldPreset — sample doc validates', () => {
  const presetIds = ['obsidian', 'zettelkasten', 'adr', 'book-notes', 'ai-workspace'];

  for (const presetId of presetIds) {
    test(`${presetId} sample document is valid`, async () => {
      const { scaffoldPreset, PRESETS } = await importInit();
      scaffoldPreset(presetId, tmpDir);

      // Find sample docs (non-template .md files)
      const preset = PRESETS[presetId];
      const sampleDocs = preset.files
        .filter(f => !f.path.includes('templates/') && !f.path.includes('.claude/'))
        .filter(f => f.path.endsWith('.md'));

      expect(sampleDocs.length, `${presetId} has at least 1 sample doc`).toBeGreaterThan(0);

      for (const { path } of sampleDocs) {
        const absPath = join(tmpDir, path);
        const result = await validateDocument(absPath, { projectRoot: tmpDir });
        expect(
          result.errors,
          `${presetId} sample doc ${path} should have no errors. Got: ${result.errors.map(e => e.message).join(', ')}`,
        ).toHaveLength(0);
      }
    });
  }
});

// ── vault-keeper.json config is valid JSON with required fields ───────────────

describe('scaffoldPreset — vault-keeper.json', () => {
  test('each preset produces valid vault-keeper.json', async () => {
    const { scaffoldPreset, PRESETS } = await importInit();
    for (const presetId of Object.keys(PRESETS)) {
      // Fresh dir for each preset
      const dir = mkdtempSync(join(tmpdir(), `vk-${presetId}-`));
      try {
        scaffoldPreset(presetId, dir);
        const cfgPath = join(dir, '.claude', 'vault-keeper.json');
        expect(existsSync(cfgPath), `${presetId} creates vault-keeper.json`).toBe(true);
        const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
        expect(typeof cfg.vaultRoot === 'string' || Array.isArray(cfg.vaultFolders)).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });
});
