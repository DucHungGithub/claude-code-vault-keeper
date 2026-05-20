# Folder & filename rules

This page covers the rules that govern **where a document lives** and
**what it's named**:

- [`$path` synthetic field](#path-synthetic-field) — template-declared
  path constraint via the composable schema.
- [Slug rule](#slug-rule) — every folder segment + filename must be
  lowercase-kebab-case.

---

## `$path` synthetic field

Each template declares path constraints using the `$path` synthetic
field inside its `fields:` block. The `$path` field is resolved at
validation time to the document's **repo-relative path** (normalized
to forward slashes regardless of platform separator).

```yaml
fields:
  $path:
    pattern: "^docs/notes/note-\\d{3}-[a-z0-9-]+\\.md$"
```

Synthetic fields (prefixed with `$`) are resolved via built-in
resolvers instead of reading from the document's frontmatter. The
`$path` resolver returns the document's repo-relative path.

### Allowed primitives on synthetic fields

Synthetic fields may only use `pattern`, `enum`, and `description`.
Other primitives (like `required`, `type`, `min`) produce a
`template-schema-invalid` error during meta-validation.

```yaml
# Pattern — path must match a regex
fields:
  $path:
    pattern: "^docs/notes/note-\\d{3}-[a-z0-9-]+\\.md$"

# Enum — path must be one of a fixed set (unusual but valid)
fields:
  $path:
    enum: ["docs/config/main.md", "docs/config/staging.md"]

# Description — document the path convention (metadata only)
fields:
  $path:
    pattern: "^docs/tasks/t-\\d{3}-[a-z0-9-]+\\.md$"
    description: "Tasks live under docs/tasks/ with a t-NNN prefix"
```

### Anchoring

Anchor with `^` and `$` to pin both ends; the regex must match the
**entire** repo-relative path. Otherwise instances at any depth will
satisfy it.

### Multiple permitted shapes

Use regex alternation. Common pattern: support both flat files and
bundle README form:

```yaml
fields:
  $path:
    pattern: >-
      ^docs/notes/note-\\d{3}-[a-z0-9-]+\\.md$|
      ^docs/notes/note-\\d{3}-[a-z0-9-]+/README\\.md$
```

YAML's `>-` folded scalar strips newlines so the regex stays single-
line.

### What fires on mismatch

```
[ERR ] field=$path  error_type=pattern-mismatch
       Value 'docs/random/note-001-foo.md' does not match pattern
       '^docs/notes/note-\d{3}-[a-z0-9-]+\.md$'
       fix: Must match: ^docs/notes/note-\d{3}-[a-z0-9-]+\.md$
```

An absent `$path` field in the template (or a template with no path
constraint) skips the check — useful for templates whose instances may
live anywhere.

### Bad regex

If the regex source doesn't compile, the template's meta-validation
emits a `template-schema-invalid` error pointing at the template (not
the instance).

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

### Authoring a bundle-capable template

Author the `$path` pattern with a `/README\.md$` alternative:

```yaml
fields:
  $path:
    pattern: >-
      ^docs/prds/prd-\\d{3}-[a-z0-9-]+\\.md$|
      ^docs/prds/prd-\\d{3}-[a-z0-9-]+/README\\.md$
```

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
| `note.md` | `note` | `md` | yes |
| `tailwind.config.js` | `tailwind` | `config.js` | yes |
| `Note.md` | `Note` (uppercase) | — | no |
| `note 1.md` | `note 1` (space) | — | no |
| `note_one.md` | `note_one` (underscore) | — | no |

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
[ERR ] field=folder   Folder 'Bad Folder' violates slug convention ...
       fix: Rename folder to 'bad-folder/'
[ERR ] field=filename Filename 'My Note.md' violates slug convention ...
       fix: Rename to 'my-note.md' ...
```

The validator suggests a kebab-cased rewrite via `suggestSlug()` —
camelCase -> camel-case, underscores -> hyphens, strip non-`[a-z0-9-]`
characters, collapse `--`.

---

## A complete example

Template:

```yaml
---
template_path: templates/note-template.md
document_type: note
tier: KNOWLEDGE
fields:
  $path:
    pattern: "^docs/notes/note-\\d{3}-[a-z0-9-]+\\.md$"
  template:
    required: true
  document_type:
    required: true
  title:
    required: true
  owner:
    required: true
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
| `docs/notes/note-001-foo.md` | matches both `$path` pattern + slug rule |
| `docs/notes/foo.md` | `$path` pattern fails (no `note-NNN-` prefix) |
| `docs/notes/Note-001.md` | slug rule fails (uppercase) |

## See also

- [Frontmatter rules](frontmatter-rules.md) — composable field
  primitives.
- [Body rules](body-rules.md) — body section-rules, section ordering.
- [Naming conventions](../naming-conventions.md) — the slug rule in
  isolation, with exempt-basename rationale.
- [Vault config](../vault-config.md) — config atoms (`vaultRoot`,
  `vaultFolders`, `excludePatterns`).
