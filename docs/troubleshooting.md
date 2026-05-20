# Troubleshooting

Common error messages, what they mean, and how to fix them.

For each entry: the diagnostic's `level` + `field` + `error_type` +
`message` excerpt, followed by **What** (interpretation) and **Fix**
(concrete steps).

## Frontmatter / template resolution

### `[ERR] field=template — Missing required template field`

**What:** Your document's frontmatter has no `template:` key. Without
it the validator can't pick a schema to enforce.

**Fix:** Add the `template:` field. Path is relative to the project
root, must start with `templates/`, must end with `.md`:

```yaml
---
template: templates/note-template.md
title: My note
---
```

---

### `[ERR] field=template — Invalid template path: <value>`

**What:** Your `template:` field doesn't start with `templates/` or
doesn't end with `.md`.

**Fix:** Templates must live under `<projectRoot>/templates/`. Common
mistakes:

```yaml
template: prd-template.md                 # missing templates/ prefix
template: ./templates/prd-template.md     # relative path
template: /templates/prd-template.md      # absolute path
template: templates/prd-template          # missing .md extension
template: templates/prd-template.md       # correct
```

---

### `[ERR] field=template — Cannot load template`

**What:** The validator found the `template:` field but could not load
the file, or its frontmatter is malformed YAML.

**Fix:** Three checks, in order:

1. **File exists.** `ls <projectRoot>/<template-path>` — does the
   file exist at exactly that path?
2. **Frontmatter parses.** Open the template, check the YAML between
   `---` fences. A common gotcha: a value contains `:` and isn't
   quoted (`description: line: 1` is invalid YAML).
3. **Has valid frontmatter.** The template's frontmatter must be a
   valid YAML object (even if `fields:` is absent — the template may
   carry body section-rules or other top-level keys).

---

### `[WARN] field=<field> — Template-only field "<field>" leaked into instance`

**What:** Your instance frontmatter contains a key that belongs only
to templates: `template_path`, `template_version`, or `template_id`.
These typically leak via copy-paste from a template scaffold.

**Fix:** Remove the key from your instance's frontmatter:

```yaml
---
template: templates/note-template.md
title: My note
# template_path: ...     <- delete this
---
```

The LSP's code-action quick-fix offers an automated "Delete from
frontmatter" for this warning.

## Field schema errors (composable primitives)

### `[ERR] error_type=required-missing — Required field '<field>' is missing`

**What:** A field with `required: true` (or conditional `required` whose
`when` condition matched) is present in the template schema but absent,
`null`, or empty string in the instance.

**Fix:** Add the field with a non-empty value. The LSP code-action
quick-fix offers an "Insert placeholder."

---

### `[ERR] error_type=type-mismatch — Expected type '<type>', got '<actual>'`

**What:** The field value doesn't match the declared `type` in the
template schema.

**Fix:** Common fixes:

```yaml
# type: integer — use an unquoted number
rice:
  reach: 50        # correct (number)
  reach: "50"      # wrong (string)

# type: array — use a YAML list
tags: [ai, ml]     # correct
tags: "ai, ml"     # wrong (string)

# type: boolean — use unquoted true/false
active: true       # correct
active: "true"     # wrong (string)
```

---

### `[ERR] error_type=enum-violation — Value '<value>' is not in allowed values: [...]`

**What:** The field value isn't in the template's `enum` list.

**Fix:** Use one of the permitted values listed in the error message.

---

### `[ERR] error_type=pattern-mismatch — Value '<value>' does not match pattern '<regex>'`

**What:** The field value doesn't match the template's `pattern` regex.

**Fix:** Edit the value to match the regex. Common patterns:

```yaml
# Date: YYYY-MM-DD
pattern: "^\\d{4}-\\d{2}-\\d{2}$"

# Ticket ID: PROJ-123
pattern: "^[A-Z]+-\\d+$"

# SemVer
pattern: "^\\d+\\.\\d+\\.\\d+$"
```

YAML backslash escaping: write `\\d` (double-backslash) so the
resulting JS string is `\d`.

---

### `[ERR] error_type=min-violation / max-violation`

**What:** A numeric value, string length, or array count is outside the
declared `min`/`max` bounds.

**Fix:** Adjust the value to fall within bounds. The target depends on
the declared `type`:
- `string` -> `min`/`max` check string length
- `integer` / `number` -> `min`/`max` check the value
- `array` -> `min`/`max` check element count

---

### `[ERR] error_type=unique-violation — Array contains duplicate items`

**What:** A field with `uniqueItems: true` has duplicate entries.

**Fix:** Remove the duplicate entries from the array.

---

### `[ERR] error_type=exists-missing — Referenced file does not exist`

**What:** A field with `exists: true` references a file path that
doesn't exist on disk.

**Fix:** Create the file or fix the path.

---

### `[ERR] error_type=undeclared-field — Undeclared field '<key>'`

**What:** The template uses `strict: true` and the instance has a
frontmatter key not declared in the template's `fields:` block.

**Fix:** Either remove the undeclared key from the instance, or add it
to the template's `fields:` block.

## Path / $path errors

### `[ERR] error_type=pattern-mismatch (on field=$path)`

**What:** The document's repo-relative path doesn't match the
template's `$path` pattern.

**Fix:** Either:

1. **Move/rename the file** to a path that matches the pattern (the fix
   line includes the regex).
2. **Change the `template:` field** to a different template whose
   `$path` accepts this path.
3. **Loosen the template's pattern** if your folder taxonomy genuinely
   evolved.

---

### Template `$path` pattern doesn't compile

**What:** The `$path` pattern string in your template doesn't compile to
a valid `RegExp`.

**Fix:** Inspect the regex in the template's `fields.$path.pattern`.
Common gotchas:

- Unescaped special characters: `(`, `)`, `[`, `]`, `+`, `*` need `\\`
  in YAML.
- Unclosed groups / character classes.

Test the regex in isolation:

```js
new RegExp("^docs/notes/note-\\d{3}-[a-z0-9-]+\\.md$")
// throws if malformed
```

## Folder / filename / slug

### `[ERR] field=folder — Folder '<name>' violates slug convention`

**What:** A folder segment in the path contains uppercase, spaces,
underscores, or other non-slug characters.

**Fix:** Rename the folder. The error includes a kebab-case suggestion.

---

### `[ERR] field=filename — Filename '<name>' violates slug convention`

**What:** The filename (or one of its dot-separated extension
segments) violates the slug rule.

**Fix:** Rename the file. The error includes a suggestion. Note the
exempt basenames (`README.md`, `CLAUDE.md`, `LICENSE`, etc.) that
bypass this rule — see [naming-conventions](naming-conventions.md).

The LSP code-action quick-fix offers an automated rename via
`WorkspaceEdit`.

## Body validation errors

### `[ERR] error_type=required-missing — Required section '<heading>' is missing`

**What:** A section with `required: true` in its section-rules block
is missing from the document body.

**Fix:** Add the missing section heading to the document body.

---

### `[ERR] error_type=heading-mismatch — Heading '<text>' does not match pattern`

**What:** A heading in the document body doesn't match the
`heading.pattern` or `heading.enum` declared in the template's
section-rules.

**Fix:** Edit the heading text to match the expected pattern. The error
message includes the regex.

---

### `[ERR] error_type=table-shape — Expected a table / missing required column`

**What:** A section requiring a `table` in its section-rules has no
table, or the table is missing declared required columns.

**Fix:** Add the table with the required column headers.

---

### `[ERR] error_type=list-item — List item does not match pattern`

**What:** A list item in a section doesn't match the `list.item.pattern`
declared in section-rules.

**Fix:** Edit the list item to match the expected pattern.

---

### `[ERR] error_type=code-missing — Expected a code fence`

**What:** A section requiring a `code` block has no fenced code block
(or no fence matching the required `lang`).

**Fix:** Add a fenced code block with the required language tag.

---

### `[ERR] error_type=formula-violation — Formula evaluated to false`

**What:** A `formula` expression in section-rules evaluated to `false`
against the table's key-value map, or a table value was non-numeric.

**Fix:** Check the table data — the formula is an arithmetic expression
that must evaluate to `true`.

---

### `[ERR] error_type=cardinality — Expected at least/at most N sections`

**What:** A repeatable heading's match count is below `min` or above
`max`.

**Fix:** Add or remove matching headings to satisfy the cardinality
constraint.

## Template meta-validation

### `[ERR] error_type=template-schema-invalid`

**What:** The template itself has schema errors. These are caught during
template loading, before any instance validation runs.

**Fix:** Check the template's `fields:` block and body section-rules
for:

- Unknown primitive keys (e.g. a typo like `requred` instead of
  `required`).
- Invalid `type` value (allowed: `string`, `integer`, `number`,
  `boolean`, `date`, `array`).
- Invalid regex in `pattern` or `heading.pattern`.
- `enum` that isn't a non-empty array.
- `min`/`max` used without a declared `type`.
- Invalid `when` DSL syntax.
- Synthetic field (`$path`) using a disallowed primitive.
- Unknown key in a section-rules block.
- Invalid `formula` expression syntax.

## Section-rules leak

### `[ERR] error_type=section-rules-leak`

**What:** A `` ```yaml section-rules `` code fence was found in a
non-template document. This construct belongs in templates only.

**Fix:** Remove the section-rules code fence from your document. If
you meant to document the construct, wrap it in an outer code fence
so it's treated as plain text.

## CLI / runtime

### `bun: command not found`

**What:** Bun isn't installed on your machine (or runner).

**Fix:** `curl -fsSL https://bun.sh/install | bash`, then ensure
`~/.bun/bin` is on `PATH`. The validator's shebang is
`#!/usr/bin/env bun`.

---

### CLI exits 1 with no error message

**What:** Sometimes happens if the project root resolution falls
through to a directory that has no documents. Or your `--root` points
somewhere that doesn't exist.

**Fix:** Pass `--root` explicitly and inspect the resolved path:

```bash
bun cli/validate-documents.js --root "$PWD"
```

Or run with `--json` and inspect the output:

```bash
bun cli/validate-documents.js --root "$PWD" --json | jq '.summary'
```

If `summary.total === 0`, your scan found no documents — check
`vaultFolders` in `.claude/vault-keeper.json`.

---

### Validator says all docs are valid, but the LSP shows diagnostics

**What:** The LSP runs the per-doc subset of rules. The CLI in
non-strict mode reports only errors.

**Fix:** Run the CLI with `--strict` to see the warnings the LSP is
flagging:

```bash
bun cli/validate-documents.js --root "$PWD" --strict
```

---

### LSP isn't showing diagnostics in the editor

**What:** The LSP only attends to files under your configured
`vaultFolders`. Plus it needs to recognise the directory as a vault
root.

**Fix checklist:**

1. The file's parent directory chain contains either `templates/` or
   `.claude/vault-keeper.json`. (LSP root detector.)
2. The file's repo-relative path is under one of `vaultFolders` (or
   `vaultFolders` is `["."]` which matches everything).
3. The file's basename is NOT `CLAUDE.md` / `CLAUDE.local.md` (those
   are silently ignored as agent-context prompts).
4. The LSP bundle is present at `server/main.bundled.cjs`. If not,
   `bun run build`.
5. `.lsp.json` exists and points at the bundle.

## Where to file a bug

If you hit a diagnostic whose `fix` line doesn't actually fix it, or
the validator crashes with a stack trace, that's a bug. File a GitHub
issue with:

1. The smallest reproducer template + instance.
2. The exact command you ran.
3. The full output (including the stack if any).
4. Your `.claude/vault-keeper.json` (if any).

## See also

- [CLI validator](cli-validator.md) — flag reference + JSON shape.
- [LSP features](lsp-features.md) — what the editor shows.
- [Templates](templates/README.md) — rule vocabulary.
- [Naming conventions](naming-conventions.md) — slug rule details.
