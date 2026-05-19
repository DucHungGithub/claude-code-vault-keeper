# API2 — Document section-rules API trong programmatic-usage.md

**Effort:** S | **Impact:** LOW | **Category:** API

## Vấn đề

`lib/index.js:33-35` export 3 section-rules functions:

```js
export {
  parseSectionRules,
  loadTemplateSectionRules,
  getRequiredSections,
} from "./template-section-rules.js";
```

Nhưng `docs/programmatic-usage.md` (updated v0.7.0) không cover surface này. Consumer muốn:
- Build custom body validator
- Lint template body sections
- Check nếu doc có đủ required sections

...phải đọc source code của `lib/template-section-rules.js` để hiểu return shape và usage.

## Giải pháp

Thêm section về section-rules vào `docs/programmatic-usage.md`.

### Nội dung cần thêm

```markdown
## Section rules

Section rules validate the body of a document against per-section constraints
declared in the template's `validation_rules.body_section_formats`.

### parseSectionRules(templateContent)

Parse the section-rules fences from a template's body.

```js
import { parseSectionRules } from 'claude-code-vault-keeper';

const templateContent = `
## Summary
\`\`\`section-rules
required: true
format: prose
\`\`\`

## References
`;

const sectionRules = parseSectionRules(templateContent);
// Returns: Map<sectionHeading, { required, format, ... }>
```

### loadTemplateSectionRules(templatePath, projectRoot)

Load and parse section rules from a template file on disk.

```js
import { loadTemplateSectionRules } from 'claude-code-vault-keeper';

const sectionRules = await loadTemplateSectionRules(
  'templates/book.md',
  '/path/to/vault'
);
```

### getRequiredSections(sectionRules)

Extract the list of required section headings from parsed rules.

```js
import { getRequiredSections } from 'claude-code-vault-keeper';

const required = getRequiredSections(sectionRules);
// Returns: string[] — e.g., ['Summary', 'Takeaways']

// Check if a doc has all required sections:
const docSections = parseBody(docContent).sections.map(s => s.heading);
const missing = required.filter(s => !docSections.includes(s));
```
```

## Files cần sửa

- `docs/programmatic-usage.md` — thêm section về section-rules với examples
- `tests/public-api.test.js` — thêm test confirm section-rules functions importable + basic smoke

## Trade-offs

- **Pro:** Advanced users không cần read source để use section-rules API
- **Con:** Nhỏ: tốn thời gian viết docs; không thay đổi code

## Definition of Done

- [ ] `docs/programmatic-usage.md` có section với examples cho cả 3 functions
- [ ] Examples chạy được (verify bằng cách chạy thử)
- [ ] `tests/public-api.test.js` import section-rules functions thành công
