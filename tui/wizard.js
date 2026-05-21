#!/usr/bin/env node
/**
 * tui/wizard.js — Interactive vault setup wizard.
 *
 * Guides new users through vault configuration with step-by-step prompts.
 * Uses raw terminal I/O (no external deps) for select + text input.
 *
 * Usage (via vault-keeper wizard):
 *   vault-keeper wizard           # interactive setup in current dir
 *   vault-keeper wizard ./mydir   # setup in specific directory
 *
 * Flow:
 *   1. "What kind of vault are you building?"
 *      → obsidian / zettelkasten / adr / book-notes / custom
 *   2. "Where are your notes?" (folder path)
 *   3. "What's your primary template name?" (for custom only)
 *   4. Scaffold the vault + show next steps
 *
 * Outputs the same files as `vault-keeper init --preset <name>`.
 */

// TODO: implement
export async function main(_argv = []) {
  console.log('vault-keeper wizard — coming soon');
  return 0;
}
