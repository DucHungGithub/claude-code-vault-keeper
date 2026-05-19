# T2 — validateLinkExistence focused tests

**Effort:** S | **Impact:** MEDIUM | **Category:** Testing

## Vấn đề

`cli/validate-documents.js:100-126` implement `validateLinkExistence` — function đọc frontmatter links và check file tồn tại trên disk. Không có dedicated test cho function này.

Integration test (`validate-documents.integration.test.js`) có thể cover gián tiếp nhưng không có focused test cho:
- Broken link detection
- Anchor stripping (`doc.md#section` → chỉ check `doc.md`)
- `resolveDocPath` fallback behavior
- Link trong array vs string field
- Absolute vs relative path links

## Giải pháp

Thêm test cases trong `tests/validate-documents.test.js` hoặc tạo `tests/validate-link-existence.test.js`.

### Test cases cần cover

```js
// tests/validate-link-existence.test.js

import { test, expect } from 'bun:test';
import { validateLinkExistence } from '../cli/validate-documents.js';
// hoặc test qua validateDocument

// 1. Valid link → no error
test('valid link to existing file: no error', async () => {
  // Setup fixture: doc với link đến file tồn tại
  const issues = await validateLinkExistence(
    { relationships: { parent: 'templates/note.md' } },
    '/tmp/vault',
    '/tmp/vault/notes/doc.md'
  );
  expect(issues).toHaveLength(0);
});

// 2. Broken link → error
test('broken link to missing file: reports error', async () => {
  const issues = await validateLinkExistence(
    { relationships: { parent: 'notes/missing.md' } },
    '/tmp/vault',
    '/tmp/vault/notes/doc.md'
  );
  expect(issues).toHaveLength(1);
  expect(issues[0].message).toContain('missing.md');
});

// 3. Link với anchor stripped correctly
test('link with anchor: checks file not anchor', async () => {
  // 'notes/existing.md#section' → check 'notes/existing.md'
  const issues = await validateLinkExistence(
    { ref: 'notes/existing.md#introduction' },
    '/tmp/vault',
    '/tmp/vault/notes/doc.md'
  );
  expect(issues).toHaveLength(0); // file exists, anchor ignored
});

// 4. Array of links
test('array of links: checks all entries', async () => {
  const issues = await validateLinkExistence(
    { related: ['notes/a.md', 'notes/missing.md'] },
    '/tmp/vault',
    '/tmp/vault/notes/doc.md'
  );
  expect(issues).toHaveLength(1); // only missing.md fails
});

// 5. Non-markdown values skipped
test('non-path values in frontmatter: skipped', async () => {
  const issues = await validateLinkExistence(
    { status: 'draft', count: 42 },
    '/tmp/vault',
    '/tmp/vault/notes/doc.md'
  );
  expect(issues).toHaveLength(0);
});
```

## Files cần sửa/tạo

- `tests/validate-link-existence.test.js` — new file với focused tests
- `cli/validate-documents.js` — nếu `validateLinkExistence` chưa được export, export nó

## Trade-offs

- **Pro:** Regression protection cho một feature quan trọng
- **Con:** Tests cần fixtures trên disk hoặc mock `fs` — chọn temp dir approach cho consistency

## Definition of Done

- [ ] Test cover: valid link, broken link, anchor stripping, array links, non-path values
- [ ] `bun test tests/validate-link-existence.test.js` pass
- [ ] Edge case: link với `../` relative path
