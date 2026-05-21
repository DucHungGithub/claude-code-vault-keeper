# A3 — Vault config cache invalidation

**Effort:** S | **Impact:** LOW | **Category:** Architecture

## Vấn đề

`lib/vault-config.js:88` dùng module-level Map cache không bao giờ invalidate:

```js
const _configCache = new Map(); // absPath -> config (NEVER cleared)
```

Nếu user sửa `.claude/vault-keeper.json` khi LSP đang chạy:
- Config mới không được load
- `vaultFolders` cũ → docs mới không được validate hoặc bị validate sai
- `excludePatterns` cũ → wrong files included/excluded
- LSP phải restart để pick up changes

## Giải pháp

### Option A (Simple): Mtime-based invalidation

```js
// lib/vault-config.js

const _configCache = new Map(); // absPath -> { config, mtime }

export async function loadVaultConfig(projectRoot) {
  const configPath = resolve(projectRoot, '.claude', 'vault-keeper.json');

  let mtime = null;
  try {
    const stat = await fs.stat(configPath);
    mtime = stat.mtimeMs;
  } catch {
    // File doesn't exist → use defaults, no cache
    return DEFAULT_CONFIG;
  }

  const cached = _configCache.get(configPath);
  if (cached && cached.mtime === mtime) {
    return cached.config;
  }

  const config = parseConfig(await fs.readFile(configPath, 'utf-8'));
  _configCache.set(configPath, { config, mtime });
  return config;
}
```

### Option B: LSP workspace/didChangeConfiguration handler

```js
// server/main.js

connection.onDidChangeConfiguration(() => {
  // Clear vault config cache → next validation picks up new config
  clearVaultConfigCache(); // export this from vault-config.js
  // Also rebuild vault index with new vaultFolders/excludePatterns
  vaultIndex.invalidate();
});
```

Cần client gửi `workspace/didChangeConfiguration` khi user save `.claude/vault-keeper.json` — không phải tất cả clients tự làm điều này.

## Recommendation

**Option A** là safe bet — work với mọi client, không cần client cooperation.
**Option B** bổ sung thêm (not replace) nếu muốn instant reload.

## Files cần sửa

- `lib/vault-config.js` — thêm mtime check, export `clearVaultConfigCache()`
- `server/main.js` — optional: thêm `onDidChangeConfiguration` handler
- `tests/vault-config.test.js` — test: sửa config file, verify cache miss

## Trade-offs

- **Pro:** Config changes được pick up automatically, không cần restart LSP
- **Con:** Thêm 1 `fs.stat` call per validation pass (cheap)
- **Con:** Nếu config bị sửa mid-validation, có thể gây inconsistency (edge case, acceptable)

## Definition of Done

- [ ] Sửa `.claude/vault-keeper.json` → next validation dùng config mới
- [ ] Không restart LSP required
- [ ] Test: modify config, assert cache miss on next load
