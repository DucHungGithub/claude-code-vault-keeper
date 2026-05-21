/**
 * prompt.js — Minimal interactive prompts for the TUI wizard.
 *
 * Zero dependencies. Uses raw terminal mode (stdin setRawMode) for
 * keyboard navigation. Works in any ANSI-compatible terminal.
 *
 * Exports:
 *   select(question, choices)  — arrow-key single-select
 *   input(question, default)   — text input with inline editing
 *   confirm(question)          — Y/n boolean
 */

import { fg, style, cursor } from './ansi.js';

const KEY = {
  ctrlC: '\x03',
  enter: '\r',
  enterAlt: '\n',
  up: '\x1b[A',
  down: '\x1b[B',
};

/**
 * Calculate the next selected index for a select prompt.
 *
 * @param {number} current
 * @param {number} length
 * @param {'up'|'down'} direction
 * @returns {number}
 */
export function nextChoiceIndex(current, length, direction) {
  if (length <= 0) return 0;
  if (direction === 'up') return (current - 1 + length) % length;
  return (current + 1) % length;
}

/**
 * Arrow-key single-select prompt.
 *
 * @param {string} question
 * @param {Array<{label: string, value: string, description?: string}>} choices
 * @returns {Promise<string>} selected value
 */
export async function select(question, choices) {
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('select() requires at least one choice');
  }

  if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    return selectRaw(question, choices);
  }

  return selectNumbered(question, choices);
}

function selectNumbered(question, choices) {
  process.stdout.write(`\n${style.bold(question)}\n`);
  choices.forEach((c, i) => {
    const desc = c.description ? fg.gray(`  — ${c.description}`) : '';
    process.stdout.write(`  ${fg.cyan(String(i + 1))}. ${c.label}${desc}\n`);
  });
  process.stdout.write(`\nChoice [1-${choices.length}]: `);

  return new Promise((resolve) => {
    let buf = '';
    const onData = (chunk) => {
      const ch = chunk.toString();
      if (ch === '\n' || ch === '\r') {
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
        const idx = parseInt(buf.trim(), 10) - 1;
        const choice = choices[Math.max(0, Math.min(choices.length - 1, idx || 0))];
        process.stdout.write(`${fg.green('→')} ${choice.label}\n`);
        resolve(choice.value);
      } else {
        buf += ch;
        process.stdout.write(ch);
      }
    };
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', onData);
  });
}

function selectRaw(question, choices) {
  return new Promise((resolve, reject) => {
    let selected = 0;

    const render = () => {
      process.stdout.write(cursor.clearScreen);
      process.stdout.write(`\n${style.bold(question)}\n\n`);
      choices.forEach((choice, index) => {
        const active = index === selected;
        const marker = active ? fg.brightCyan('›') : ' ';
        const label = active ? style.bold(choice.label) : choice.label;
        const desc = choice.description ? fg.gray(`  — ${choice.description}`) : '';
        process.stdout.write(`  ${marker} ${label}${desc}\n`);
      });
      process.stdout.write(fg.gray('\nUse ↑/↓ and Enter to select.\n'));
    };

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(cursor.show);
    };

    const finish = () => {
      const choice = choices[selected];
      cleanup();
      process.stdout.write(`${fg.green('→')} ${choice.label}\n`);
      resolve(choice.value);
    };

    const cancel = () => {
      cleanup();
      reject(new Error('Prompt cancelled'));
    };

    const onData = (chunk) => {
      const key = chunk.toString('utf-8');
      if (key === KEY.ctrlC) return cancel();
      if (key === KEY.enter || key === KEY.enterAlt) return finish();
      if (key === KEY.up) {
        selected = nextChoiceIndex(selected, choices.length, 'up');
        render();
        return;
      }
      if (key === KEY.down) {
        selected = nextChoiceIndex(selected, choices.length, 'down');
        render();
        return;
      }

      const numeric = Number.parseInt(key, 10);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length) {
        selected = numeric - 1;
        render();
      }
    };

    process.stdout.write(cursor.hide);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', onData);
    render();
  });
}

/**
 * Text input prompt with optional default value.
 *
 * @param {string} question
 * @param {string} [defaultValue]
 * @returns {Promise<string>}
 */
export async function input(question, defaultValue = '') {
  const hint = defaultValue ? fg.gray(` (${defaultValue})`) : '';
  process.stdout.write(`\n${style.bold(question)}${hint}: `);

  return new Promise((resolve) => {
    let buf = '';
    const onData = (chunk) => {
      const ch = chunk.toString();
      if (ch === '\n' || ch === '\r') {
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
        const value = buf.trim() || defaultValue;
        process.stdout.write(`${fg.green('→')} ${value}\n`);
        resolve(value);
      } else if (ch === '\x7f') {
        // Backspace
        buf = buf.slice(0, -1);
        process.stdout.write(`${cursor.clearLine}${style.bold(question)}${hint}: ${buf}`);
      } else {
        buf += ch;
        process.stdout.write(ch);
      }
    };
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', onData);
  });
}

/**
 * Yes/No confirm prompt.
 *
 * @param {string} question
 * @param {boolean} [defaultYes=true]
 * @returns {Promise<boolean>}
 */
export async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? fg.gray(' [Y/n]') : fg.gray(' [y/N]');
  process.stdout.write(`\n${style.bold(question)}${hint}: `);

  return new Promise((resolve) => {
    const onData = (chunk) => {
      const ch = chunk.toString().trim().toLowerCase();
      process.stdin.removeListener('data', onData);
      process.stdin.pause();
      const yes = ch === '' ? defaultYes : ch === 'y';
      process.stdout.write(`${yes ? fg.green('yes') : fg.yellow('no')}\n`);
      resolve(yes);
    };
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', onData);
  });
}
