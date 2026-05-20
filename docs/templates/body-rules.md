# Body rules

The rules that govern what appears **inside the body** of an instance.
Two surfaces interact:

- [`sections`](#sections) — canonical H2 ordering for the formatter.
- [Body section-rules code fences](#body-section-rules-code-fences) —
  per-section requirements declared inside the template's body via
  `yaml section-rules` fenced code blocks.

---

## `sections`

A list of section slugs declaring the canonical body ordering. Used by
the canonical formatter to reorder H2 sections deterministically.
Declared at the top level of a template's frontmatter (not inside
`fields:`):

```yaml
sections:
  - problem
  - goals
  - acceptance-criteria
  - "*"
  - relationships
```

### Slug format

The slug is the H2 heading text **lowercased, with spaces replaced by
hyphens**. `## Acceptance Criteria` -> `acceptance-criteria`.

The mapping is exact — `## Acceptance Criteria` and `## acceptance
criteria` both slugify to `acceptance-criteria` (case-insensitive
heading match).

### Wildcard `"*"`

The `"*"` entry is the **insertion point for unlisted sections** in
their source order:

- If `*` is present at index N, any H2 sections in the source that are
  NOT in the explicit slug list get inserted starting at position N.
- If `*` is absent, unlisted sections go to the end.

### Behavior

The formatter reorders sections deterministically — running it twice
produces the same output. It does NOT delete or rename sections; it
only moves them. Sections without a matching slug entry survive as
"unlisted" and slot in per the wildcard rule.

The CLI validator does **not** flag missing sections from this list —
that's `required: true` in section-rules' job (below). `sections[]` is
purely a sort key.

---

## Body section-rules code fences

Each heading in a template body may carry a fenced `yaml section-rules`
code block declaring per-section requirements:

````markdown
## Problem

```yaml section-rules
required: true
```

(template body content for this section continues here)
````

The fence is **regular YAML inside a `yaml` code block whose `meta`
attribute is exactly `section-rules`**. The template parser walks the
heading tree, finds each heading, looks for the first `yaml
section-rules` code block in that heading's content, parses it as YAML,
and stores the result as the heading's `sectionRules`.

### Templates only — a document carrying one is flagged

The `yaml section-rules` fence is a **template-authoring construct**. A
`yaml section-rules` block found in an authored document is almost
always a template fragment that was copy-pasted in by mistake — so both
the CLI and the LSP carry a built-in rule that flags it as an error
(`error_type: section-rules-leak`):

> A `` ```yaml section-rules `` code block belongs to templates only and
> must not appear in a document

Templates under `templates/` are exempt — that is where the fence
belongs. To *document* the construct inside an authored document (as
this page does), wrap it in an outer fence; the parser then sees the
inner fence as plain text, not a real `section-rules` block.

### Section-rules keys

The engine recognizes a closed set of 11 keys in a section-rules block.
Unknown keys produce a `template-schema-invalid` error during
meta-validation.

| Key | Type | Effect |
|---|---|---|
| `required` | boolean or `{ when: "..." }` | `true` -> this heading must exist in instances. Supports the `when` DSL for conditional requirements. |
| `repeatable` | boolean | `true` -> this heading is a pattern-placeholder that claims all unclaimed doc headings at the same depth. |
| `heading` | `{ pattern?, enum? }` | Constrain the heading text of matched sections. `pattern` is a regex; `enum` is a list of allowed values (case-insensitive match). |
| `table` | `{ columns?, key_column?, value_column? }` | Require a GFM table in the section. `columns` lists required column headers (case-insensitive). `key_column` + `value_column` feed the `formula` primitive. |
| `list` | `{ item?: { pattern? } }` | Require a list in the section. `item.pattern` is a regex each list item must match. |
| `code` | `{ lang? }` | Require a fenced code block. `lang` constrains the language tag (case-insensitive match). |
| `formula` | string (expression) | Arithmetic/comparison expression evaluated against the table's key-value map. See [formula primitive](#formula-primitive). |
| `min` | number | Minimum cardinality for repeatable headings. |
| `max` | number | Maximum cardinality for repeatable headings. |
| `severity` | `"error"` or `"warning"` | Override the default severity for all issues from this section. |
| `message` | string | Override the default error message for all issues from this section. |

### Heading matching

Non-repeatable schema headings are matched against document headings
by **normalized text** (lowercased, trimmed) at the same depth. A
`## Problem` schema node matches a `## problem` or `## Problem`
document heading.

Repeatable schema headings claim **all unclaimed** document headings at
the same depth. Use the `heading` key to constrain which headings are
valid matches.

### Nesting

Section-rules support hierarchical nesting. A template heading at depth
3 (`### <item>`) nested under a depth 2 heading (`## Acceptance
Criteria`) validates against the corresponding nested structure in the
document:

````markdown
## Acceptance Criteria

```yaml section-rules
required: true
```

### <item>
```yaml section-rules
repeatable: true
heading:
  pattern: "^AC\\d+ — .+ — `(must|should|nice)` · `(draft|in_progress|verified|descoped)`$"
```
````

---

## Repeatable headings

When `repeatable: true` is set, the schema heading acts as a
**pattern-placeholder** that claims all unclaimed document headings at
the same depth under the same parent.

### Cardinality

- `min` — minimum number of matching headings (default: `1` if
  `required: true`, else `0`).
- `max` — maximum number of matching headings (default: unlimited).

```yaml section-rules
repeatable: true
min: 1
max: 10
heading:
  pattern: "^AC\\d+ — "
```

Error type: `cardinality`.

### Heading validation

Each claimed heading's text is validated against the `heading` key
(if present). For example, a heading `### AC1 — bad format` that
doesn't match the declared `heading.pattern` produces a
`heading-mismatch` error.

---

## Content validation primitives

Beyond heading matching, section-rules can validate the **content**
within a section.

### `table`

Validates a GFM table within the section's content nodes.

```yaml section-rules
required: true
table:
  columns: [metric, target, actual]
  key_column: metric
  value_column: actual
```

- `columns` — required column headers (case-insensitive match against
  the table's header row).
- `key_column` / `value_column` — identify columns for extracting a
  key-value map used by the `formula` primitive.

Error type: `table-shape`.

### `list`

Validates a list within the section's content nodes.

```yaml section-rules
required: false
list:
  item:
    pattern: "^\\*\\*[a-z_]+\\*\\* \\[.+\\]\\(.+\\)( — .+)?$"
```

Each list item's text is matched against `item.pattern`. Every
non-matching item produces an error.

Error type: `list-item`.

### `code`

Requires a fenced code block within the section's content.

```yaml section-rules
required: true
code:
  lang: gherkin
```

When `lang` is specified, at least one fence with that language tag
must exist. Without `lang`, any fence suffices.

Error type: `code-missing`.

### Formula primitive

An arithmetic/comparison expression evaluated against a table's
extracted key-value map. Requires `table.key_column` and
`table.value_column` to identify the source data.

```yaml section-rules
required: true
table:
  columns: [metric, value]
  key_column: metric
  value_column: value
formula: "total == reach * impact * confidence / effort"
```

The expression language supports:

- Operators: `==`, `!=`, `<`, `>`, `<=`, `>=`, `+`, `-`, `*`, `/`
- Parenthesized sub-expressions
- Unary minus
- Identifiers resolve from the table's key-value map (keys are
  lowercased, spaces replaced with underscores)
- Equality (`==`, `!=`) uses epsilon `1e-9` for floating-point
  comparison

Table keys are normalized: lowercased, trimmed, spaces replaced with
underscores. Non-numeric values in the value column produce a
`formula-violation` error before the formula is evaluated.

Error type: `formula-violation`.

---

## Error types emitted by body validation

| Error type | Trigger |
|---|---|
| `required-missing` | A section with `required: true` (or conditional `required`) is missing from the document body |
| `heading-mismatch` | A heading's text doesn't match the declared `heading.pattern` or `heading.enum` |
| `table-shape` | A required table is missing or is missing required columns |
| `list-item` | A required list is missing, or a list item doesn't match `item.pattern` |
| `code-missing` | A required code fence is missing or no fence matches the required `lang` |
| `formula-violation` | A formula expression evaluated to `false`, or a table value is non-numeric |
| `cardinality` | A repeatable heading's match count is below `min` or above `max` |
| `template-schema-invalid` | The template's section-rules block itself is malformed (unknown key, bad regex, etc.) |

---

## A complete example

````markdown
---
template_path: templates/prd-template.md
document_type: prd
tier: PRODUCT
sections:
  - problem
  - goals
  - acceptance-criteria
  - ship-timeline
  - outcome
  - "*"
  - relationships
fields:
  $path:
    pattern: "^docs/prds/prd-\\d{3}-[a-z0-9-]+\\.md$"
  template:
    required: true
  title:
    required: true
  status:
    type: string
    required: true
    enum: [draft, review, approved, shipped, dropped]
---

# PRD template

## Problem

```yaml section-rules
required: true
```

## Goals

```yaml section-rules
required: true
```

## Acceptance Criteria

```yaml section-rules
required: true
```

### <item>
```yaml section-rules
repeatable: true
heading:
  pattern: "^AC\\d+ — .+ — `(must|should|nice)` · `(draft|in_progress|verified|descoped)`$"
```

## Ship Timeline

```yaml section-rules
required: { when: "status in ['approved', 'shipped']" }
```

## Outcome

```yaml section-rules
required: false
```

## Relationships

```yaml section-rules
required: false
list:
  item:
    pattern: "^\\*\\*[a-z_]+\\*\\* \\[.+\\]\\(.+\\)( — .+)?$"
```
````

An instance that omits `## Problem` triggers a `required-missing`
error. An instance whose `## Acceptance Criteria` contains an H3 that
doesn't match the `heading.pattern` triggers a `heading-mismatch` error
at that heading's line.

## See also

- [Frontmatter rules](frontmatter-rules.md) — composable field
  primitives.
- [Folder & filename rules](folder-and-naming.md) — `$path` synthetic
  field, slug rules.
- [Full example](full-example.md) — end-to-end template + instance.
- [Canonical formatter](../canonical-formatter.md) — how `sections[]`
  drives reordering.
