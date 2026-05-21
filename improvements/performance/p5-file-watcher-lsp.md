# P5 — Register file watcher trong LSP

**Effort:** M | **Impact:** MEDIUM | **Category:** Performance / Correctness

## Vấn đề

LSP server (`server/main.js:210-216`) chỉ refresh vault index khi `didSave` — tức là khi user save file trong editor. Các thay đổi từ bên ngoài editor (git checkout, CLI script, file manager, rename trong terminal) làm index stale cho đến khi restart LSP.

Confirmed: không có `FileSystemWatcher` hay `onDidChangeWatchedFiles` nào trong `server/main.js`.

Hậu quả:
- Backlinks stale sau `git pull`
- Workspace symbol search miss docs mới
- Definition jump đến file đã bị rename → error

## Giải pháp

Register workspace file watcher trong `onInitialize`, handle `onDidChangeWatchedFiles`.

### Pseudocode

```js
// server/main.js — trong onInitialize response

connection.onInitialize((params) => {
  return {
    capabilities: {
      // ...existing capabilities...
      workspace: {
        fileOperations: {
          didCreate: { filters: [{ pattern: { glob: '**/*.md' } }] },
          didRename: { filters: [{ pattern: { glob: '**/*.md' } }] },
          didDelete: { filters: [{ pattern: { glob: '**/*.md' } }] },
        },
      },
    },
  };
});

// Handler cho external file changes
connection.workspace.onDidCreateFiles(({ files }) => {
  for (const { uri } of files) vaultIndex.refreshFile(uriToPath(uri));
});

connection.workspace.onDidRenameFiles(({ files }) => {
  for (const { oldUri, newUri } of files) {
    vaultIndex.removeFile(uriToPath(oldUri));
    vaultIndex.refreshFile(uriToPath(newUri));
  }
});

connection.workspace.onDidDeleteFiles(({ files }) => {
  for (const { uri } of files) vaultIndex.removeFile(uriToPath(uri));
});
```

Ngoài ra, nếu client support `workspace/didChangeWatchedFiles`:

```js
// Trong onInitialized (sau init)
connection.client.register(DidChangeWatchedFilesNotification.type, {
  watchers: [{ globPattern: '**/*.md' }],
});

connection.onDidChangeWatchedFiles(({ changes }) => {
  for (const change of changes) {
    if (change.type === FileChangeType.Deleted) {
      vaultIndex.removeFile(uriToPath(change.uri));
    } else {
      vaultIndex.refreshFile(uriToPath(change.uri));
    }
  }
});
```

## Files cần sửa

- `server/main.js` — thêm file watcher registration + handlers
- `server/vault-index.js` — thêm `removeFile(absPath)` method nếu chưa có

## Trade-offs

- **Pro:** Index luôn fresh sau git operations
- **Con:** Không phải tất cả LSP clients support file watchers (Claude Code cần verify)
- **Con:** Tăng số event handlers, cần debounce nếu nhiều files thay đổi cùng lúc (e.g., git checkout)

## Definition of Done

- [ ] File tạo ngoài editor → xuất hiện trong workspace symbol search
- [ ] File xóa ngoài editor → không còn trong backlinks
- [ ] File rename ngoài editor → incoming links được update (hoặc đánh dấu broken)
- [ ] Hoạt động với Claude Code LSP client
