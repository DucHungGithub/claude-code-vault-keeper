# F3 — `vault-keeper lint-templates` command

**Effort:** M | **Impact:** MEDIUM | **Category:** Feature

## Vấn đề

Template files bị skip khi validate (`lib/validators.js:125-130`, `server/validator.js:50`). Nhưng template bản thân có thể có lỗi:

- `path_regex` là invalid regex → compile error chỉ xảy ra khi validate doc đầu tiên dùng template đó
- `condition` trong `conditional_required_fields` dùng operator không tồn tại
- `state_machine` có cycle (`draft → review → draft`) hoặc unreachable node
- `field_rules[].type` là giá trị không hợp lệ
- `required_body_sections` reference heading không có trong template body

Error message khi template bị lỗi trỏ đến **document**, không phải template → confusing cho user.

## Giải pháp

### Interface

```bash
vault-keeper lint-templates              # lint tất cả templates/
vault-keeper lint-templates templates/book.md  # lint specific template
```

Output:
```
📋 templates/book.md
   🚨 field_rules[2].regex: Invalid regex: /[unclosed/
      💡 Fix: Fix regex syntax

📋 templates/task.md
   ⚠️  state_machine: Unreachable node 'archived' (no transition leads to it)
      💡 Fix: Add a transition to 'archived' or remove it

✅ templates/note.md — valid

SUMMARY: 2 templates with issues / 3 total
```

### Checks cần implement

```js
function lintTemplate(templatePath) {
  const issues = [];
  const { data } = matter(readFileSync(templatePath));
  const rules = data.validation_rules;

  if (!rules) return []; // no rules = nothing to lint

  // 1. Compile all regexes
  for (const [i, r] of (rules.field_rules ?? []).entries()) {
    if (r.regex) {
      try { new RegExp(r.regex); }
      catch (e) { issues.push({ field: `field_rules[${i}].regex`, message: e.message }); }
    }
  }
  if (rules.path_regex) {
    try { new RegExp(rules.path_regex); }
    catch (e) { issues.push({ field: 'path_regex', message: e.message }); }
  }

  // 2. Validate state_machine
  if (rules.state_machine) {
    const nodes = new Set(Object.keys(rules.state_machine));
    for (const [from, tos] of Object.entries(rules.state_machine)) {
      for (const to of tos) {
        if (!nodes.has(to)) issues.push({
          field: 'state_machine',
          message: `Transition target '${to}' is not a declared node`,
        });
      }
    }
    // Check unreachable nodes (no incoming transition)
    // ...
  }

  // 3. Validate conditional DSL
  for (const crf of (rules.conditional_required_fields ?? [])) {
    try { evaluateCondition(crf.condition, {}); } // dry eval with empty data
    catch (e) { issues.push({ field: 'conditional_required_fields', message: e.message }); }
  }

  // 4. field_rules[].type values
  const VALID_TYPES = ['string', 'integer', 'number', 'boolean', 'array'];
  for (const [i, r] of (rules.field_rules ?? []).entries()) {
    if (r.type && !VALID_TYPES.includes(r.type)) {
      issues.push({ field: `field_rules[${i}].type`, message: `Unknown type '${r.type}'` });
    }
  }

  return issues;
}
```

## Files cần sửa

- `cli/main.js` — thêm `lint-templates` subcommand
- `cli/lint-templates.js` — new file: linter logic
- `lib/validators.js` — export VALID_TYPES constant
- `tests/lint-templates.test.js` — new file: fixture templates với lỗi, assert correct issues

## Trade-offs

- **Pro:** Catch template authoring bugs tại source, không phải khi validate 500 docs
- **Con:** `evaluateCondition` với empty data có thể false positive nếu DSL require certain fields exist
- **Con:** Thêm 1 subcommand vào CLI (nhỏ)

## Definition of Done

- [ ] `vault-keeper lint-templates` report đúng lỗi regex, state_machine, DSL
- [ ] Exit 0 khi tất cả templates valid, exit 1 khi có lỗi
- [ ] Integrate vào CI workflow docs
- [ ] Tests cover: invalid regex, unknown state_machine node, invalid DSL condition
