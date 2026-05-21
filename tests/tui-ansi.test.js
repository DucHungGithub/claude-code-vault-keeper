/**
 * TDD tests for tui/components/ansi.js
 *
 * Tests the ANSI building blocks used by both wizard and dashboard.
 */

import { describe, test, expect } from 'bun:test';
import { fg, style, bar, box, stripAnsi } from '../tui/components/ansi.js';
import { nextChoiceIndex } from '../tui/components/prompt.js';

describe('stripAnsi', () => {
  test('strips ANSI color codes', () => {
    expect(stripAnsi('\x1b[32mhello\x1b[0m')).toBe('hello');
  });

  test('strips bold + color', () => {
    expect(stripAnsi('\x1b[1m\x1b[31merror\x1b[0m')).toBe('error');
  });

  test('leaves plain text unchanged', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });

  test('empty string', () => {
    expect(stripAnsi('')).toBe('');
  });
});

describe('fg colors', () => {
  test('wraps text in ANSI codes', () => {
    const result = fg.green('ok');
    expect(result).toContain('ok');
    expect(result).toContain('\x1b[');
    expect(stripAnsi(result)).toBe('ok');
  });

  test('all color functions produce non-empty output', () => {
    for (const [name, fn] of Object.entries(fg)) {
      const out = fn('x');
      expect(out.length, `fg.${name}`).toBeGreaterThan(1);
      expect(stripAnsi(out), `fg.${name} stripped`).toBe('x');
    }
  });
});

describe('style', () => {
  test('bold wraps text', () => {
    const result = style.bold('important');
    expect(stripAnsi(result)).toBe('important');
    expect(result).toContain('\x1b[1m');
  });
});

describe('bar', () => {
  test('full bar at value=1', () => {
    expect(bar(1, 10)).toBe('██████████');
  });

  test('empty bar at value=0', () => {
    expect(bar(0, 10)).toBe('░░░░░░░░░░');
  });

  test('half-filled bar at value=0.5', () => {
    const b = bar(0.5, 10);
    expect(b).toHaveLength(10);
    expect(b).toContain('█');
    expect(b).toContain('░');
  });

  test('clamps to [0, 1]', () => {
    expect(bar(2, 5)).toBe('█████');
    expect(bar(-1, 5)).toBe('░░░░░');
  });

  test('custom fill and empty chars', () => {
    const b = bar(0.5, 4, { fill: '#', empty: '-' });
    expect(b).toBe('##--');
  });

  test('total length equals width', () => {
    for (const w of [1, 5, 10, 20, 50]) {
      expect(bar(Math.random(), w)).toHaveLength(w);
    }
  });
});

describe('box', () => {
  test('produces top and bottom border lines', () => {
    const result = box(['hello'], { title: 'Test' });
    const lines = result.split('\n');
    expect(lines[0]).toContain('┌');
    expect(lines[0]).toContain('┐');
    expect(lines[lines.length - 1]).toContain('└');
    expect(lines[lines.length - 1]).toContain('┘');
  });

  test('content lines contain │', () => {
    const result = box(['line one', 'line two']);
    const lines = result.split('\n');
    // Middle lines (not first/last) should have │
    for (const line of lines.slice(1, -1)) {
      expect(line).toContain('│');
    }
  });

  test('title appears in top border', () => {
    const result = box(['content'], { title: 'MyTitle' });
    expect(result.split('\n')[0]).toContain('MyTitle');
  });

  test('ANSI-colored content does not break box width', () => {
    const coloredLine = fg.green('valid') + ' ' + fg.red('invalid');
    const result = box([coloredLine], { width: 40 });
    const lines = result.split('\n');
    // All lines should have same visible width
    const widths = lines.map(l => stripAnsi(l).length);
    expect(new Set(widths).size).toBe(1);
  });

  test('empty lines array produces valid box', () => {
    const result = box([]);
    expect(result).toContain('┌');
    expect(result).toContain('└');
  });
});

describe('nextChoiceIndex', () => {
  test('moves down and wraps', () => {
    expect(nextChoiceIndex(0, 3, 'down')).toBe(1);
    expect(nextChoiceIndex(2, 3, 'down')).toBe(0);
  });

  test('moves up and wraps', () => {
    expect(nextChoiceIndex(2, 3, 'up')).toBe(1);
    expect(nextChoiceIndex(0, 3, 'up')).toBe(2);
  });

  test('handles empty choice lists defensively', () => {
    expect(nextChoiceIndex(0, 0, 'down')).toBe(0);
  });
});
