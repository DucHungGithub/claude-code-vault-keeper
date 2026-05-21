# D3 — templateOnlyFields configurable via vault-keeper.json

**Effort:** S | **Impact:** LOW | **Category:** DX

## Vấn đề

`lib/validators.js:47-51` hardcode danh sách fields chỉ thuộc về template:

```js
const CONFIG = {
  templateOnlyFields: ['validation_rules', 'template_version', 'template_id'],
  // ...
};
```

Nếu vault thêm custom template-only field (ví dụ: `template_description`, `template_author`, `template_changelog`), leak detector sẽ không catch khi field đó xuất hiện trong document instance.

Vi phạm nguyên tắc "config in template, not plugin" — dù nhỏ, đây là hardcoded vault knowledge trong plugin.

## Giải pháp

Cho phép extend `templateOnlyFields` qua `vault-keeper.json`:

```json
// .claude/vault-keeper.json
{
  "vaultFolders": ["notes/"],
  "templateOnlyFields": ["template_description", "template_author"]
}
```

Plugin merge với defaults:

```js
// lib/vault-config.js — trong loadVaultConfig()
const userFields = config.templateOnlyFields ?? [];
const merged = [...DEFAULT_TEMPLATE_ONLY_FIELDS, ...userFields];
```

Defaults vẫn giữ nguyên (`validation_rules`, `template_version`, `template_id`) — chỉ extend, không replace.

### Pseudocode

```js
// lib/vault-config.js

const DEFAULT_TEMPLATE_ONLY_FIELDS = ['validation_rules', 'template_version', 'template_id'];

export function loadVaultConfig(projectRoot) {
  // ...existing load logic...
  return {
    // ...existing fields...
    templateOnlyFields: [
      ...DEFAULT_TEMPLATE_ONLY_FIELDS,
      ...(rawConfig?.templateOnlyFields ?? []),
    ],
  };
}

// lib/validators.js — validateTemplateMetaLeak()
// Nhận templateOnlyFields từ ngoài thay vì đọc từ CONFIG hardcoded
export function validateTemplateMetaLeak(fm, templateOnlyFields = CONFIG.templateOnlyFields) {
  for (const field of templateOnlyFields) {
    if (fm[field] !== undefined) {
      issues.push(/* ... */);
    }
  }
}
```

## Files cần sửa

- `lib/vault-config.js` — thêm `templateOnlyFields` vào config schema, merge với defaults
- `lib/validators.js:47-51` — `validateTemplateMetaLeak` nhận param thay vì hardcode
- `cli/validate-documents.js` — pass `vaultConfig.templateOnlyFields` vào validator
- `server/validator.js` — pass `vaultConfig.templateOnlyFields` vào validator
- `tests/vault-config.test.js` — test merge logic
- `docs/vault-config.md` — document new field

## Trade-offs

- **Pro:** Vault-specific template metadata không bị leak vào instances mà không bị detect
- **Con:** Impact nhỏ, affect rất ít vault (chỉ vault có custom template metadata)

## Definition of Done

- [ ] `templateOnlyFields` trong vault-keeper.json được merge với defaults
- [ ] Custom fields bị detect khi leak vào document instances
- [ ] Backwards compatible: vaults không có config field → defaults hoạt động như cũ
- [ ] Test: custom field trong config, verify leak detection
