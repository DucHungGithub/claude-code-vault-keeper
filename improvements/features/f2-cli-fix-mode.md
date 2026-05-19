# F2 — `--fix` mode trong CLI

**Effort:** M | **Impact:** HIGH | **Category:** Feature

## Vấn đề

LSP đã có `server/providers/code-action.js` (18.1K) với đầy đủ logic tạo fix cho các lỗi phổ biến. CLI chỉ báo lỗi, không apply fixes. User phải tự sửa tay từng file.

Đặc biệt hữu ích khi onboard vault cũ có 200+ docs cần sửa cùng lúc.

Các lỗi có machine-applicable fix:
1. **Template-meta-leak** — xóa field `validation_rules`/`template_id`/`template_version` khỏi frontmatter instance
2. **Missing required field** — thêm `field: <placeholder>` vào frontmatter
3. **Relative path** — đổi `./foo.md` → `/absolute/foo.md` trong frontmatter
4. **Invalid filename** — rename file theo `suggestSlug()` từ `validators.js:404`

## Giải pháp

### Interface

```bash
vault-keeper validate --fix          # dry-run: show what would change
vault-keeper validate --fix --write  # apply changes to disk
```

Dry-run là default để tránh surprise data loss.

### Pseudocode

```js
// cli/validate-documents.js

async function applyFix(docPath, issue) {
  const content = await fs.readFile(docPath, 'utf-8');
  const { data: fm, content: body } = matter(content);

  switch (issue.fixType) {
    case 'remove-field':
      delete fm[issue.field];
      break;
    case 'add-field':
      fm[issue.field] = issue.placeholder ?? '';
      break;
    case 'replace-path':
      // replace relative path in frontmatter value
      fm[issue.field] = fm[issue.field].replace(issue.oldPath, issue.newPath);
      break;
    // rename handled separately (fs.rename + update all incoming links)
  }

  return matter.stringify(body, fm);
}

// Trong main validate loop:
if (args.fix) {
  for (const issue of issues) {
    if (issue.autoFixable) {
      const newContent = await applyFix(docPath, issue);
      if (args.write) {
        await fs.writeFile(docPath, newContent);
      } else {
        console.log(`Would fix: ${issue.message} in ${docPath}`);
      }
    }
  }
}
```

### Issue schema cần extend

Mỗi issue từ validators cần thêm:

```js
{
  field: 'status',
  message: 'Missing required field: status',
  fix: 'Add status to frontmatter',
  // NEW:
  autoFixable: true,
  fixType: 'add-field',
  placeholder: '',
}
```

## Files cần sửa

- `lib/validators.js` — thêm `autoFixable`, `fixType`, `placeholder` vào issue objects
- `cli/validate-documents.js` — thêm `applyFix()`, wire `--fix` + `--write` flags
- `cli/main.js` — update help text
- `tests/validate-documents.test.js` — test dry-run output, test write mode

## Trade-offs

- **Pro:** Massive DX win — onboard 500-doc vault không cần sửa tay
- **Con:** Risk data loss nếu fix logic sai → dry-run default là bắt buộc
- **Con:** Rename fix phức tạp hơn (cần update incoming links) — có thể defer sang v2
- **Con:** matter.stringify có thể thay đổi YAML formatting — cần canonical formatter

## Definition of Done

- [ ] `--fix` (dry-run) liệt kê tất cả changes mà không write
- [ ] `--fix --write` apply changes và re-validate → zero errors
- [ ] Rename fix (optional v1): chỉ suggest, không auto-apply
- [ ] Tests: fix template-meta-leak, fix missing required field, verify idempotent
