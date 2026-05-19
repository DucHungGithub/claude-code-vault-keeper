# A1 — Tách LSP bundle thành package riêng

**Effort:** M | **Impact:** MEDIUM | **Category:** Architecture

## Vấn đề

`server/main.bundled.cjs` (1.5MB, 44,919 lines) được list trong `package.json:files` và ship cùng mọi npm install. Bundle này embed `vscode-languageserver`, `gray-matter`, `remark-parse`, `unified`, `remark-gfm`, `js-yaml`, `mdast-util-to-string`.

Ai chỉ dùng programmatic API:
```js
import { parseBody, validateDocument } from 'claude-code-vault-keeper';
```

Vẫn phải download 1.5MB LSP bundle mà không bao giờ dùng.

`package.json:main` trỏ đến `lib/index.js` (barrel) — bundle không được load khi import API. Nhưng nó vẫn tốn disk space và pollute `node_modules`.

## Giải pháp

### Option A (Recommended): Exclude bundle từ npm package

```json
// package.json — files array
"files": [
  "cli/",
  // REMOVE: "server/main.bundled.cjs",
  "server/main.js",
  "server/smoke.js",
  "server/validator.js",
  "server/frontmatter-lines.js",
  "server/position-context.js",
  "server/diagnostics.js",
  "server/vault-index.js",
  "server/providers/",
  "lib/",
  "examples/",
  "monitors/",
  ".claude-plugin/",
  ".lsp.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE"
]
```

User install LSP plugin qua:
```bash
vault-keeper install-claude-code-plugin
# Script này download bundle riêng từ GitHub releases
```

Bundle vẫn được build và upload lên GitHub releases, chỉ không ship trong npm tarball.

### Option B: Tách thành 2 packages

```
claude-code-vault-keeper        → lib/ + cli/ (API + CLI, ~50KB)
claude-code-vault-keeper-lsp    → server/ (LSP server, ~1.5MB)
```

**Pros B:** Clean separation, users install exactly what they need  
**Cons B:** 2 packages cần version sync, `install-claude-code-plugin` phức tạp hơn

## Recommendation

**Option A** simpler: chỉ exclude bundle khỏi npm, vẫn ship source `server/*.js` cho users muốn build tự. Bundle được download on-demand qua install script.

## Files cần sửa

- `package.json:files` — remove `server/main.bundled.cjs`
- `cli/main.js:install-claude-code-plugin` — update install script để download bundle từ GitHub releases
- `scripts/` — thêm script upload bundle lên GitHub releases trong CI
- `.github/workflows/` — update release workflow
- `docs/getting-started.md` — update install instructions

## Trade-offs

- **Pro:** npm install giảm từ ~1.6MB xuống ~100KB
- **Con:** `install-claude-code-plugin` cần network access thêm (download bundle)
- **Con:** Offline install không còn work cho LSP
- **Con:** Breaking change: users install bằng script tự-copy bundle sẽ bị ảnh hưởng

## Definition of Done

- [ ] `npm pack` output không chứa `main.bundled.cjs`
- [ ] `vault-keeper install-claude-code-plugin` vẫn hoạt động (download bundle từ releases)
- [ ] LSP vẫn activate sau install
- [ ] CI build + upload bundle lên GitHub releases
- [ ] Docs update
