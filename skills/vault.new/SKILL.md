---
name: vault.new
description: "Scaffold a new vault document from a template — read the template's `fields:` schema via the public API (`loadTemplateRules`), generate frontmatter placeholders for every required field, derive the target path from the `$path` pattern, write the file, then validate it. Generic across vault shapes; reads everything from the template at runtime. Use when the user says 'new task', 'new doc', 'tạo doc mới', 'scaffold doc', 'thêm task', 'create from template', '/vault.new <type> [slug]'."
---

# vault.new — scaffold a doc from a template

This skill creates a new document conforming to a template's `fields:` schema. It reads the template at runtime via the public API — no field name, no path prefix, no status value is hardcoded.

## Inputs

The user invokes `/vault.new <type> [slug]`. Examples:
- `/vault.new task fix-login`
- `/vault.new prd checkout-redesign`
- `/vault.new note` (slug derived from current date)

## Pre-flight (silent unless blocked)

1. Resolve project root: `${CLAUDE_PROJECT_DIR:-$PWD}`.
2. Resolve template path: `templates/<type>-template.md`. If absent, list `ls templates/` and abort with: *"Template `templates/<type>-template.md` not found. Available: <list>."*

## Step 1 — load template rules via public API

Use `Bash` to invoke the public API:

```bash
node -e "
import('claude-code-vault-keeper').then(async ({ loadTemplateRules }) => {
  const rules = await loadTemplateRules('templates/<type>-template.md');
  console.log(JSON.stringify(rules));
});
"
```

Parse the JSON. The returned object has the shape:
- `fields` — `Record<string, object>` keyed by field name; each entry carries primitives (`type`, `required`, `enum`, `pattern`, `min`, `max`, `exists`, `uniqueItems`, `description`). Keys starting with `$` are synthetic fields (e.g. `$path`) — they constrain document metadata, not frontmatter values.
- `strict` — boolean; whether undeclared frontmatter keys are errors.
- `sections` — string array; formatter H2 ordering vocabulary.
- `tier` — string or null; template tier label.
- `bodySchema` — array of `BodySchemaNode` trees (`{ depth, text, sectionRules, children }`); each node represents a template heading that may carry `section-rules`.
- `templateErrors` — array of meta-validation issues (if non-empty, the template itself is malformed — abort and surface them).

## Step 2 — derive the target file path

Read `fields['$path']?.pattern` to get the path regex. Parse it to find the literal prefix (everything before the first regex meta character `\d`, `[`, `(`, `*`, `+`, `?`). Example: `^docs/tasks/t-\\d{3}-[a-z0-9-]+\\.md$` → literal prefix `docs/tasks/t-`, numeric pattern `\d{3}`, slug placeholder.

Algorithm:
1. Extract literal prefix.
2. If regex has a numeric segment (`\d{N}`), `ls <prefix-dir>/` and find max existing `<prefix><number>-*` → increment. Pad to N digits.
3. Append `<slug>.md` (or current date if no slug provided).
4. If the derived path already exists, abort with: *"Target `<path>` already exists. Pick a different slug."*

If `$path` is absent or the pattern has no derivable literal prefix, ask the user via `AskUserQuestion` for the target path.

## Step 3 — generate frontmatter placeholders

Iterate `Object.entries(fields)`. **Skip** keys starting with `$` (synthetic fields do not appear in frontmatter). For each field, determine whether to include it:
- Include if `required: true` (shorthand) or `required: { when: "..." }` (conditional — include with a placeholder since the condition may be met at creation time).
- Include if the field carries constraints that hint at a default value (`enum`, `type` + `min`).
- Skip fields that are purely optional with no useful default.

For each included field, pick a placeholder value. Evaluate rows top-to-bottom; the first matching row wins:

| Field shape | Placeholder |
|---|---|
| field name is `template` | `templates/<type>-template.md` |
| `enum: [v1, v2, ...]` | first value in the list (`v1`) |
| `type: integer` or `type: number`, with `min: N` | `N` |
| `pattern: "..."` present | `'@TODO'` (literal placeholder for the user to fill in) |
| field name matches `created` / `updated` / `*_date` | today in `YYYY-MM-DD` |
| field name is `title` | slug humanized (replace hyphens with spaces, title-case) |
| anything else | `'@TODO'` |

Order keys priority-first: `id`, `title`, `template`, `status`, `phase`, `owner`, `created`, `updated`, then the rest alphabetically. Match the canonical formatter's expected order (`PRIORITY_KEYS` in `lib/canonical-formatter.js`).

## Step 4 — write the file

Use the `Write` tool. The body includes H2 headings derived from the `bodySchema` tree. Walk `bodySchema` children (depth-2 nodes):
- For each node where `sectionRules?.required` is truthy or `sectionRules` is present, emit `## <node.text>` followed by an empty line.
- **Skip** nodes where `sectionRules?.repeatable` is truthy — their `text` is a pattern slot (e.g. `<item>`), not a concrete heading. The user adds repeated items manually.
- Recurse into children only to discover required sub-headings; generally only depth-2 headings are scaffolded.

Leave each section body empty for the user to fill.

## Step 5 — validate

Run:

```bash
node cli/main.js validate --path <newfile> --root "${CLAUDE_PROJECT_DIR:-$PWD}"
```

(Use `vault-keeper validate ...` if on PATH; otherwise the local node invocation above.)

If exit 0 → success.
If exit 1 → the validator's report tells the user exactly which placeholders to replace. Surface the diagnostic verbatim plus: *"Edit `<newfile>` to replace the `'@TODO'` placeholders, then re-validate."*

## Output contract

```
vault.new — created <type> document

  path:      <newfile>
  template:  templates/<type>-template.md
  validate:  pass (or: N placeholders to fill)

Next: edit the file, replace placeholders, then `/vault.health` or `/vault.fix` as needed.
```

## Refusal contract

Refuse if:
- Template does not exist.
- Template has `templateErrors` (meta-validation failures) — surface them.
- Target path already exists (do not clobber).
- `$path` pattern has no derivable literal prefix and the user declines to provide a path.

## Composition

- Pairs with `/vault.setup` — setup creates templates, new creates docs from them.
- Pairs with `/vault.fix` — fix can canonicalize the new doc after manual edits.
- Pairs with `/vault.health` — health verifies the whole vault after multiple new docs.
- Does NOT auto-commit. Commit is the user's call (or `/vault.sync`).
