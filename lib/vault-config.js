/**
 * vault-config.js — Vault-agnostic config resolution.
 *
 * A vault declares its shape via `${projectRoot}/.claude/vault-keeper.json`
 * (or an explicit path in `VAULT_KEEPER_CONFIG`). With no config file, the
 * built-in defaults below apply.
 *
 * Three config atoms + a root resolver — pure infra, no engine logic.
 *
 * Consumers:
 *   - lib/validators.js             (CONFIG.contentFolders / .excludePatterns)
 *   - cli/validate-documents.js     (root derivation: --root / CLAUDE_PROJECT_DIR)
 *   - server/main.js                (vaultFolders)
 *   - server/smoke.js               (fixture-driven via config)
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// ── Defaults ────────────────────────────────────────────────────────────────
//
// Generic exclusions: AI-agent prompts, npm deps, common static-site dirs,
// folder-meta README.md (canonical vault docs that LIVE as a folder's
// README.md must be re-included by the orchestrator, which already does).
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/README.md',
  '**/CLAUDE.md',
  '**/CLAUDE.local.md',
  '**/.vitepress/**',
  '**/node_modules/**',
];

const DEFAULTS = {
  // With no config file, the whole repo IS the vault — single-doc / flat-
  // layout vaults work without any setup. Multi-section vaults configure
  // explicit vaultFolders.
  vaultRoot: '.',
  vaultFolders: ['.'],
  excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
};

// Stable repo markers, most specific first. Used by resolveProjectRoot()'s
// walk-up. NOT a config file lookup — that would be circular (the config file
// lives under `.claude/`, which is itself one of these markers).
const ROOT_MARKERS = ['.git', '.claude', 'CLAUDE.md'];

/**
 * Resolve the vault project root.
 *
 * Precedence (no circular dependency — uses STABLE filesystem markers, never
 * the config file that vaultRoot is defined in):
 *   1. opts.root  (CLI `--root <path>`)
 *   2. process.env.CLAUDE_PROJECT_DIR  (canonical Claude Code project signal)
 *   3. walk up from process.cwd(): first dir with `.git/`, else `.claude/`,
 *      else `CLAUDE.md`
 *   4. process.cwd()  (fallback)
 *
 * @param {{ root?: string }} [opts]
 * @returns {string} absolute project root
 */
export function resolveProjectRoot(opts = {}) {
  if (opts && typeof opts.root === 'string' && opts.root.length > 0) {
    return resolve(opts.root);
  }
  const envDir = process.env.CLAUDE_PROJECT_DIR;
  if (envDir && envDir.length > 0) {
    return resolve(envDir);
  }

  // Walk up once per marker tier (most specific first) so a `.git` parent
  // outranks a closer `CLAUDE.md`-only dir.
  const start = process.cwd();
  for (const marker of ROOT_MARKERS) {
    let dir = start;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (existsSync(join(dir, marker))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return start;
}

// ── Config file loading (mtime-keyed cache, keyed by resolved path) ──────────
//
// Each entry stores { config: frozenObject, mtime: number|null } so that a
// file modification (new mtimeMs) is detected on the next call without any
// manual cache-busting. mtime===null means the file did not exist at last read.

const _cache = new Map(); // cfgPath → { config, mtime: number|null }

function configPathFor(projectRoot) {
  const override = process.env.VAULT_KEEPER_CONFIG;
  if (override && override.length > 0) return resolve(override);
  return join(projectRoot, '.claude', 'vault-keeper.json');
}

/**
 * Load the vault config for a project root. With no file present (and no
 * VAULT_KEEPER_CONFIG override) the returned object is the built-in defaults.
 *
 * Cached per resolved config path; cache entry is invalidated automatically
 * when the file's mtime changes (A3 fix — previously cache was never cleared).
 * Returned object is frozen so consumers cannot mutate shared state.
 *
 * @param {string} [projectRoot]  defaults to resolveProjectRoot()
 * @returns {{ vaultRoot: string, vaultFolders: string[],
 *             excludePatterns: string[] }}
 */
export function loadVaultConfig(projectRoot) {
  const root = projectRoot || resolveProjectRoot();
  const cfgPath = configPathFor(root);

  // Stat the file to get current mtime (null if absent or unreadable).
  let mtime = null;
  try {
    const st = statSync(cfgPath);
    if (st.isFile()) mtime = st.mtimeMs;
  } catch { /* ENOENT or permission error → treat as no file */ }

  const cached = _cache.get(cfgPath);
  if (cached && cached.mtime === mtime) return cached.config;

  let fileConfig = {};
  try {
    if (mtime !== null) {
      // File exists (already stat'd above) — parse it.
      fileConfig = JSON.parse(readFileSync(cfgPath, 'utf-8')) || {};
    }
  } catch {
    // Malformed JSON → fall back to defaults rather than crashing the
    // validator. A vault with a broken config still gets a working engine.
    fileConfig = {};
  }

  const merged = {
    vaultRoot:
      typeof fileConfig.vaultRoot === 'string' && fileConfig.vaultRoot.length > 0
        ? fileConfig.vaultRoot
        : DEFAULTS.vaultRoot,
    vaultFolders:
      Array.isArray(fileConfig.vaultFolders) && fileConfig.vaultFolders.length > 0
        ? fileConfig.vaultFolders.slice()
        : DEFAULTS.vaultFolders.slice(),
    excludePatterns:
      Array.isArray(fileConfig.excludePatterns) && fileConfig.excludePatterns.length > 0
        ? fileConfig.excludePatterns.slice()
        : DEFAULTS.excludePatterns.slice(),
  };

  Object.freeze(merged.vaultFolders);
  Object.freeze(merged.excludePatterns);
  Object.freeze(merged);
  _cache.set(cfgPath, { config: merged, mtime });
  return merged;
}

/**
 * Evict one or all entries from the config cache.
 *
 * Pass a projectRoot to evict only that root's entry (useful for targeted
 * invalidation in the LSP's onDidChangeConfiguration handler). Omit the
 * argument to clear everything (e.g. test teardown).
 *
 * @param {string} [projectRoot]
 */
export function clearVaultConfigCache(projectRoot) {
  if (projectRoot) {
    _cache.delete(configPathFor(projectRoot));
  } else {
    _cache.clear();
  }
}

/** @deprecated Use clearVaultConfigCache(). Kept for existing test compat. */
export function _resetVaultConfigCache() {
  _cache.clear();
}
