# Documentation

`claude-code-vault-keeper` is a template-driven markdown validation engine.
Documents declare which template they conform to; templates declare their
own validation schema; the engine enforces them generically.

## Quick links

### Setup

- [Getting started](getting-started.md) — install Bun, install the plugin,
  initialize a vault, validate your first document, open it in an editor.
- [Vault config](vault-config.md) — `.claude/vault-keeper.json` atoms
  (`vaultRoot`, `vaultFolders`, `excludePatterns`).

### Authoring templates

- [Templates overview](templates/README.md) — anatomy of a template +
  index of every rule field the engine recognises.
- [Frontmatter rules](templates/frontmatter-rules.md) — composable field
  primitives (type, enum, pattern, required, min/max, uniqueItems,
  exists), conditional `when` DSL, strict mode.
- [Folder & filename rules](templates/folder-and-naming.md) —
  `$path` synthetic field, slug rules, naming conventions.
- [Body rules](templates/body-rules.md) — `sections[]`, body section-rules
  code fences (required, repeatable, heading, table, list, code, formula).
- [Full example](templates/full-example.md) — end-to-end template + a
  conforming instance + the diagnostics that would fire on a broken
  instance.

### Running the validator

- [CLI validator](cli-validator.md) — `bun cli/validate-documents.js` /
  `vault-keeper-validate` flags, exit codes, JSON output shape, examples.
- [LSP features](lsp-features.md) — per-operation behavior (diagnostics,
  hover, code-lens, completion, code-action, rename, format).
- [Programmatic usage](programmatic-usage.md) — import the schema engine,
  template loader, formatter as ES modules. Build custom scripts,
  pre-commit hooks, reporters, editor integrations.
- [CI/CD integration](ci-cd-integration.md) — GitHub Actions, GitLab CI,
  generic Bash runners, pre-commit hook, the `jq` artifact pattern.

### Reference

- [Canonical formatter](canonical-formatter.md) — what the formatter
  rewrites (frontmatter key ordering, section reordering, whitespace).
- [Naming conventions](naming-conventions.md) — slug rule for folders +
  filenames, exempt basenames.
- [Architecture](architecture.md) — module map, data flow, extension
  points.
- [Troubleshooting](troubleshooting.md) — common errors with concrete
  fixes.

## Mental model in one paragraph

A **vault** is a collection of markdown files under a configured
`vaultRoot`. Each file's frontmatter has a `template:` field pointing to a
template under `templates/`. The template's own frontmatter contains a
`fields:` block with composable validation primitives, and its body carries
`yaml section-rules` code fences. The engine loads that schema at runtime
and enforces what it finds — required fields, type checks, enum/pattern
constraints, conditional requirements, body section structure, heading
patterns, table/list/code validation, and more. The plugin code knows
nothing about your domain words; it only knows how to read template
primitives and apply them.

When you want to enforce a new constraint, add a field to a template's
`fields:` block or a section-rules key to a body fence. The plugin enforces
whatever the template declares.
