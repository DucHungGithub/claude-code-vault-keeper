# Improvement Progress

## Completed

| ID | Branch | Status | Tests |
|----|--------|--------|-------|
| P1 | `perf/cache-and-precompile-template-rules` | ✅ done | pass |
| P2 | `perf/cache-and-precompile-template-rules` | ✅ done | pass |
| D1 | `fix/structured-template-load-errors` | ✅ done | pass |
| A2 | `fix/isolate-validation-state-per-vault` | ✅ done | 9/9 |
| A3 | `arch/vault-config-cache-invalidation` | ✅ done | 18/18 |
| P3 | `perf/vault-index-exclude-patterns` | ✅ done | 6/6 |
| F1 | `feat/orphan-detection` | ✅ done | 8/8 |

## In Progress

_none_

## Queue (next up)

| ID | Effort | Impact | Description |
|----|--------|--------|-------------|
| F2 | M | HIGH | `--fix --write` auto-fix mode |
| P4 | S | MEDIUM | resolveId O(1) lookup map |
| F3 | M | MEDIUM | Template lint (`vault-keeper lint-templates`) |
| F4 | M | MEDIUM | State machine transition validation |
| D2 | S | MEDIUM | `vault-keeper add-template` scaffold command |
| D3 | S | LOW | Configurable template-only fields |
| A1 | L | HIGH | Split LSP bundle (tree-shaking) |
| T1 | M | MEDIUM | VaultIndex unit tests |
| T2 | M | MEDIUM | validateLinkExistence tests |
| T3 | L | MEDIUM | LSP integration tests |
| API1 | M | MEDIUM | Export VaultIndex as public API |
| API2 | M | LOW | document-section-rules API |

## Branches (local, not yet pushed)

- `fix/isolate-validation-state-per-vault` — A2
- `arch/vault-config-cache-invalidation` — A3
- `perf/vault-index-exclude-patterns` — P3
- `feat/orphan-detection` — F1
- `fix/structured-template-load-errors` — D1 (committed earlier)
- `perf/cache-and-precompile-template-rules` — P1+P2 (committed earlier)
