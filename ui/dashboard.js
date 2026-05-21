#!/usr/bin/env node
/**
 * ui/dashboard.js — Web dashboard for vault health reporting.
 *
 * Generates a self-contained HTML report from vault validation results.
 * The report opens in any browser — no server needed, no external deps.
 *
 * Usage (via vault-keeper dashboard):
 *   vault-keeper dashboard                    # generate + open in browser
 *   vault-keeper dashboard --out report.html  # write to file only
 *   vault-keeper dashboard --root ./notes     # specific vault root
 *   vault-keeper dashboard --json             # print data as JSON instead
 *
 * Architecture:
 *   1. Run validateDocument() on all vault docs (same engine as CLI)
 *   2. Build a DashboardData object (summary + per-doc results)
 *   3. Inject into report-template.js to produce self-contained HTML
 *   4. Write to file / open in browser
 */

// TODO: implement
export async function main(_argv = []) {
  console.log('vault-keeper dashboard — coming soon');
  return 0;
}
