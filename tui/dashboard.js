#!/usr/bin/env node
/**
 * tui/dashboard.js — Terminal UI dashboard for vault health.
 *
 * Renders a color-coded summary in the terminal using ANSI codes.
 * No external dependencies — pure Node/Bun with ANSI escape sequences.
 *
 * Usage (via vault-keeper tui):
 *   vault-keeper tui                   # show dashboard for current vault
 *   vault-keeper tui --root ./notes    # specific vault root
 *   vault-keeper tui --watch           # re-render every 2s (live mode)
 *
 * Output example:
 *   ┌─ Vault Health ─────────────────────────────────────────┐
 *   │ ████████████████░░ 94.2%  ✅ 94 valid  ❌ 6 invalid    │
 *   ├─ By Folder ─────────────────────────────────────────────│
 *   │ notes/  ████████ 100%  (60 docs)                       │
 *   │ prds/   ██████░░  67%  (15 docs)                       │
 *   ├─ Top Issues ────────────────────────────────────────────│
 *   │  4x  status: missing required field                    │
 *   │  3x  priority: enum violation                          │
 *   └────────────────────────────────────────────────────────┘
 */

import { relative, dirname } from 'node:path';
import { fg, style, bar, box, stripAnsi } from './components/ansi.js';

const BOX_WIDTH = 64;
const BAR_WIDTH = 20;
const FOLDER_BAR_WIDTH = 14;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a DashboardData object from validation results.
 *
 * @param {object[]} results  - validateDocument results array
 * @param {object}   summary  - generateSummary output
 * @param {string}   vaultRoot - absolute vault root
 * @returns {DashboardData}
 */
export function buildDashboardData(results, summary, vaultRoot) {
  return {
    generatedAt: new Date().toISOString(),
    vaultRoot,
    summary,
    results,
  };
}

/**
 * Render a DashboardData object as an ANSI-colored terminal string.
 *
 * @param {DashboardData} data
 * @returns {string}
 */
export function renderDashboard(data) {
  const { summary, vaultRoot } = data;
  const { total, valid, invalid, errorCount, warningCount, byFolder, commonIssues } = summary;

  const validatedCount = total - (summary.skipped ?? 0);
  const rate = validatedCount > 0 ? valid / validatedCount : 1;
  const pct = (rate * 100).toFixed(1);

  // ── Header: compliance bar ───────────────────────────────────────────────
  const headerBar = coloredBar(rate, BAR_WIDTH);
  const pctLabel = rate >= 0.95
    ? fg.brightGreen(`${pct}%`)
    : rate >= 0.8
      ? fg.brightYellow(`${pct}%`)
      : fg.brightRed(`${pct}%`);

  const validLabel  = fg.brightGreen(`✅ ${valid} valid`);
  const invalidLabel = invalid > 0 ? fg.brightRed(`❌ ${invalid} invalid`) : fg.gray('❌ 0 invalid');
  const warnLabel   = warningCount > 0 ? fg.yellow(`⚠️  ${warningCount} warnings`) : '';

  const headerLine = `${headerBar} ${pctLabel}  ${validLabel}  ${invalidLabel}${warnLabel ? '  ' + warnLabel : ''}`;

  const rootLabel = fg.gray(vaultRoot ? `root: ${vaultRoot}` : '');

  // ── By Folder ────────────────────────────────────────────────────────────
  const folderLines = [];
  for (const [folder, stats] of Object.entries(byFolder || {})) {
    const folderRate = stats.total > 0 ? stats.valid / stats.total : 1;
    const folderPct  = (folderRate * 100).toFixed(0).padStart(3);
    const folderBar  = coloredBar(folderRate, FOLDER_BAR_WIDTH);
    const countLabel = fg.gray(`(${stats.total})`);
    const name       = style.bold(folder.padEnd(12));
    folderLines.push(`${name} ${folderBar} ${folderPct}%  ${countLabel}`);
  }

  // ── Top Issues ───────────────────────────────────────────────────────────
  const issueLines = [];
  const sortedIssues = Object.entries(commonIssues || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  for (const [key, count] of sortedIssues) {
    const countStr = fg.brightRed(`${count}x`).padEnd(6);
    // Truncate long issue key to fit box
    const maxKeyLen = BOX_WIDTH - 10;
    const label = key.length > maxKeyLen ? key.slice(0, maxKeyLen - 1) + '…' : key;
    issueLines.push(`  ${countStr}  ${label}`);
  }
  if (issueLines.length === 0) {
    issueLines.push(`  ${fg.brightGreen('✅ No issues found — vault is clean!')}`);
  }

  // ── Invalid docs (up to 5) ───────────────────────────────────────────────
  const invalidDocs = (data.results || []).filter(r => !r.valid && !r.skipped).slice(0, 5);
  const docLines = [];
  for (const doc of invalidDocs) {
    const rel = vaultRoot ? relative(vaultRoot, doc.filepath) : doc.filepath;
    docLines.push(`  ${fg.brightRed('●')} ${style.bold(rel)}`);
    for (const err of doc.errors.slice(0, 2)) {
      const msg = err.message.length > 50 ? err.message.slice(0, 49) + '…' : err.message;
      docLines.push(`    ${fg.gray(err.field + ':')} ${msg}`);
    }
    if (doc.errors.length > 2) {
      docLines.push(`    ${fg.gray(`+ ${doc.errors.length - 2} more errors`)}`);
    }
  }
  if (invalidDocs.length === 0 && invalid === 0) {
    docLines.push(`  ${fg.brightGreen('All documents are valid ✅')}`);
  }

  // ── Assemble sections ────────────────────────────────────────────────────
  const lines = [
    headerLine,
    ...(rootLabel ? [rootLabel] : []),
  ];

  const separator = fg.gray('─'.repeat(BOX_WIDTH - 2));

  if (folderLines.length > 0) {
    lines.push(separator);
    lines.push(style.bold('By Folder'));
    lines.push(...folderLines);
  }

  lines.push(separator);
  lines.push(style.bold('Top Issues'));
  lines.push(...issueLines);

  if (docLines.length > 0) {
    lines.push(separator);
    lines.push(style.bold('Invalid Documents') + (data.results?.filter(r => !r.valid).length > 5
      ? fg.gray(` (showing 5 of ${invalid})`)
      : ''));
    lines.push(...docLines);
  }

  // Error + warning totals footer
  lines.push(separator);
  const footer = [
    fg.brightRed(`${errorCount} error${errorCount !== 1 ? 's' : ''}`),
    fg.yellow(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`),
    fg.gray(`${total} docs scanned`),
  ].join('  ·  ');
  lines.push(footer);

  return box(lines, { title: '🏛  Vault Health', width: BOX_WIDTH });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function coloredBar(rate, width) {
  const b = bar(rate, width);
  if (rate >= 0.95) return fg.brightGreen(b);
  if (rate >= 0.8)  return fg.brightYellow(b);
  return fg.brightRed(b);
}

// ── CLI entry ─────────────────────────────────────────────────────────────────

export async function main(argv = []) {
  const { resolveProjectRoot } = await import('../lib/vault-config.js');
  const { findDocuments, validateDocument } = await import('../cli/validate-documents.js');

  const cliRoot = argv.includes('--root')
    ? argv[argv.indexOf('--root') + 1]
    : undefined;
  const watch = argv.includes('--watch');

  const resolvedRoot = resolveProjectRoot({ root: cliRoot });
  process.chdir(resolvedRoot);
  const projectRoot = process.cwd();
  process.env.CLAUDE_PROJECT_DIR = projectRoot;

  const render = async () => {
    process.stdout.write('🔍 Scanning vault…\r');
    const docs = await findDocuments();
    const results = await Promise.all(docs.map(d => validateDocument(d)));

    // Build summary (mirrors validate-documents.js generateSummary)
    const summary = buildSummary(results, projectRoot);
    const data = buildDashboardData(results, summary, projectRoot);

    // Clear previous dashboard if re-rendering
    process.stdout.write('\x1b[2J\x1b[H');
    console.log(renderDashboard(data));
    console.log(fg.gray(`  Generated ${new Date().toLocaleTimeString()}${watch ? '  (Ctrl-C to exit)' : ''}`));
  };

  await render();

  if (watch) {
    const INTERVAL_MS = 2000;
    setInterval(render, INTERVAL_MS);
    await new Promise(() => {});
  }

  return 0;
}

/**
 * Build a summary object from validation results.
 * Mirrors the generateSummary() function in cli/validate-documents.js.
 */
function buildSummary(results, projectRoot) {

  const summary = {
    total: results.length,
    skipped: results.filter(r => r.skipped).length,
    valid: results.filter(r => r.valid && !r.skipped).length,
    invalid: results.filter(r => !r.valid).length,
    errorCount: results.reduce((s, r) => s + r.errors.length, 0),
    warningCount: results.reduce((s, r) => s + r.warnings.length, 0),
    byFolder: {},
    commonIssues: {},
  };

  for (const r of results) {
    const rel = relative(projectRoot, r.filepath);
    const folder = rel.includes('/') ? rel.split('/')[0] + '/' : './';
    if (!summary.byFolder[folder]) {
      summary.byFolder[folder] = { total: 0, valid: 0, invalid: 0 };
    }
    summary.byFolder[folder].total++;
    if (r.valid) summary.byFolder[folder].valid++;
    else summary.byFolder[folder].invalid++;

    for (const iss of [...r.errors, ...r.warnings]) {
      const key = `${iss.field}: ${iss.message.split(':')[0]}`;
      summary.commonIssues[key] = (summary.commonIssues[key] || 0) + 1;
    }
  }

  return summary;
}
