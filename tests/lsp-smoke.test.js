/**
 * T3 — LSP smoke test (automated, Approach B)
 *
 * Spawns the real LSP server (source mode via SMOKE_TARGET=source) and runs
 * the existing server/smoke.js regression guard as an automated Bun test.
 *
 * What this verifies end-to-end:
 *   - `initialize` → capabilities advertisement
 *   - `textDocument/didOpen` → `textDocument/publishDiagnostics` for a
 *     deliberately broken PRD (field leak, bad date, missing body section)
 *   - `textDocument/documentSymbol` → returns heading symbols
 *   - `workspace/symbol` → finds task IDs in the example vault
 *   - `textDocument/hover` → returns frontmatter field info
 *   - `textDocument/definition` + `references` → resolves markdown links
 *   - `textDocument/prepareCallHierarchy` → returns null stub
 *   - `shutdown` + `exit` → server terminates cleanly
 *
 * Note: this test is intentionally slow (~3-8 s) because it spawns a real
 * process and waits for async LSP notifications. It is marked with a 30 s
 * timeout. It is skipped automatically if `server/main.js` cannot be found.
 *
 * To run manually against the bundled server:
 *   node server/smoke.js
 *
 * To run in Bun's test runner (source mode, no bundle needed):
 *   SMOKE_TARGET=source bun test tests/lsp-smoke.test.js
 */

import { test, expect } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const smokeScript = resolve(repoRoot, 'server', 'smoke.js');
const serverSourcePath = resolve(repoRoot, 'server', 'main.js');

// Skip gracefully if the server source is missing (e.g. partial checkout).
const serverAvailable = existsSync(serverSourcePath) && existsSync(smokeScript);

test(
  'LSP smoke — end-to-end server validation pipeline',
  async () => {
    if (!serverAvailable) {
      console.warn('T3: server/main.js or server/smoke.js not found — skipping');
      return;
    }

    await new Promise((resolve, reject) => {
      // Always run in source mode so CI doesn't need the bundled artifact.
      const child = spawn(
        process.execPath, // node / bun binary
        [smokeScript],
        {
          cwd: repoRoot,
          env: { ...process.env, SMOKE_TARGET: 'source' },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(code);
        } else {
          reject(new Error(
            `LSP smoke exited ${code}.\nstdout:\n${stdout.slice(-2000)}\nstderr:\n${stderr.slice(-1000)}`,
          ));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn smoke.js: ${err.message}`));
      });
    });

    // If we reach here the smoke exited 0 → all assertions in smoke.js passed.
    expect(true).toBe(true);
  },
  30_000, // 30 s timeout — LSP boot + debounce + cross-doc ops can take ~3-8 s
);
