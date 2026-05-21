# P3 — Honor excludePatterns trong VaultIndex._walkDir

**Effort:** S | **Impact:** MEDIUM | **Category:** Performance / Correctness

## Vấn đề

`server/vault-index.js:174` hardcode danh sách thư mục bỏ qua:

```js
const SKIP = new Set(["codebase", "node_modules", ".git", ".omc"]);
```

Trong khi đó `lib/vault-config.js:25-31` đã định nghĩa `excludePatterns` (array of globs như `**/.vitepress/**`, `**/archive/**`). VaultIndex không đọc vault config, nên:

- Docs trong folder `archive/` vẫn xuất hiện trong backlink graph và workspace symbol search
- Custom excludes của user hoàn toàn bị bỏ qua trong LSP context
- Bất nhất với CLI: CLI đọc vault config và filter đúng, LSP thì không

## Giải pháp

Load vault config trong `VaultIndex` và filter `_walkDir` theo `excludePatterns`.

### Pseudocode

```js
// server/vault-index.js

import { loadVaultConfig } from '../lib/vault-config.js';
import { minimatch } from 'minimatch'; // already available via glob dep

class VaultIndex {
  constructor(projectRoot) {
    this._projectRoot = projectRoot;
    this._excludePatterns = null; // lazy load
  }

  async _getExcludePatterns() {
    if (this._excludePatterns === null) {
      const config = await loadVaultConfig(this._projectRoot);
      this._excludePatterns = config.excludePatterns ?? [];
    }
    return this._excludePatterns;
  }

  async _walkDir(dir) {
    const excludePatterns = await this._getExcludePatterns();
    // ...existing walk logic...
    // Thêm check:
    const relPath = relative(this._projectRoot, entry.path);
    if (excludePatterns.some(p => minimatch(relPath, p))) continue;
  }
}
```

## Files cần sửa

- `server/vault-index.js` — import `loadVaultConfig`, thêm exclude filter trong `_walkDir`
- `tests/` — thêm test: vault với `excludePatterns: ["**/archive/**"]`, assert docs trong `archive/` không có trong index

## Trade-offs

- **Pro:** LSP và CLI nhất quán về việc ignore files
- **Pro:** Giảm index size và memory footprint cho vaults có archive lớn
- **Con:** Thêm một `loadVaultConfig` call khi init index (nhưng đã được cache bởi vault-config)

## Definition of Done

- [ ] `_walkDir` filter files theo `excludePatterns` từ vault config
- [ ] Test: docs trong excluded folder không xuất hiện trong `search()` và `getBacklinks()`
- [ ] Hardcoded SKIP set vẫn giữ lại (là defaults hợp lý)
