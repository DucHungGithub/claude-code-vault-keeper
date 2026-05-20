# claude-code-vault-keeper — Plugin authoring principle

## Generic plugin, template-driven validation

> **This plugin is generic infrastructure, not a vault-specific implementation.**
> The goal: any team can drop `claude-code-vault-keeper` into their own knowledge vault and have it work — without forking the plugin or patching its JS. Vault-shaped settings (content root, scanned folders, exclude globs) come from `.claude/vault-keeper.json`; per-template path shape, required fields, and lifecycle live in template frontmatter. With no config file the built-in defaults apply (whole repo is the vault).

To preserve that property, two rules are non-negotiable:

### Rule 1 — Logic in the plugin, configuration in the template

- **Plugin (JS source under this directory) MUST stay vault-agnostic.** The CLI validator (`cli/validate-documents.js`), LSP server (`server/*.js`), and shared parsers (`lib/*.js`) must never hardcode:
  - Specific folder paths (e.g. `<some-vault>/<section>/<sub-section>/...`)
  - Specific filename prefixes (e.g. `<x>-NNN`)
  - Specific role names, tier names, status enums, phase enums, lifecycle states
  - Any list of allowed/required fields (every required-field list MUST come from a template's `fields:` schema)
- **All vault-specific configuration MUST live in template markdown frontmatter** under `fields:` (for frontmatter validation) and in `yaml section-rules` fences in the template body (for body validation). Templates are read at runtime; the plugin enforces whatever they declare.
- The validator's job is to LOAD the `fields:` schema and body `section-rules` from the template referenced by each document and ENFORCE them via the primitive registry (`lib/schema-engine.js`). The validator should never know what the vault's domain words mean — only what the template says about its own constraints.

### Rule 2 — When in doubt, add a template primitive, not a code branch

If you find yourself adding a new code path that does `if (someVaultSpecificCondition) { ... }` in plugin JS, stop. Instead:

1. Define the constraint as a primitive on the relevant field in the template's `fields:` block (for frontmatter) or `section-rules` fence (for body sections).
2. If the constraint kind is new (not expressible by existing primitives), register a new primitive in `lib/schema-engine.js`'s `PRIMITIVES` registry — a pure function `(value, param, ctx) => Issue[]`.
3. The new constraint VALUE belongs to TEMPLATES; the new primitive ENFORCEMENT belongs to the plugin.

This keeps the plugin reusable: any vault adopting `claude-code-vault-keeper` just authors its own templates with its own `fields:` schema and `section-rules`, and the plugin enforces them without modification.

## Concrete examples of template-driven primitives the plugin already honors

### Frontmatter — `fields:` schema (declared in template frontmatter)

Each field entry is keyed by name; primitives are declared flat on the entry and enforced generically by `lib/schema-engine.js`:

- `type` — `string | integer | number | boolean | date | array`
- `required: true` — field must be present; `required: { when: "<DSL>" }` for conditional
- `enum: [...]` — value must be one of the listed values
- `pattern: "..."` — value must match the regex
- `min` / `max` — string length, numeric value, or array count (resolved by `type`)
- `uniqueItems: true` — array elements must be distinct
- `exists: true` — value is a repo-relative path; target file must exist
- `description` — metadata for LSP hover (not a constraint)

Synthetic fields (`$path`) resolve to document metadata instead of frontmatter; constrained via `pattern` / `enum`.

Top-level template keys (not inside `fields:`): `sections` (formatter H2 ordering), `tier` (LSP grouping), `strict: true` (reject undeclared frontmatter keys).

### Body — `section-rules` fences (declared in template body headings)

Each template heading section carries a `` ```yaml section-rules `` fence with composable primitives enforced by `lib/schema-engine.js`:

- `required: true` — the section must exist in the document
- `repeatable: true` — heading is a pattern-placeholder; cardinality via `min` / `max`
- `heading: { pattern, enum }` — constrains a heading's text
- `table: { columns, key_column, value_column }` — section contains a table
- `list: { item: { pattern } }` — section contains a list with per-item rules
- `code: { lang }` — section contains a fenced code block
- `formula: "expression"` — arithmetic/comparison over extracted table values

## Counter-example — what NOT to do

```js
// ❌ DO NOT: hardcoded vault knowledge in the plugin
if (filepath.includes("/some-section/tasks/")) {
  if (!filename.match(/^t-\d{3}-/)) {
    error("Tasks must start with t-NNN");
  }
}
```

```yaml
# ✅ DO: declarative rule in the template
# templates/task-template.md frontmatter
fields:
  $path:
    pattern: "^some-section/tasks/t-\\d{3}-[a-z0-9-]+\\.md$"
```

The plugin JS already knows how to compile and test the `pattern` primitive via the `$path` synthetic field. It doesn't know — and shouldn't know — what `t-` means.

## Adding a new vault-specific rule — the checklist

1. Identify which template the rule belongs to (the template that authors the documents the rule applies to).
2. Add the constraint to that template — either as a primitive on a field in the `fields:` block (frontmatter) or in a `section-rules` fence under the relevant heading (body).
3. If the constraint kind is brand new (not expressible by existing primitives), register a new primitive in `lib/schema-engine.js`'s `PRIMITIVES` registry. The primitive is a pure function `(value, param, ctx) => Issue[]`. Update `lib/template-rules.js` if the new primitive requires loader-side normalization.
4. Document the new primitive in `templates/README.md` (or equivalent) under the primitives reference.
5. Write at least one test in `tests/` that uses the primitive in a fixture template, proves the engine enforces it, and proves a violation produces the expected error.

## When generic doesn't fit

A small set of plugin features are intentionally generic-only because no template-level constraint can express them: recursive folder walks, regex compilation, gray-matter parsing, frontmatter line mapping, etc. These are pure infrastructure — they don't know what a domain word means — so they live in the plugin. Any feature that DOES require vault-specific knowledge belongs in templates.
