#!/usr/bin/env node
/**
 * tui/wizard.js — Interactive vault setup wizard.
 *
 * Guides new users through vault configuration with step-by-step prompts.
 * Uses tui/components/prompt.js for terminal I/O (no external deps).
 *
 * Two entry points:
 *   main(argv)                         — interactive (reads stdin)
 *   runWizardWithAnswers(answers, dir) — non-interactive (for tests / CI)
 *
 * Flow:
 *   1. "What kind of vault?" → select preset (obsidian / zettelkasten / adr / book-notes / ai-workspace / custom)
 *   2. "Where?" → input directory path (default: current dir)
 *   3. Scaffold preset files
 *   4. Show next steps
 */

import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fg, style } from './components/ansi.js';
import { scaffoldPreset, PRESETS } from '../cli/init-presets.js';

// ── Wizard step definitions ───────────────────────────────────────────────────

export const WIZARD_STEPS = [
  {
    id: 'preset',
    type: 'select',
    question: 'What kind of vault are you building?',
    choices: [
      {
        value: 'obsidian',
        label: 'Obsidian notes',
        description: 'Tags, aliases, Map-of-Content pattern',
      },
      {
        value: 'zettelkasten',
        label: 'Zettelkasten',
        description: 'Atomic notes with permanent/fleeting split',
      },
      {
        value: 'adr',
        label: 'Architecture Decision Records',
        description: 'ADR log for software teams',
      },
      {
        value: 'book-notes',
        label: 'Book notes',
        description: 'Author, rating, reading status',
      },
      {
        value: 'ai-workspace',
        label: 'AI workspace',
        description: 'Context docs, tool registry, AI instructions',
      },
      {
        value: 'custom',
        label: 'Custom / blank',
        description: 'Minimal skeleton — define your own templates',
      },
    ],
  },
  {
    id: 'dir',
    type: 'input',
    question: 'Where should I initialize the vault folder?',
    default: '.',
  },
];

// ── getWizardChoices ──────────────────────────────────────────────────────────

/**
 * Get the choices array for a specific wizard step.
 * @param {string} stepId
 * @returns {Array}
 */
export function getWizardChoices(stepId) {
  const step = WIZARD_STEPS.find(s => s.id === stepId);
  return step?.choices ?? [];
}

// ── runWizardWithAnswers (non-interactive / testable) ─────────────────────────

/**
 * Run the wizard with pre-supplied answers (no stdin required).
 * Used by tests and CI. Returns a result object.
 *
 * @param {{ preset: string, dir?: string }} answers
 * @param {string} targetDir - absolute path to scaffold into
 * @returns {Promise<{ success: boolean, preset: string, targetDir: string }>}
 */
export async function runWizardWithAnswers(answers, targetDir) {
  const { preset } = answers;

  if (preset !== 'custom' && !PRESETS[preset]) {
    throw new Error(
      `Unknown preset '${preset}'. Available: ${Object.keys(PRESETS).join(', ')}, custom`,
    );
  }

  mkdirSync(targetDir, { recursive: true });

  if (preset === 'custom') {
    // Minimal skeleton: just vault-keeper.json + a blank note template
    const { SCAFFOLD_VAULT_CONFIG, SCAFFOLD_TEMPLATE, SCAFFOLD_DOC } =
      await import('../cli/main.js').catch(() => null) ?? {};

    // Fallback: inline minimal scaffold if main.js can't be imported as a module
    const { writeFileSync, mkdirSync: mkdir2 } = await import('node:fs');
    const { join, dirname } = await import('node:path');

    const files = [
      {
        path: join(targetDir, '.claude', 'vault-keeper.json'),
        content: JSON.stringify({ vaultRoot: '.', vaultFolders: ['notes'] }, null, 2) + '\n',
      },
      {
        path: join(targetDir, 'templates', 'note-template.md'),
        content: `---\ntemplate_path: templates/note-template.md\ndocument_type: note\nfields:\n  template:\n    required: true\n  title:\n    type: string\n    required: true\n---\n\n# Note template\n`,
      },
      {
        path: join(targetDir, 'notes', 'note-001-hello.md'),
        content: `---\ntemplate: templates/note-template.md\ndocument_type: note\ntitle: Hello vault\n---\n\n# Hello vault\n`,
      },
    ];

    for (const { path, content } of files) {
      mkdir2(dirname(path), { recursive: true });
      writeFileSync(path, content, 'utf-8');
    }
  } else {
    scaffoldPreset(preset, targetDir);
  }

  return { success: true, preset, targetDir };
}

// ── main (interactive) ────────────────────────────────────────────────────────

export async function main(argv = []) {
  const { select, input } = await import('./components/prompt.js');

  console.log('');
  console.log(style.bold(fg.cyan('✦ vault-keeper setup wizard')));
  console.log(fg.gray('  Answer a few questions to scaffold your vault.\n'));

  // Step 1: preset
  const presetStep = WIZARD_STEPS[0];
  const presetId = await select(presetStep.question, presetStep.choices);

  // Step 2: directory
  const dirStep = WIZARD_STEPS[1];
  const dirInput = await input(dirStep.question, dirStep.default);
  const targetDir = resolve(process.cwd(), dirInput);

  // Guard: non-empty existing dir without --force
  if (existsSync(targetDir)) {
    const { readdirSync } = await import('node:fs');
    const entries = readdirSync(targetDir);
    if (entries.length > 0 && !argv.includes('--force')) {
      console.log('');
      console.log(fg.yellow(`⚠️  ${targetDir} is not empty.`));
      const { confirm } = await import('./components/prompt.js');
      const ok = await confirm('Scaffold inside it anyway?', false);
      if (!ok) {
      console.log(fg.gray('\nAborted.'));
      return 1;
      }
    }
  }

  // Scaffold
  console.log('');
  const result = await runWizardWithAnswers({ preset: presetId }, targetDir);

  // Success banner
  console.log('');
  console.log(style.bold(fg.brightGreen('✅ Vault ready!')));
  console.log('');

  const presetName = PRESETS[presetId]?.name ?? 'custom';
  console.log(`  Preset:  ${style.bold(presetName)}`);
  console.log(`  Init folder: ${fg.cyan(targetDir)}`);
  console.log('');
  console.log(style.bold('Next steps:'));
  console.log(`  ${fg.cyan('cd')} ${dirInput === '.' ? '.' : dirInput}`);
  console.log(`  ${fg.cyan('vault-keeper validate')}    — check your vault`);
  console.log(`  ${fg.cyan('vault-keeper tui')}         — live terminal dashboard`);
  console.log(`  ${fg.cyan('vault-keeper dashboard')}   — HTML report in browser`);
  console.log('');

  return 0;
}
