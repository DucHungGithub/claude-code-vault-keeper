# API1 — Export VaultIndex từ public API

**Effort:** S | **Impact:** MEDIUM | **Category:** API

## Vấn đề

`lib/index.js` (public API barrel) export validators, parsers, formatters, config, orchestrator — nhưng **không export `VaultIndex`** từ `server/vault-index.js`.

Consumer muốn build dashboard, graph visualization, hoặc custom reporter cần backlink graph và vault search. Hiện tại phải deep-import:

```js
// Không được document, có thể break
import { VaultIndex } from 'claude-code-vault-keeper/server/vault-index.js';
```

Đây là use case hợp lệ và nên được support chính thức.

## Giải pháp

Thêm `VaultIndex` vào barrel export:

```js
// lib/index.js — thêm vào cuối file

// ── Vault index (cross-document graph, search, backlinks) ──────────────────
//
// Use for custom dashboards, graph visualizations, or reporters that need
// cross-document data without running the full CLI validator.
//
// Example:
//   const index = new VaultIndex('/path/to/vault');
//   await index.ensureLoaded();
//   const backlinks = index.getBacklinks('/path/to/vault/notes/doc.md');
export { VaultIndex } from '../server/vault-index.js';
```

### Programmatic usage example

```js
import { VaultIndex, loadVaultConfig } from 'claude-code-vault-keeper';

const projectRoot = process.cwd();
const config = await loadVaultConfig(projectRoot);

const index = new VaultIndex(projectRoot, config);
await index.ensureLoaded();

// Get all orphan docs (no incoming links)
const allDocs = index.getAllDocs();
const orphans = allDocs.filter(doc => index.getBacklinks(doc.absPath).length === 0);

// Workspace symbol search
const results = index.search('authentication');

// Backlink count per doc
for (const doc of allDocs) {
  console.log(`${doc.title}: ${index.getBacklinks(doc.absPath).length} backlinks`);
}
```

## Files cần sửa

- `lib/index.js` — thêm `export { VaultIndex }` với JSDoc comment
- `docs/programmatic-usage.md` — thêm section về VaultIndex usage
- `tests/public-api.test.js` — thêm test: `VaultIndex` importable từ barrel, basic usage

## Trade-offs

- **Pro:** Enable dashboard, graph, custom reporter use cases
- **Pro:** S effort — chỉ thêm 1 export line + docs
- **Con:** VaultIndex đang trong `server/` folder (LSP boundary) — expose nó qua public API coupling architecture hơn. Có thể move sang `lib/` trước.
- **Con:** Thêm vào public API contract → semver applies → cần careful về interface stability

## Pre-condition

Xem xét move `VaultIndex` từ `server/vault-index.js` → `lib/vault-index.js` trước khi export, để align với package structure ("server = LSP-specific, lib = shared").

## Definition of Done

- [ ] `import { VaultIndex } from 'claude-code-vault-keeper'` hoạt động
- [ ] Docs có usage example
- [ ] `tests/public-api.test.js` cover VaultIndex import
- [ ] Semver: minor bump (new export, backward compatible)
