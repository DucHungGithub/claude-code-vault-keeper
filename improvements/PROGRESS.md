# Improvement Progress

## Completed

| ID | Status | Tests | Notes |
|----|--------|-------|-------|
| A1 | ✅ done | — | Bundle removed from npm tarball; uploaded as GitHub Release asset |
| A2 | ✅ done | 9/9 | Per-root `_bundleMismatchMaps` + `_bundleTemplatePatternsCache` Map |
| A3 | ✅ done | 18/18 | mtime-based vault-config cache invalidation |
| P1 | ✅ done | pass | mtime cache on `loadTemplateRules` + `clearTemplateRulesCache()` |
| P2 | ~~done~~ | — | **Dropped** — target code removed in v0.9.0 (obsolete) |
| P3 | ✅ done | 6/6 | `excludePatterns` honored in `VaultIndex._walkDir` |
| P4 | ✅ done | 31/31 | `_idMap` Map in VaultIndex — O(1) `resolveId` |
| D1 | ⚠️ partial | — | **Dropped** — `{rules,error}` contract incompatible with v0.9.0 `templateErrors` |
| D2 | ✅ done | 17/17 | `vault-keeper add-template <name>` scaffold command |
| D3 | ✅ done | 17/17 | `templateOnlyFields` configurable via vault-keeper.json |
| F1 | ✅ done | 8/8 | `--orphans` CLI flag + `findOrphans()` |
| F2 | ✅ done | 8/8 | `--fix` / `--fix --write` auto-fix mode |
| F3 | ✅ done | 11/11 | `vault-keeper lint-templates` command |
| F4 | ✅ done | 16/16 | State machine transition validation via `previous_status` |
| T1 | ✅ done | 31/31 | `tests/vault-index.test.js` — 31 tests |
| T2 | ✅ done | 19/19 | `tests/t2-validate-link-existence.test.js` — exists primitive integration |
| T3 | ✅ done | 1/1 | `tests/lsp-smoke.test.js` — full LSP pipeline e2e |
| API1 | ✅ done | 31/31 | `VaultIndex` exported from `lib/index.js` barrel |
| API2 | ✅ done | 5/5 | Section-rules docs + functional tests in public-api.test.js |

**Total tests: 835 pass, 0 fail** (from 690 baseline — +145 tests)

## In Progress

_none_

## Queue (new items)

| ID | Effort | Impact | Description |
|----|--------|--------|-------------|
| P5 | M | MEDIUM | Register LSP file watcher — keep vault index fresh after git/external changes |
