# P1 — Cache loadTemplateRules với mtime invalidation

**Effort:** S | **Impact:** HIGH | **Category:** Performance

## Vấn đề

`loadTemplateRules` đọc file template từ disk và parse YAML **mỗi lần validate một document**.

- `server/validator.js:98` gọi `loadTemplateRules(fm.template, projectRoot)` trên mỗi validation pass
- `lib/template-rules.js:42-104` đọc file, parse gray-matter, normalize — không có cache nào
- `loadTemplateSectionRules` tại `server/validator.js:99` có cùng vấn đề
- Vault 500 docs × 1 template = 1000 disk reads mỗi lần chạy CLI

So sánh: `lib/vault-config.js:88,110` đã dùng `Map` cache đúng cách — template rules cần được xử lý tương tự.

## Giải pháp

Thêm module-level cache `Map<absPath, { rules, mtime }>` trong `lib/template-rules.js`.

### Pseudocode

```js
// lib/template-rules.js

const _cache = new Map(); // { absPath -> { rules, mtime } }

export async function loadTemplateRules(templatePath, projectRoot) {
  const absPath = resolve(projectRoot, templatePath);
  const stat = await fs.stat(absPath);
  const mtime = stat.mtimeMs;

  const cached = _cache.get(absPath);
  if (cached && cached.mtime === mtime) {
    return cached.rules;
  }

  const content = await fs.readFile(absPath, 'utf-8');
  const { data } = matter(content);
  const rules = normalizeRules(data.validation_rules ?? null);

  _cache.set(absPath, { rules, mtime });
  return rules;
}
```

Làm tương tự cho `loadTemplateSectionRules` trong `lib/template-section-rules.js`.

## Files cần sửa

- `lib/template-rules.js` — thêm cache Map + mtime check
- `lib/template-section-rules.js` — thêm cache tương tự
- `tests/template-rules.test.js` — thêm test: gọi 2 lần, assert file chỉ đọc 1 lần; sửa mtime, assert re-read

## Trade-offs

- **Pro:** Loại bỏ N disk reads mỗi run; đặc biệt rõ ràng trên vault lớn
- **Con:** Stale nếu template bị sửa bởi process khác mà không thay mtime (hiếm)
- **Con:** Compiled rules không JSON-serializable nếu cần log — không ảnh hưởng đến use case hiện tại

## Definition of Done

- [ ] Cache hoạt động: 500 docs cùng template → 1 disk read duy nhất
- [ ] Mtime invalidation: sửa template → lần validate sau dùng rules mới
- [ ] Tests pass: `bun test ./tests`
