# D1 — Structured error từ loadTemplateRules

**Effort:** S | **Impact:** HIGH | **Category:** DX

## Vấn đề

Khi template load fail, cả `server/validator.js:101-107` và `cli/validate-documents.js:189-194` đều emit cùng một message mơ hồ:

```
Cannot load validation_rules from template 'templates/book.md'
-- file not found, malformed YAML, or missing validation_rules block
```

`lib/template-rules.js:52-54` swallow read error, `lib/template-rules.js:61-63` swallow YAML parse error — cả hai chỉ return `null`. User không thể phân biệt:

1. File không tồn tại
2. YAML syntax error (và ở dòng nào)
3. `validation_rules` block bị thiếu trong template
4. `validation_rules` present nhưng empty/null

## Giải pháp

Thay vì return `null`, return `{ rules, error }` object.

### Pseudocode

```js
// lib/template-rules.js

/**
 * @returns {{ rules: NormalizedRules | null, error: string | null }}
 */
export async function loadTemplateRules(templatePath, projectRoot) {
  const absPath = resolve(projectRoot, templatePath);

  let content;
  try {
    content = await fs.readFile(absPath, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { rules: null, error: `Template file not found: ${absPath}` };
    }
    return { rules: null, error: `Cannot read template: ${e.message}` };
  }

  let data;
  try {
    ({ data } = matter(content));
  } catch (e) {
    return { rules: null, error: `YAML syntax error in template: ${e.message}` };
  }

  if (!data.validation_rules) {
    return { rules: null, error: `Template has no 'validation_rules' block: ${absPath}` };
  }

  return { rules: normalizeRules(data.validation_rules), error: null };
}
```

### Update call sites

```js
// server/validator.js:98
const { rules, error } = await loadTemplateRules(fm.template, projectRoot);
if (error) {
  issues.push({ field: 'template', level: 'error', message: error });
  return issues;
}

// cli/validate-documents.js:189
const { rules, error } = await loadTemplateRules(fm.template, projectRoot);
if (error) {
  result.issues.push({ field: 'template', level: 'error', message: error });
  continue;
}
```

## Files cần sửa

- `lib/template-rules.js` — return `{ rules, error }` thay vì bare `null`
- `server/validator.js:101-107` — destructure result, use `error` message
- `cli/validate-documents.js:189-194` — destructure result, use `error` message
- `tests/template-rules.test.js` — test 4 error cases riêng biệt

## Breaking change

Callers hiện tại check `if (rules === null)` — cần update thành `if (rules === null && error)`.

Nhưng đây là internal call sites, không phải public API — nên không phải semver breaking.

## Trade-offs

- **Pro:** User biết chính xác cần fix gì, không cần trial-and-error
- **Con:** Nhỏ: thay đổi return type của `loadTemplateRules` — cần update 4 call sites

## Definition of Done

- [ ] `loadTemplateRules` return `{ rules, error }` với error message cụ thể cho từng case
- [ ] Tất cả 4 call sites được update
- [ ] Test 4 error cases: ENOENT, YAML syntax, missing block, empty block
- [ ] User-facing error message phân biệt rõ ràng 4 loại lỗi
