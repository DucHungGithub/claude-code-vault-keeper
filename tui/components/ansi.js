/**
 * ansi.js — ANSI escape code helpers for terminal UI.
 *
 * Zero dependencies. Works in any ANSI-compatible terminal (macOS Terminal,
 * iTerm2, Windows Terminal, VS Code integrated terminal, GitHub Actions).
 *
 * Exports:
 *   colors     — fg/bg color factories
 *   style      — bold, dim, italic, underline, reset
 *   cursor     — show, hide, move, clear
 *   box        — draw a Unicode box with title
 *   bar        — render a progress/fill bar
 */

// ── ANSI escape sequences ──────────────────────────────────────────────────
const ESC = '\x1b[';

// ── Colors ────────────────────────────────────────────────────────────────
export const fg = {
  black:   (s) => `${ESC}30m${s}${ESC}0m`,
  red:     (s) => `${ESC}31m${s}${ESC}0m`,
  green:   (s) => `${ESC}32m${s}${ESC}0m`,
  yellow:  (s) => `${ESC}33m${s}${ESC}0m`,
  blue:    (s) => `${ESC}34m${s}${ESC}0m`,
  magenta: (s) => `${ESC}35m${s}${ESC}0m`,
  cyan:    (s) => `${ESC}36m${s}${ESC}0m`,
  white:   (s) => `${ESC}37m${s}${ESC}0m`,
  gray:    (s) => `${ESC}90m${s}${ESC}0m`,
  // Bright variants
  brightGreen:  (s) => `${ESC}92m${s}${ESC}0m`,
  brightYellow: (s) => `${ESC}93m${s}${ESC}0m`,
  brightRed:    (s) => `${ESC}91m${s}${ESC}0m`,
  brightCyan:   (s) => `${ESC}96m${s}${ESC}0m`,
};

// ── Styles ────────────────────────────────────────────────────────────────
export const style = {
  bold:      (s) => `${ESC}1m${s}${ESC}0m`,
  dim:       (s) => `${ESC}2m${s}${ESC}0m`,
  italic:    (s) => `${ESC}3m${s}${ESC}0m`,
  underline: (s) => `${ESC}4m${s}${ESC}0m`,
  reset:     `${ESC}0m`,
};

// ── Cursor ────────────────────────────────────────────────────────────────
export const cursor = {
  hide:        `${ESC}?25l`,
  show:        `${ESC}?25h`,
  up:          (n = 1) => `${ESC}${n}A`,
  down:        (n = 1) => `${ESC}${n}B`,
  clearLine:   `${ESC}2K\r`,
  clearScreen: `${ESC}2J${ESC}H`,
};

// ── Box drawing ───────────────────────────────────────────────────────────
/**
 * Draw a Unicode box around content lines.
 *
 * @param {string[]} lines - content lines (no newlines)
 * @param {object} opts
 * @param {string} [opts.title] - title shown in top border
 * @param {number} [opts.width] - total box width (auto if omitted)
 * @returns {string} multi-line box string
 */
export function box(lines, { title = '', width } = {}) {
  const innerWidth = width
    ? width - 2
    : Math.max(title.length + 2, ...lines.map((l) => stripAnsi(l).length)) + 2;

  const topBorder = title
    ? `┌─ ${title} ${'─'.repeat(Math.max(0, innerWidth - title.length - 2))}┐`
    : `┌${'─'.repeat(innerWidth)}┐`;

  const bottomBorder = `└${'─'.repeat(innerWidth)}┘`;

  const paddedLines = lines.map((l) => {
    const visible = stripAnsi(l).length;
    const pad = Math.max(0, innerWidth - visible - 2);
    return `│ ${l}${' '.repeat(pad)} │`;
  });

  return [topBorder, ...paddedLines, bottomBorder].join('\n');
}

/**
 * Render a filled progress bar.
 *
 * @param {number} value  - 0..1 fill ratio
 * @param {number} width  - total bar width in characters
 * @param {object} [opts]
 * @param {string} [opts.fill='█']  - filled char
 * @param {string} [opts.empty='░'] - empty char
 * @returns {string}
 */
export function bar(value, width, { fill = '█', empty = '░' } = {}) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * width);
  return fill.repeat(filled) + empty.repeat(width - filled);
}

/**
 * Strip ANSI escape codes from a string for length measurement.
 * @param {string} s
 * @returns {string}
 */
export function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}
