/**
 * TDD tests for tui/wizard.js
 *
 * RED: fail until runWizardWithAnswers() is implemented.
 *
 * The wizard's interactive prompts are tested through a non-interactive
 * `runWizardWithAnswers(answers, targetDir)` function that bypasses stdin.
 * This makes the wizard fully testable in CI without mocking readline.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadTemplateRules, clearTemplateRulesCache } from '../lib/template-rules.js';
import { validateDocument } from '../cli/validate-documents.js';

async function importWizard() {
  return import('../tui/wizard.js');
}

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wizard-test-'));
  clearTemplateRulesCache();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearTemplateRulesCache();
});

// ── Module contract ───────────────────────────────────────────────────────────

describe('tui/wizard.js — exports', () => {
  test('exports runWizardWithAnswers function', async () => {
    const { runWizardWithAnswers } = await importWizard();
    expect(typeof runWizardWithAnswers).toBe('function');
  });

  test('exports WIZARD_STEPS array', async () => {
    const { WIZARD_STEPS } = await importWizard();
    expect(Array.isArray(WIZARD_STEPS)).toBe(true);
    expect(WIZARD_STEPS.length).toBeGreaterThanOrEqual(2);
  });

  test('exports getWizardChoices function', async () => {
    const { getWizardChoices } = await importWizard();
    expect(typeof getWizardChoices).toBe('function');
  });
});

// ── WIZARD_STEPS structure ────────────────────────────────────────────────────

describe('WIZARD_STEPS', () => {
  test('each step has id, question, and type', async () => {
    const { WIZARD_STEPS } = await importWizard();
    for (const step of WIZARD_STEPS) {
      expect(typeof step.id, `step ${step.id} has id`).toBe('string');
      expect(typeof step.question, `step ${step.id} has question`).toBe('string');
      expect(['select', 'input', 'confirm'], `step ${step.id} has valid type`).toContain(step.type);
    }
  });

  test('first step asks about vault type (select)', async () => {
    const { WIZARD_STEPS } = await importWizard();
    const first = WIZARD_STEPS[0];
    expect(first.type).toBe('select');
    // Should offer preset choices
    expect(Array.isArray(first.choices)).toBe(true);
    expect(first.choices.length).toBeGreaterThanOrEqual(4);
  });

  test('preset choices include obsidian, zettelkasten, adr, book-notes, custom', async () => {
    const { WIZARD_STEPS } = await importWizard();
    const presetStep = WIZARD_STEPS.find(s => s.id === 'preset');
    expect(presetStep).toBeDefined();
    const values = presetStep.choices.map(c => c.value);
    expect(values).toContain('obsidian');
    expect(values).toContain('zettelkasten');
    expect(values).toContain('adr');
    expect(values).toContain('book-notes');
    expect(values).toContain('custom');
  });
});

// ── runWizardWithAnswers — obsidian preset ────────────────────────────────────

describe('runWizardWithAnswers — obsidian preset', () => {
  test('creates vault files in targetDir', async () => {
    const { runWizardWithAnswers } = await importWizard();
    await runWizardWithAnswers({ preset: 'obsidian' }, tmpDir);

    expect(existsSync(join(tmpDir, '.claude', 'vault-keeper.json'))).toBe(true);
    const { readdirSync } = await import('node:fs');
    const templates = readdirSync(join(tmpDir, 'templates'));
    expect(templates.some(f => f.endsWith('-template.md'))).toBe(true);
  });

  test('vault-keeper.json is valid JSON', async () => {
    const { runWizardWithAnswers } = await importWizard();
    await runWizardWithAnswers({ preset: 'obsidian' }, tmpDir);

    const cfg = JSON.parse(readFileSync(join(tmpDir, '.claude', 'vault-keeper.json'), 'utf-8'));
    expect(typeof cfg).toBe('object');
  });

  test('sample document is valid against template', async () => {
    const { runWizardWithAnswers } = await importWizard();
    await runWizardWithAnswers({ preset: 'obsidian' }, tmpDir);

    const { readdirSync } = await import('node:fs');
    // Find sample docs (non-template .md files)
    const allFiles = readdirSync(join(tmpDir, 'notes'));
    const sampleDoc = join(tmpDir, 'notes', allFiles[0]);

    const result = await validateDocument(sampleDoc, { projectRoot: tmpDir });
    expect(
      result.errors.map(e => e.message),
      'sample doc should have no validation errors',
    ).toHaveLength(0);
  });
});

// ── runWizardWithAnswers — zettelkasten preset ────────────────────────────────

describe('runWizardWithAnswers — zettelkasten preset', () => {
  test('creates permanent and fleeting folders', async () => {
    const { runWizardWithAnswers } = await importWizard();
    await runWizardWithAnswers({ preset: 'zettelkasten' }, tmpDir);

    expect(existsSync(join(tmpDir, 'permanent'))).toBe(true);
    expect(existsSync(join(tmpDir, 'fleeting'))).toBe(true);
  });

  test('creates two templates', async () => {
    const { runWizardWithAnswers } = await importWizard();
    await runWizardWithAnswers({ preset: 'zettelkasten' }, tmpDir);

    const { readdirSync } = await import('node:fs');
    const templates = readdirSync(join(tmpDir, 'templates'))
      .filter(f => f.endsWith('-template.md'));
    expect(templates.length).toBeGreaterThanOrEqual(2);
  });
});

// ── runWizardWithAnswers — all presets produce valid templates ────────────────

describe('runWizardWithAnswers — all presets: template lint', () => {
  const presets = ['obsidian', 'zettelkasten', 'adr', 'book-notes'];

  for (const preset of presets) {
    test(`${preset}: all templates pass validateTemplateSchema`, async () => {
      const { runWizardWithAnswers } = await importWizard();
      await runWizardWithAnswers({ preset }, tmpDir);

      const { readdirSync } = await import('node:fs');
      const templates = readdirSync(join(tmpDir, 'templates'))
        .filter(f => f.endsWith('-template.md'));

      for (const tpl of templates) {
        const schema = await loadTemplateRules(`templates/${tpl}`, tmpDir);
        expect(schema, `${preset}/${tpl} should load`).not.toBeNull();
        expect(
          schema.templateErrors,
          `${preset}/${tpl} should have 0 templateErrors`,
        ).toHaveLength(0);
      }
    });
  }
});

// ── runWizardWithAnswers — unknown preset ─────────────────────────────────────

describe('runWizardWithAnswers — error handling', () => {
  test('throws for unknown preset', async () => {
    const { runWizardWithAnswers } = await importWizard();
    await expect(
      runWizardWithAnswers({ preset: 'nonexistent' }, tmpDir),
    ).rejects.toThrow();
  });

  test('returns a result object with success flag', async () => {
    const { runWizardWithAnswers } = await importWizard();
    const result = await runWizardWithAnswers({ preset: 'obsidian' }, tmpDir);
    expect(typeof result).toBe('object');
    expect(result.success).toBe(true);
    expect(typeof result.preset).toBe('string');
    expect(typeof result.targetDir).toBe('string');
  });
});
