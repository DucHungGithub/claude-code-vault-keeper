# A2 — Fix _bundleMismatchMap mutable module state

**Effort:** S | **Impact:** MEDIUM | **Category:** Architecture

## Vấn đề

`cli/validate-documents.js:251-252` khai báo state ở module level:

```js
const _bundleMismatchMap = new Map();
let _bundleTemplatePatternsCache = null;
```

State này **persist across calls** khi module được import như library. Public API tại `lib/index.js:74-79` re-export `validateDocument` từ CLI module:

```js
export { validateDocument, findDocuments, findAllFiles, ... } from '../cli/validate-documents.js';
```

Scenario bị ảnh hưởng:
```js
// Consumer code
import { validateDocument } from 'claude-code-vault-keeper';

// First call: vault A
await validateDocument('vault-a/doc.md', { projectRoot: '/vault-a' });

// Second call: vault B — _bundleMismatchMap still has vault-a data!
await validateDocument('vault-b/doc.md', { projectRoot: '/vault-b' });
// → stale bundle-mismatch data from vault-a bleeds into vault-b validation
```

## Giải pháp

### Option A (Quick): Reset state per `validateDocument` call

```js
// cli/validate-documents.js

export async function validateDocument(docPath, options = {}) {
  // Reset module state at start of each call when projectRoot changes
  if (options.projectRoot !== _lastProjectRoot) {
    _bundleMismatchMap.clear();
    _bundleTemplatePatternsCache = null;
    _lastProjectRoot = options.projectRoot;
  }
  // ...existing logic...
}
```

### Option B (Clean): Scope cache to projectRoot key

```js
// cli/validate-documents.js

const _bundleMismatchMaps = new Map(); // projectRoot -> Map
const _bundleTemplatePatternsMap = new Map(); // projectRoot -> patterns

function getBundleMismatchMap(projectRoot) {
  if (!_bundleMismatchMaps.has(projectRoot)) {
    _bundleMismatchMaps.set(projectRoot, new Map());
  }
  return _bundleMismatchMaps.get(projectRoot);
}
```

### Option C (Cleanest): Pass context object

Refactor `validateDocument` để nhận context object thay vì dùng module state. Nhưng đây là bigger refactor.

## Recommendation

**Option B** — scope per projectRoot. Simple, correct, no breaking change.

## Files cần sửa

- `cli/validate-documents.js:251-252` — thêm `_bundleMismatchMaps: Map<projectRoot, Map>` thay thế

## Trade-offs

- **Pro:** Correct behavior khi validate multiple vaults trong cùng process
- **Con:** Memory leak nếu consumer validate infinite số vaults (hiếm) — có thể add LRU nếu cần
- **Pro:** Non-breaking: CLI use case (1 projectRoot) không thay đổi behavior

## Definition of Done

- [ ] Test: gọi `validateDocument` với 2 projectRoot khác nhau — không cross-contaminate
- [ ] Existing tests pass: `bun test ./tests`
- [ ] `bun test tests/public-api.test.js` — API test coverage
