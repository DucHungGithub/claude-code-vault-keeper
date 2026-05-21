/**
 * report-template.js — Generate self-contained HTML from DashboardData.
 *
 * All CSS and JS is inlined — the output is a single .html file with
 * no external dependencies. Data is embedded as a <script> JSON block.
 *
 * DashboardData shape:
 * {
 *   generatedAt: string (ISO),
 *   vaultRoot: string,
 *   summary: { total, valid, invalid, skipped, errorCount, warningCount, byFolder, byDocType, commonIssues },
 *   results: Array<{ filepath, docType, valid, skipped, errors, warnings, frontmatter }>
 * }
 */

// TODO: implement
export function generateReport(_data) {
  return '<!-- vault-keeper report — not yet implemented -->';
}
