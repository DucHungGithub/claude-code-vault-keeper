# Improvement Plans

Danh sách các cải tiến được phân tích từ codebase. Mỗi file là một plan độc lập, có thể implement riêng lẻ.

## Ưu tiên Quick Wins (bắt đầu từ đây)

| File | Tên | Effort | Impact |
|------|-----|--------|--------|
| [performance/p1-cache-template-rules.md](performance/p1-cache-template-rules.md) | Cache loadTemplateRules | S | HIGH |
| [performance/p2-precompile-regex.md](performance/p2-precompile-regex.md) | Pre-compile regex | S | HIGH |
| [dx/d1-structured-template-error.md](dx/d1-structured-template-error.md) | Structured template load error | S | HIGH |
| [architecture/a2-fix-bundle-mismatch-state.md](architecture/a2-fix-bundle-mismatch-state.md) | Fix mutable module state | S | MEDIUM |

## Tất cả plans

### Performance
- [P1](performance/p1-cache-template-rules.md) — Cache loadTemplateRules với mtime invalidation
- [P2](performance/p2-precompile-regex.md) — Pre-compile regex trong normalizeRules()
- [P3](performance/p3-vault-index-excludepatterns.md) — Honor excludePatterns trong VaultIndex._walkDir
- [P4](performance/p4-resolveid-o1-lookup.md) — O(1) resolveId lookup map
- [P5](performance/p5-file-watcher-lsp.md) — Register file watcher trong LSP

### Features
- [F1](features/f1-orphan-detection.md) — Orphan document detection
- [F2](features/f2-cli-fix-mode.md) — `--fix` mode trong CLI
- [F3](features/f3-lint-templates.md) — `vault-keeper lint-templates` command
- [F4](features/f4-state-machine-transitions.md) — State machine transition validation

### DX
- [D1](dx/d1-structured-template-error.md) — Structured error từ loadTemplateRules
- [D2](dx/d2-add-template-scaffold.md) — `vault-keeper add-template` command
- [D3](dx/d3-configurable-template-only-fields.md) — templateOnlyFields configurable

### Architecture
- [A1](architecture/a1-split-lsp-bundle.md) — Tách LSP bundle thành package riêng
- [A2](architecture/a2-fix-bundle-mismatch-state.md) — Fix _bundleMismatchMap mutable state
- [A3](architecture/a3-vault-config-cache-invalidation.md) — Vault config cache invalidation

### Testing
- [T1](testing/t1-vault-index-unit-tests.md) — VaultIndex unit tests
- [T2](testing/t2-validate-link-existence-tests.md) — validateLinkExistence tests
- [T3](testing/t3-lsp-integration-test.md) — LSP integration test end-to-end

### API
- [API1](api/api1-export-vault-index.md) — Export VaultIndex từ public API
- [API2](api/api2-document-section-rules-api.md) — Document section-rules API
