# Templates

Templates are the **single configuration surface** for vault-specific
validation. The plugin ships zero domain knowledge — every required
field, allowed enum, path pattern, and body section constraint comes
from a template's `fields:` block and body `section-rules` fences.

## Anatomy

A template is a regular markdown file under `templates/` with two
ingredients:

```markdown
---
template_path: templates/note-template.md          # 1. self-reference
document_type: note                                # 2. doc-type tag
tier: KNOWLEDGE                                    # 3. optional tier label
fields:                                            # 4. field schema
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

# Note Template — body content goes here

Body sections, format hints, and section-rules code fences live here.

## Relationships

```yaml section-rules
required: false
```
```

The validator reads the frontmatter's `fields:` block plus the body's
`yaml section-rules` code fences. The rest of the body is free-form
documentation for the human / agent authoring instances.

### How instances reference templates

Every vault document declares the template it conforms to via the
`template:` frontmatter field:

```yaml
---
template: templates/note-template.md
title: My note
owner: '@alice'
---
```

The validator resolves the template path relative to the project root,
loads its `fields:` schema and body section-rules, and enforces them
against the instance. A doc whose `template:` can't be resolved fails
with one canonical error.

## What goes in the template frontmatter

| Field | Type | Effect | Reference |
|---|---|---|---|
| `fields` | `Record<string, object>` | Per-field composable schema — type, enum, pattern, required, min, max, etc. | [frontmatter-rules](frontmatter-rules.md) |
| `strict` | `boolean` | Opt-in: flag undeclared frontmatter keys in instances as errors | [frontmatter-rules](frontmatter-rules.md#strict-mode) |
| `sections` | `string[]` | Body H2 section ordering (used by the canonical formatter) | [body-rules](body-rules.md) |
| `tier` | `string` | Optional grouping label — read by LSP completion for proximity sort | — |

Inside the body, fenced `yaml section-rules` code blocks declare
per-section requirements:

````markdown
## Problem

```yaml section-rules
required: true
```
````

See [body-rules](body-rules.md) for the full section-rules vocabulary.

## Design principles

### 1. Logic in the plugin, configuration in the template

The validator's job is to LOAD `fields:` and body section-rules from
the template and ENFORCE them. The validator should never know what
your domain words mean — only what the template says about its own
constraints.

### 2. When in doubt, add a template field — not a code branch

If you find yourself wanting `if (filepath.includes("/some-section/")) { … }`
in plugin code, stop. Express the constraint as a declarative rule in the
relevant template's `fields:` block. The plugin enforces what the
template declares.

### 3. Templates are markdown — readable as both spec and example

A template body is **content** that documents how an instance should look.
The section-rules code fences double as documentation for the agent /
human authoring the instance.

## Where to read next

1. [Frontmatter rules](frontmatter-rules.md) — composable field
   primitives: type, enum, pattern, required, min/max, conditional
   `when` DSL, strict mode.
2. [Folder & filename rules](folder-and-naming.md) — `$path` synthetic
   field, slug rules.
3. [Body rules](body-rules.md) — `sections[]`, body section-rules code
   fences, heading/table/list/code/formula primitives.
4. [Full example](full-example.md) — a complete PRD-style template + a
   conforming instance + the diagnostics that would fire on broken
   variants.
