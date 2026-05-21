/**
 * TDD tests for tui/dashboard.js
 *
 * RED: these tests fail until renderDashboard() is implemented.
 *
 * The dashboard is tested through its pure rendering function
 * (no process.stdout side effects in tests).
 */

import { describe, test, expect } from 'bun:test';
import { stripAnsi } from '../tui/components/ansi.js';

// Will be exported from tui/dashboard.js once implemented
async function importDashboard() {
  return import('../tui/dashboard.js');
}

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_DATA = {
  vaultRoot: '/tmp/my-vault',
  summary: {
    total: 100,
    valid: 94,
    invalid: 6,
    skipped: 0,
    errorCount: 8,
    warningCount: 3,
    byFolder: {
      'notes/':  { total: 60, valid: 59, invalid: 1 },
      'books/':  { total: 25, valid: 25, invalid: 0 },
      'prds/':   { total: 15, valid: 10, invalid: 5 },
    },
    commonIssues: {
      'status: missing required field': 4,
      'priority: enum violation': 3,
      'created: invalid date format': 1,
    },
  },
  results: [
    {
      filepath: '/tmp/my-vault/prds/prd-001.md',
      valid: false,
      skipped: false,
      errors: [
        { field: 'status', message: 'Missing required field: status', fix: 'Add status to frontmatter' },
        { field: 'priority', message: 'Invalid enum value: critical', fix: 'Use one of: low, medium, high' },
      ],
      warnings: [],
    },
    {
      filepath: '/tmp/my-vault/notes/note-001.md',
      valid: true,
      skipped: false,
      errors: [],
      warnings: [{ field: 'tags', message: 'Consider adding tags for discoverability' }],
    },
  ],
};

// ── Contract: module exports ───────────────────────────────────────────────────

describe('tui/dashboard.js — exports', () => {
  test('exports renderDashboard function', async () => {
    const mod = await importDashboard();
    expect(typeof mod.renderDashboard).toBe('function');
  });

  test('exports buildDashboardData function', async () => {
    const mod = await importDashboard();
    expect(typeof mod.buildDashboardData).toBe('function');
  });
});

// ── renderDashboard output ────────────────────────────────────────────────────

describe('renderDashboard — output structure', () => {
  test('returns a non-empty string', async () => {
    const { renderDashboard } = await importDashboard();
    const out = renderDashboard(SAMPLE_DATA);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(50);
  });

  test('contains compliance percentage', async () => {
    const { renderDashboard } = await importDashboard();
    const out = stripAnsi(renderDashboard(SAMPLE_DATA));
    // 94/100 = 94%
    expect(out).toContain('94');
  });

  test('contains total doc count', async () => {
    const { renderDashboard } = await importDashboard();
    const out = stripAnsi(renderDashboard(SAMPLE_DATA));
    expect(out).toContain('100');
  });

  test('contains folder names from byFolder', async () => {
    const { renderDashboard } = await importDashboard();
    const out = stripAnsi(renderDashboard(SAMPLE_DATA));
    expect(out).toContain('notes/');
    expect(out).toContain('books/');
    expect(out).toContain('prds/');
  });

  test('contains top issue messages', async () => {
    const { renderDashboard } = await importDashboard();
    const out = stripAnsi(renderDashboard(SAMPLE_DATA));
    expect(out).toContain('status');
    expect(out).toContain('priority');
  });

  test('shows invalid doc count', async () => {
    const { renderDashboard } = await importDashboard();
    const out = stripAnsi(renderDashboard(SAMPLE_DATA));
    expect(out).toContain('6'); // 6 invalid
  });

  test('uses progress bar characters', async () => {
    const { renderDashboard } = await importDashboard();
    const out = renderDashboard(SAMPLE_DATA);
    // Should contain fill chars from bar()
    expect(out).toContain('█');
  });

  test('uses Unicode box drawing characters', async () => {
    const { renderDashboard } = await importDashboard();
    const out = renderDashboard(SAMPLE_DATA);
    expect(out).toContain('┌');
    expect(out).toContain('└');
    expect(out).toContain('│');
  });
});

// ── renderDashboard — perfect vault ──────────────────────────────────────────

describe('renderDashboard — 100% compliant vault', () => {
  test('shows 100% compliance and green indicators', async () => {
    const { renderDashboard } = await importDashboard();
    const perfectData = {
      vaultRoot: '/tmp/vault',
      summary: {
        total: 50, valid: 50, invalid: 0, skipped: 0,
        errorCount: 0, warningCount: 0,
        byFolder: { 'notes/': { total: 50, valid: 50, invalid: 0 } },
        commonIssues: {},
      },
      results: [],
    };
    const out = stripAnsi(renderDashboard(perfectData));
    expect(out).toContain('100');
    expect(out).toContain('50');
  });

  test('shows all-filled progress bar for 100% vault', async () => {
    const { renderDashboard } = await importDashboard();
    const perfectData = {
      vaultRoot: '/tmp/vault',
      summary: {
        total: 10, valid: 10, invalid: 0, skipped: 0,
        errorCount: 0, warningCount: 0,
        byFolder: {},
        commonIssues: {},
      },
      results: [],
    };
    const out = renderDashboard(perfectData);
    // Should not contain empty-bar char if 100%
    expect(out).not.toContain('░░░░░░░░░░');
  });
});

// ── buildDashboardData ────────────────────────────────────────────────────────

describe('buildDashboardData', () => {
  test('builds data from validation results + summary', async () => {
    const { buildDashboardData } = await importDashboard();
    const summary = SAMPLE_DATA.summary;
    const results = SAMPLE_DATA.results;

    const data = buildDashboardData(results, summary, '/tmp/vault');
    expect(data.summary).toBe(summary);
    expect(data.results).toBe(results);
    expect(data.vaultRoot).toBe('/tmp/vault');
    expect(typeof data.generatedAt).toBe('string');
  });

  test('generatedAt is a valid ISO date string', async () => {
    const { buildDashboardData } = await importDashboard();
    const data = buildDashboardData([], SAMPLE_DATA.summary, '/vault');
    expect(() => new Date(data.generatedAt)).not.toThrow();
    expect(isNaN(new Date(data.generatedAt).getTime())).toBe(false);
  });
});
