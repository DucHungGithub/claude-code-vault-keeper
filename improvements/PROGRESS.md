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
| P1 | Cache loadTemplateRules | `[~]` | `tests/template-rules.test.js` | In progress |
| P2 | Pre-compile regex in normalizeRules | `[ ]` | `tests/template-rules.test.js` | After P1 (same file) |
| D1 | Structured error from loadTemplateRules | `[ ]` | `tests/template-rules.test.js` | After P1+P2 |
| A2 | Fix _bundleMismatchMap mutable state | `[ ]` | `tests/public-api.test.js` | Independent |

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
