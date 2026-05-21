# Improvement Progress

## Completed

| ID | Status | Tests | Notes |
|----|--------|-------|-------|
| A2 | ✅ done | 9/9 | Per-root `_bundleMismatchMaps` + `_bundleTemplatePatternsCache` Map |
| A3 | ✅ done | 18/18 | mtime-based vault-config cache invalidation |
| P1 | ✅ done | pass | mtime cache on `loadTemplateRules` + `clearTemplateRulesCache()` |
| P2 | ~~done~~ | — | **Dropped** — target code removed in v0.9.0 (obsolete) |
| P3 | ✅ done | 6/6 | `excludePatterns` honored in `VaultIndex._walkDir` |
| P4 | ✅ done | 31/31 | `_idMap` Map in VaultIndex — O(1) `resolveId` |
| D1 | ⚠️ partial | — | **Dropped** — `{rules,error}` contract incompatible with v0.9.0 `templateErrors` |
| F1 | ✅ done | 8/8 | `--orphans` CLI flag + `findOrphans()` |
| T1 | ✅ done | 31/31 | `tests/vault-index.test.js` — build, search, backlinks, resolveId, refreshFile |
| API1 | ✅ done | 31/31 | `VaultIndex` exported from `lib/index.js` barrel |

## In Progress

_none_

## Queue (next up)

| ID | Effort | Impact | Description |
|----|--------|--------|-------------|
| F2 | M | HIGH | `--fix --write` auto-fix mode |
| F3 | M | MEDIUM | Template lint (`vault-keeper lint-templates`) |
| F4 | M | MEDIUM | State machine transition validation |
| D2 | S | MEDIUM | `vault-keeper add-template` scaffold command |
| D3 | S | LOW | Configurable template-only fields |
| A1 | L | HIGH | Split LSP bundle (tree-shaking) |
| T2 | M | MEDIUM | validateLinkExistence tests |
| T3 | L | MEDIUM | LSP integration tests |
| API2 | M | LOW | document-section-rules API |
