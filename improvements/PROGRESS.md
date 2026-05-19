# Implementation Progress

**Baseline:** 499 tests pass, 0 fail (2026-05-19)
**Rule:** Không implement khi tests chưa đỏ đúng lý do. Không merge khi còn test fail.

## Status Legend
- `[ ]` Not started
- `[~]` In progress
- `[x]` Done
- `[!]` Blocked / needs discussion

---

## Quick Wins (S effort) — Start here

| ID | Plan | Status | Tests added | Notes |
|----|------|--------|-------------|-------|
| P1 | Cache loadTemplateRules | `[x]` | `tests/p1-cache-template-rules.test.js` | Branch: perf/cache-and-precompile-template-rules |
| P2 | Pre-compile regex in normalizeRules | `[x]` | `tests/p2-precompile-regex.test.js` | Same branch as P1 |
| D1 | Structured error from loadTemplateRules | `[~]` | `tests/d1-structured-template-errors.test.js` | Branch: fix/structured-template-load-errors |
| A2 | Fix _bundleMismatchMap mutable state | `[ ]` | `tests/a2-multi-vault-state.test.js` | Branch: fix/isolate-validation-state-per-vault |

## Medium Effort

| ID | Plan | Status | Tests added | Notes |
|----|------|--------|-------------|-------|
| P3 | VaultIndex honor excludePatterns | `[ ]` | `tests/vault-index.test.js` | Needs T1 first |
| P4 | resolveId O(1) lookup | `[ ]` | `tests/vault-index.test.js` | Needs T1 first |
| P5 | File watcher LSP | `[ ]` | `tests/lsp-smoke.test.js` | Needs T3 first |
| F1 | Orphan detection | `[ ]` | `tests/validate-documents.test.js` | — |
| F2 | CLI --fix mode | `[ ]` | `tests/validate-documents.test.js` | — |
| F3 | vault-keeper lint-templates | `[ ]` | `tests/lint-templates.test.js` | New file |
| T1 | VaultIndex unit tests | `[ ]` | `tests/vault-index.test.js` | New file, unblocks P3+P4 |
| T2 | validateLinkExistence tests | `[ ]` | `tests/validate-link-existence.test.js` | New file |

## Large Effort / Needs Discussion

| ID | Plan | Status | Notes |
|----|------|--------|-------|
| A1 | Split LSP bundle | `[ ]` | Breaking change, discuss first |
| A3 | Vault config cache invalidation | `[ ]` | After A2 |
| D2 | add-template scaffold | `[ ]` | — |
| D3 | templateOnlyFields configurable | `[ ]` | — |
| F4 | State machine transitions | `[ ]` | Design needed |
| T3 | LSP integration test | `[ ]` | After T1 |
| API1 | Export VaultIndex | `[ ]` | After T1 |
| API2 | Document section-rules API | `[ ]` | Docs only |

---

## TDD Log

### P1 — Cache loadTemplateRules
- **Started:** 2026-05-19
- **Test file:** `tests/template-rules.test.js`
- **Tests written:** (in progress)
- **Fail reason confirmed:** —
- **Implementation:** `lib/template-rules.js`
- **Result:** —

---

## How to resume

```bash
# Run all tests
bun test ./tests

# Run specific test file
bun test tests/template-rules.test.js

# Run with watch
bun test --watch tests/template-rules.test.js
```
