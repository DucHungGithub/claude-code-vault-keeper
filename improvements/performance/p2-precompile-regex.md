# P2 — Pre-compile regex trong normalizeRules()

**Effort:** S | **Impact:** MEDIUM | **Category:** Performance

## Vấn đề

`new RegExp(rule.regex)` được compile lại **mỗi lần gọi `applyRules`** — tức là mỗi lần validate một document.

- `lib/validators.js:240` — `new RegExp(rule.regex).test(value)` bên trong vòng lặp field_rules
- `lib/validators.js:307` — compile thêm một regex cho body section check
- `cli/validate-documents.js:63` — compile `path_regex` per document (không nhất quán với cách line 270 cache bundle-mismatch patterns)

Vault 500 docs × 10 field_rules có regex = **5000 regex compilations** mỗi CLI run.
Các regex strings từ template `validation_rules` là stable — compile 1 lần là đủ.

## Giải pháp

Compile regex một lần trong `normalizeRules()` và lưu `RegExp` object vào rule.

### Pseudocode

```js
// lib/template-rules.js — trong normalizeRules()

function normalizeRules(raw) {
  // ... existing normalization ...

  if (Array.isArray(rules.field_rules)) {
    rules.field_rules = rules.field_rules.map(r => ({
      ...r,
      // compile once here, reuse in applyRules
      _compiledRegex: r.regex ? new RegExp(r.regex) : null,
    }));
  }

  if (rules.path_regex) {
    rules._compiledPathRegex = new RegExp(rules.path_regex);
  }

  return rules;
}

// lib/validators.js — trong applyRules()
// Thay: new RegExp(rule.regex).test(value)
// Bằng: rule._compiledRegex.test(value)
```

Prefix `_` để phân biệt với raw config fields (không leak vào serialized output).

## Files cần sửa

- `lib/template-rules.js` — thêm compile step trong `normalizeRules()`
- `lib/validators.js:240,307` — dùng `rule._compiledRegex` thay vì `new RegExp(...)`
- `cli/validate-documents.js:63` — dùng `rules._compiledPathRegex` thay vì compile mới

## Trade-offs

- **Pro:** Zero regex compilation cost tại validation time
- **Con:** `_compiledRegex` không JSON-serializable — nếu rules được log/stringify cần skip field này
- **Con:** Nếu combine với P1 (cache), rules object cần freeze để tránh mutation

## Definition of Done

- [ ] `normalizeRules()` compile tất cả regex fields
- [ ] `applyRules()` dùng compiled regex, không gọi `new RegExp` nữa
- [ ] Tests hiện tại pass: `bun test ./tests`
- [ ] Benchmark trước/sau trên example vault (optional nhưng tốt)
