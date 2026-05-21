# P4 — O(1) resolveId lookup map trong VaultIndex

**Effort:** S | **Impact:** MEDIUM | **Category:** Performance

## Vấn đề

`server/vault-index.js:109-118` implement `resolveId()` bằng linear scan toàn bộ `_docs` Map:

```js
resolveId(id) {
  for (const [absPath, doc] of this._docs) {
    if (doc.id === id) return absPath;
  }
  return null;
}
```

Với hover trên một document có 20 ID references, và vault 1000 docs → **20,000 iterations per hover**.
`resolveId` được gọi từ `server/providers/` mỗi khi render hover hoặc definition.

## Giải pháp

Build thêm `Map<normalizedId, absPath>` trong `_buildIndex` và `refreshFile`.

### Pseudocode

```js
// server/vault-index.js

class VaultIndex {
  constructor(projectRoot) {
    this._docs = new Map();     // absPath -> doc
    this._idMap = new Map();    // normalizedId -> absPath  (NEW)
    // ...
  }

  _indexDoc(absPath, doc) {
    this._docs.set(absPath, doc);
    if (doc.id) {
      this._idMap.set(doc.id.toLowerCase(), absPath); // normalize
    }
  }

  _removeDoc(absPath) {
    const doc = this._docs.get(absPath);
    if (doc?.id) this._idMap.delete(doc.id.toLowerCase());
    this._docs.delete(absPath);
  }

  resolveId(id) {
    return this._idMap.get(id.toLowerCase()) ?? null; // O(1)
  }
}
```

## Files cần sửa

- `server/vault-index.js` — thêm `_idMap`, update `_buildIndex`, `refreshFile`, `resolveId`

## Trade-offs

- **Pro:** O(1) lookup — không ảnh hưởng khi vault lớn
- **Con:** Thêm ~1 Map entry per doc — memory negligible
- **Con:** Nếu 2 docs có cùng ID → last-write-wins. Cần log warning (đây cũng là validation error nên OK)

## Definition of Done

- [ ] `resolveId()` dùng `_idMap`, không dùng loop
- [ ] `refreshFile()` update `_idMap` đúng khi doc được thêm/xóa/sửa
- [ ] Test: 1000 doc index, `resolveId` trả đúng kết quả
