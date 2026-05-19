# Folder & filename rules

This page covers the rules that govern **where a document lives** and
**what it's named**:

- [`path_regex`](#path_regex) — template-declared path regex.
- [Bundle README pattern](#bundle-readme-pattern) — when a folder's
  `README.md` is the canonical document for that folder.
- [Slug rule](#slug-rule) — every folder segment + filename must be
  lowercase-kebab-case.

---

## `path_regex`

Each template self-declares the regex that an instance's path must
match. Declared inside the template's `validation_rules` block.

```yaml
validation_rules:
  path_regex: "^docs/notes/note-\\d{3}-[a-z0-9-]+\\.md$"
```

The validator compiles the source string with `new RegExp()` and tests
it against the document's **repo-relative path** (normalized to forward
slashes regardless of platform separator).

### Anchoring

Anchor with `^` and `$` to pin both ends; the regex must match the
**entire** repo-relative path. Otherwise instances at any depth will
satisfy it.

### Multiple permitted shapes

Use regex alternation. Common pattern: support both flat files and
bundle README form:

```yaml
path_regex: >-
  ^docs/notes/note-\\d{3}-[a-z0-9-]+\\.md$|
  ^docs/notes/note-\\d{3}-[a-z0-9-]+/README\\.md$
```

YAML's `>-` folded scalar strips newlines so the regex stays single-
line. The alternative `|` lives inside the regex — don't introduce
whitespace inside the regex source.

### What fires on mismatch

```
[ERR ] field=location  error_type=path-regex-mismatch
       Document path "docs/random/note-001-foo.md" does not match
       template's path_regex.
       fix: Move/rename the file to match: ^docs/notes/note-\d{3}-...
```

A `null` / absent `path_regex` skips the check — useful for templates
whose instances may live anywhere (e.g. a generic note that spans
multiple sections).

### Bad regex → actionable error

If the regex source doesn't compile, the validator emits one error
pointing at the template (not the instance):

```
[ERR ] field=template  error_type=path-regex-bad-regex
       Template's path_regex is not a valid regex: <RegExp error>
       fix: Fix the regex in the template's validation_rules.path_regex.
```

---

## Bundle README pattern

A common vault convention: a single document is implemented as a
**folder containing `README.md` plus supporting files**. Diagrams,
attachments, and sub-docs live next to the README. The README itself
carries the document's frontmatter and is the canonical artifact.

### Why this is non-trivial

`README.md` is globally excluded as folder-meta (the
`**/README.md` entry in default `excludePatterns`). A bundle README
needs to be re-included by the scanner.

### How the validator detects bundle READMEs

The CLI orchestrator runs an extra glob pass that re-includes every
`README.md` whose own `template:` field is something **other than**
`templates/folder-readme-template.md`. The decision is template-driven —
no hardcoded path lists.

If a `README.md` sits at a path that some content template's
`path_regex` matches as a bundle root, but the doc's own `template:`
field is missing or set to `folder-readme-template.md`, the validator
synthesises a specific error:

```
[ERR ] field=template  error_type=bundle-readme-template-mismatch
       Bundle README has wrong template "<actual>". This path matches a
       content template's bundle pattern. Expected one of:
       templates/<a>.md, templates/<b>.md.
       fix: Set frontmatter "template:" to one of: …
```

This prevents silent skips on bundle conversions (e.g.
`git mv foo.md foo/README.md` without updating `template:`).

### Authoring a bundle-capable template

Author the `path_regex` with a `/README\.md$` alternative that
participates in the bundle scan:

```yaml
validation_rules:
  path_regex: >-
    ^docs/prds/prd-\\d{3}-[a-z0-9-]+\\.md$|
    ^docs/prds/prd-\\d{3}-[a-z0-9-]+/README\\.md$
```

A template that opts into the bundle scan must include `/README\.md`
literally in its regex source — the bundle detector matches on that
substring.

---

## Slug rule

Independent of templates: every folder segment AND every file basename
in the vault must conform to a slug rule. Enforced uniformly across
all `.md` and asset files.

### The rule

Each path segment (folder or file basename) must match:

```
[a-z0-9]+(-[a-z0-9]+)*
```

- Lowercase ASCII letters + digits + hyphen only.
- No leading or trailing hyphen.
- No consecutive hyphens.
- No spaces, no underscores, no uppercase.

Filenames split on the **first** dot — the name portion follows slug
rules, and each dot-separated extension segment also follows slug rules:

| Basename | Name part | Extension chain | OK? |
|---|---|---|---|
| `note.md` | `note` | `md` | ✅ |
| `tailwind.config.js` | `tailwind` | `config.js` | ✅ |
| `Note.md` | `Note` (uppercase) | — | ❌ |
| `note 1.md` | `note 1` (space) | — | ❌ |
| `note_one.md` | `note_one` (underscore) | — | ❌ |

### Task-ID exception

Filenames whose name portion matches the task-id shape
`^[a-z]+-\d+-[a-z0-9]+(-[a-z0-9]+)*$` are accepted unconditionally —
e.g. `t-001-cleanup.md`, `prd-013-feature.md`. The hyphen between
digits and slug is part of the contract.

### Exempt basenames

Well-known files that bypass the slug rule entirely:

```
README.md  BOARD.md  CLAUDE.md  MEMORY.md  LICENSE  LICENSE.md
CHANGELOG.md  CONTRIBUTING.md  DESIGN.md  AGENTS.md
```

These names are widely-used conventions (open-source norms, Google
Labs `DESIGN.md`, agent-context conventions). Renaming them would
break muscle memory + external integrations.

### Hidden files / folders

Path segments starting with `.` (`.git`, `.omc`, `.claude`, `.gitkeep`)
are tooling artifacts and skipped silently.

### Error shape

```
[ERR ] field=folder   Folder 'Bad Folder' violates slug convention …
       fix: Rename folder to 'bad-folder/'
[ERR ] field=filename Filename 'My Note.md' violates slug convention …
       fix: Rename to 'my-note.md' …
```

The validator suggests a kebab-cased rewrite via `suggestSlug()` —
camelCase → camel-Case, underscores → hyphens, strip non-`[a-z0-9-]`
characters, collapse `--`.

---

## A complete example

Template:

```yaml
---
template_path: templates/note-template.md
document_type: note
validation_rules:
  required_fields: [template, document_type, title, owner]
  path_regex: "^docs/notes/note-\\d{3}-[a-z0-9-]+\\.md$"
---
```

Vault config:

```json
{
  "vaultRoot": "docs",
  "vaultFolders": ["docs"]
}
```

| Path | Result |
|---|---|
| `docs/notes/note-001-foo.md` | ✅ matches both template + slug rule |
| `docs/notes/foo.md` | ❌ `path_regex` fails (no `note-NNN-` prefix) |
| `docs/notes/Note-001.md` | ❌ slug rule fails (uppercase) |

## See also

- [Frontmatter rules](frontmatter-rules.md) — required fields, regex,
  state machine.
- [Body rules](body-rules.md) — body section-rules, section ordering.
- [Naming conventions](../naming-conventions.md) — the slug rule in
  isolation, with exempt-basename rationale.
- [Vault config](../vault-config.md) — config atoms (`vaultRoot`,
  `vaultFolders`, `excludePatterns`).
