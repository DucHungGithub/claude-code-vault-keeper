# T1 — VaultIndex unit tests

**Effort:** M | **Impact:** HIGH | **Category:** Testing

## Vấn đề

`server/vault-index.js` là module quan trọng nhất cho tất cả cross-document LSP features (backlinks, workspace symbol, hover, definition, references) nhưng **có zero direct tests**.

Confirmed: trong `tests/` không có file nào test `VaultIndex` trực tiếp. Provider tests (`tests/providers/`) mock vault index bằng `makeVaultIndex` stub — không test actual behavior.

Hậu quả: bất kỳ refactor nào của vault-index (P3, P4) không có safety net.

## Giải pháp

Tạo `tests/vault-index.test.js` với test fixtures thực tế.

### Test cases cần cover

```js
// tests/vault-index.test.js

import { test, expect, beforeEach, afterEach } from 'bun:test';
import { VaultIndex } from '../server/vault-index.js';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

let tmpDir;
beforeEach(async () => { tmpDir = await mkdtemp(join(os.tmpdir(), 'vault-test-')); });
afterEach(async () => { await rm(tmpDir, { recursive: true }); });

// 1. _buildIndex: scan dir, find all .md files
test('builds index from markdown files', async () => {
  await writeFile(join(tmpDir, 'note-001.md'), '---\ntitle: Note One\nid: note-001\n---\n# Body');
  await writeFile(join(tmpDir, 'note-002.md'), '---\ntitle: Note Two\n---\n# Body\n[link](note-001.md)');

  const index = new VaultIndex(tmpDir);
  await index.ensureLoaded();

  expect(index.size()).toBe(2);
});

// 2. search: by id, title, filename
test('search finds docs by id', async () => {
  await writeFile(join(tmpDir, 'prd-001.md'), '---\ntitle: First PRD\n---');
  const index = new VaultIndex(tmpDir);
  await index.ensureLoaded();

  const results = index.search('prd-001');
  expect(results).toHaveLength(1);
  expect(results[0].title).toBe('First PRD');
});

// 3. getBacklinks: incoming link graph
test('tracks incoming links', async () => {
  await writeFile(join(tmpDir, 'target.md'), '---\ntitle: Target\n---');
  await writeFile(join(tmpDir, 'source.md'), '---\ntitle: Source\n---\n[see target](target.md)');

  const index = new VaultIndex(tmpDir);
  await index.ensureLoaded();

  const backlinks = index.getBacklinks(join(tmpDir, 'target.md'));
  expect(backlinks).toHaveLength(1);
  expect(backlinks[0].sourcePath).toContain('source.md');
});

// 4. resolveId: O(1) lookup
test('resolves doc id to abs path', async () => {
  await writeFile(join(tmpDir, 'task-001.md'), '---\ntitle: Task One\n---');
  const index = new VaultIndex(tmpDir);
  await index.ensureLoaded();

  const absPath = index.resolveId('task-001');
  expect(absPath).toContain('task-001.md');
});

// 5. refreshFile: incremental update
test('refreshes index when file changes', async () => {
  const filePath = join(tmpDir, 'note.md');
  await writeFile(filePath, '---\ntitle: Old Title\n---');

  const index = new VaultIndex(tmpDir);
  await index.ensureLoaded();

  await writeFile(filePath, '---\ntitle: New Title\n---');
  await index.refreshFile(filePath);

  const results = index.search('New Title');
  expect(results[0].title).toBe('New Title');
});

// 6. search capped at 50 results
test('search returns max 50 results', async () => {
  for (let i = 0; i < 60; i++) {
    await writeFile(join(tmpDir, `note-${i}.md`), `---\ntitle: Note ${i}\n---`);
  }
  const index = new VaultIndex(tmpDir);
  await index.ensureLoaded();

  const results = index.search('Note');
  expect(results.length).toBeLessThanOrEqual(50);
});

// 7. SKIP directories are excluded
test('skips node_modules', async () => {
  await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
  await writeFile(join(tmpDir, 'node_modules', 'dep.md'), '---\ntitle: Dep\n---');
  await writeFile(join(tmpDir, 'real.md'), '---\ntitle: Real\n---');

  const index = new VaultIndex(tmpDir);
  await index.ensureLoaded();

  expect(index.size()).toBe(1); // only real.md
});
```

## Files cần tạo

- `tests/vault-index.test.js` — test file mới

## Files có thể cần sửa

- `server/vault-index.js` — export `VaultIndex` class nếu chưa có named export; thêm `size()` method nếu cần

## Trade-offs

- **Pro:** Safety net cho P3, P4 và bất kỳ future refactor nào của vault-index
- **Con:** Tests dùng temp directory → chậm hơn pure unit tests (vẫn chấp nhận được)

## Definition of Done

- [ ] Tests cover: build, search, backlinks, resolveId, refreshFile, skip logic
- [ ] `bun test tests/vault-index.test.js` pass
- [ ] Coverage đủ để confident refactor vault-index sau
