# D2 — `vault-keeper add-template` scaffold command

**Effort:** S | **Impact:** MEDIUM | **Category:** DX

## Vấn đề

`vault-keeper init` (v0.6.0) tạo vault với 1 template mẫu. Nhưng không có lệnh nào để thêm template mới vào vault đang tồn tại.

User phải:
1. Copy template cũ
2. Tự nhớ structure của `validation_rules`
3. Dễ sai YAML indentation (2 spaces vs 4 spaces)
4. Không biết tất cả các fields hỗ trợ

## Giải pháp

### Interface

```bash
vault-keeper add-template book
# → tạo templates/book.md với skeleton validation_rules
```

### Template output

```markdown
---
template_id: book
template_version: 1
validation_rules:
  # Đường dẫn docs phải match regex này (relative to vault root)
  # path_regex: "^library/books/[a-z0-9-]+\\.md$"

  # Fields bắt buộc phải có trong frontmatter
  required_fields: [title]

  # Fields được phép nhưng không bắt buộc
  optional_fields: [tags, created]

  # Rules chi tiết cho từng field
  field_rules:
    # Ví dụ enum field:
    # - field: status
    #   values: [draft, published, archived]

    # Ví dụ integer field với min/max:
    # - field: rating
    #   type: integer
    #   min: 1
    #   max: 5

    # Ví dụ regex field:
    # - field: slug
    #   regex: "^[a-z0-9-]+$"

  # State machine (transitions hợp lệ giữa status values)
  # state_machine:
  #   draft: [review, abandoned]
  #   review: [published, draft]
  #   published: []
  #   abandoned: [draft]

  # Sections bắt buộc trong body (H2 headings)
  # required_body_sections: [Summary, References]

  # Thứ tự sections
  # sections: [Summary, Notes, References]
---

# Book template

<!-- Xóa các comment trên và điền rules thực tế của bạn -->

## Summary

## Notes
```

### Pseudocode

```js
// cli/main.js — add-template subcommand

case 'add-template': {
  const name = args[1];
  if (!name) { console.error('Usage: vault-keeper add-template <name>'); process.exit(1); }

  const outPath = resolve(projectRoot, 'templates', `${name}.md`);
  if (existsSync(outPath)) {
    console.error(`Template already exists: ${outPath}`);
    process.exit(1);
  }

  const content = generateTemplateScaffold(name);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content);
  console.log(`Created: ${outPath}`);
  console.log(`Edit validation_rules to match your ${name} docs.`);
  break;
}
```

## Files cần sửa

- `cli/main.js` — thêm `add-template` subcommand + help text
- `cli/templates/scaffold.js` — new file: `generateTemplateScaffold(name)` function
- `tests/cli-main.test.js` — test: command tạo file đúng path, error nếu đã tồn tại

## Trade-offs

- **Pro:** Onboarding nhanh hơn — không cần nhớ YAML schema
- **Con:** Comments trong scaffold template sẽ bị format/strip nếu user chạy canonical formatter
- **Con:** Nhỏ: thêm 1 subcommand

## Definition of Done

- [ ] `vault-keeper add-template <name>` tạo `templates/<name>.md` với skeleton đầy đủ
- [ ] Error nếu template đã tồn tại
- [ ] Skeleton có đủ examples cho tất cả validation_rules fields
- [ ] Test: tạo template, verify file content, verify error case
