# Frontmatter rules

The `fields:` block in a template's frontmatter declares the schema
that every instance of that template must satisfy. Each field entry is
an object whose keys are **composable primitives** — small, independent
constraints that combine freely.

This page covers:

- [Primitives reference](#primitives-reference)
- [Shorthand vs expanded form](#shorthand-vs-expanded-form)
- [Conditional `when` DSL](#conditional-when-dsl)
- [Strict mode](#strict-mode)

For folder / filename / body rules see
[folder-and-naming](folder-and-naming.md) and [body-rules](body-rules.md).

---

## Primitives reference

Each key inside a field entry is a **primitive** — a pure validation
function `(value, param, ctx) => Issue[]`. The engine applies every
declared primitive independently.

### `required` (boolean)

The field must be present and non-empty (`undefined`, `null`, or empty
string fail). `0` and `false` count as present.

```yaml
fields:
  title:
    required: true
```

Supports the `when` modifier for conditional requirements:

```yaml
fields:
  shipped_date:
    required: { when: "status in ['approved', 'shipped']" }
    type: string
    pattern: "^\\d{4}-\\d{2}-\\d{2}$"
```

When the condition does not match, the `required` check is skipped
silently.

---

### `type` (string)

Declares the expected JavaScript type of the field value. Allowed
values: `string`, `integer`, `number`, `boolean`, `date`, `array`.

```yaml
fields:
  estimate_hours:
    type: integer
  tags:
    type: array
  created:
    type: string
```

`integer` requires `typeof value === "number" && Number.isInteger(value)`.
A string `"50"` fails — YAML must parse it as a bare number.

Error type: `type-mismatch`.

---

### `enum` (array)

Value must appear in the list.

```yaml
fields:
  status:
    type: string
    enum: [draft, review, approved, shipped, dropped]
  prd_type:
    type: string
    enum: [feature, enhancement, fix]
```

Error type: `enum-violation`. The fix message lists all allowed values.

---

### `pattern` (string — regex)

Value (coerced to string) must match the regex. The string is compiled
with `new RegExp()` at runtime — escape backslashes in YAML.

```yaml
fields:
  created:
    type: string
    required: true
    pattern: "^\\d{4}-\\d{2}-\\d{2}$"
```

Error type: `pattern-mismatch`.

---

### `min` / `max` (number)

Numeric bounds. The target depends on the declared `type`:

| Declared `type` | What `min`/`max` compare | Label in error |
|---|---|---|
| `string` | `value.length` | "Length" |
| `integer` / `number` | `value` itself | "Value" |
| `array` | `value.length` | "Count" |

**Meta-validation enforces:** `min`/`max` require a declared `type` on
the same field. A template that uses `min: 1` without `type` produces a
`template-schema-invalid` error.

```yaml
fields:
  rice.reach:
    type: integer
    min: 1
  rice.confidence:
    type: integer
    min: 1
```

Error types: `min-violation`, `max-violation`.

---

### `uniqueItems` (boolean)

Only meaningful for `type: array`. When `true`, the array must not
contain duplicate entries.

```yaml
fields:
  tags:
    type: array
    uniqueItems: true
```

Error type: `unique-violation`.

---

### `exists` (boolean)

When `true`, the string value is treated as a file path and checked
for existence on disk. Useful for `design_link` or `artifact_path`
fields that should reference real files.

```yaml
fields:
  design_link:
    type: string
    exists: true
```

Error type: `exists-missing`.

---

### `description` (string)

Metadata-only — emits nothing. Use it to document a field's purpose
inside the template:

```yaml
fields:
  rice:
    required: { when: "prd_type in ['feature']" }
    description: "RICE score object — reach, impact, confidence, effort"
```

---

## Shorthand vs expanded form

Every primitive supports two notations:

**Shorthand** — the primitive value directly:

```yaml
fields:
  status:
    enum: [draft, review, approved]
```

**Expanded** — an object with `value` plus optional modifiers (`when`,
`severity`, `message`):

```yaml
fields:
  due_date:
    required:
      value: true
      when: "status in ['approved', 'shipped']"
      severity: warning
      message: "Approved items should have a due date"
```

The engine normalizes shorthand to expanded form internally. The
modifier keys are:

| Modifier | Type | Effect |
|---|---|---|
| `value` | any | The constraint parameter (same as the shorthand value) |
| `when` | string (DSL) | Skip this constraint unless the condition matches |
| `severity` | `"error"` or `"warning"` | Override the default severity (default: `"error"`) |
| `message` | string | Override the default error message |

### Special case: `required`

`required: { when: "..." }` defaults `value` to `true` — you don't
need to write `value: true` explicitly:

```yaml
# These are equivalent:
shipped_date:
  required: { when: "status in ['approved', 'shipped']" }

shipped_date:
  required: { value: true, when: "status in ['approved', 'shipped']" }
```

---

## Conditional `when` DSL

The `when` modifier uses a small boolean DSL evaluated against the
instance's frontmatter.

### Grammar

```
expr        := or_expr
or_expr     := and_expr ( 'or' and_expr )*
and_expr    := comparison ( 'and' comparison )*
comparison  := field ( 'in' | 'not' 'in' ) list
list        := '[' ( string ( ',' string )* )? ']'
field       := IDENT ( '.' IDENT )*
string      := single-quoted | double-quoted
```

### Examples

```
status in ['approved', 'shipped']
prd_type in ['feature'] and status not in ['draft', 'review']
priority in ['must', 'should'] or owner in ['@alice', '@bob']
```

The only operators are `in`, `not in`, `and`, `or`. Dotted field paths
are supported. String literals must be single- or double-quoted. There
is no equality operator, no arithmetic, no functions — by design (the
DSL is meant to be readable in a template by a non-engineer).

### Evaluation behavior

- The DSL is evaluated against the instance's parsed frontmatter object.
- If the condition matches, the constraint fires.
- If the condition does not match, the constraint is skipped silently.
- A DSL syntax error in the template produces a `template-schema-invalid`
  error during meta-validation.

---

## Strict mode

When a template declares `strict: true` at the frontmatter top level
(outside `fields:`), any frontmatter key in an instance that is NOT
declared in the template's `fields:` block produces an error:

```yaml
---
template_path: templates/strict-note.md
document_type: note
strict: true
fields:
  template:
    required: true
  title:
    required: true
---
```

An instance with an undeclared key:

```yaml
---
template: templates/strict-note.md
title: Hello
random_key: oops
---
```

```
[ERR ] field=random_key  Undeclared field 'random_key' is not in the schema
       fix: Remove 'random_key' or declare it in the template fields
```

Error type: `undeclared-field`.

---

## Combining primitives

Multiple primitives on one field all apply independently:

```yaml
fields:
  status:
    type: string
    required: true
    enum: [draft, review, approved, shipped, dropped]
  created:
    type: string
    required: true
    pattern: "^\\d{4}-\\d{2}-\\d{2}$"
  estimate_hours:
    type: integer
    min: 1
```

Each violation produces a separate diagnostic. If `required` fails
(value missing), the remaining primitives on that field are skipped —
there is nothing to validate.

---

## Dot-path fields

Field names support dot notation for nested frontmatter:

```yaml
fields:
  rice.reach:
    type: integer
    min: 1
  rice.confidence:
    type: integer
    min: 1
```

The engine resolves `rice.reach` by walking
`frontmatter.rice.reach`.

---

## Meta-validation

The engine validates the template itself before enforcing it on
instances. Template-level issues use error type
`template-schema-invalid`:

- Unknown primitive key on a field.
- Invalid `type` value (not in `string`, `integer`, `number`,
  `boolean`, `date`, `array`).
- Invalid regex in `pattern`.
- `enum` is not a non-empty array.
- `min`/`max` is not a number, or is used without a declared `type`.
- Invalid `when` DSL syntax.
- Synthetic field uses a disallowed primitive.

Meta-validation runs at template load time and the issues appear in
`templateErrors` on the loaded schema object.

---

## A complete example

```yaml
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
  document_type:
    required: true
  title:
    required: true
  owner:
    required: true
  status:
    type: string
    required: true
    enum: [draft, review, approved, shipped, dropped]
  created:
    type: string
    required: true
    pattern: "^\\d{4}-\\d{2}-\\d{2}$"
  tags:
    type: array
  design_link:
    type: string
  shipped_date:
    type: string
    required: { when: "status in ['approved', 'shipped']" }
    pattern: "^\\d{4}-\\d{2}-\\d{2}$"
  prd_type:
    type: string
    enum: [feature, enhancement, fix]
  priority:
    type: string
    enum: [must, should, nice]
  rice:
    required: { when: "prd_type in ['feature']" }
  rice.reach:
    type: integer
    min: 1
  rice.confidence:
    type: integer
    min: 1
---
```

An instance must declare at least `template`, `document_type`, `title`,
`owner`, `status` (else hard errors). If `status` is `approved` or
`shipped`, `shipped_date` becomes required. `created` must be
`YYYY-MM-DD`. `status` must be one of five values. `rice.reach` must be
an integer >= 1. The `$path` synthetic field ensures the document lives
at the correct filesystem location.

## See also

- [Folder & filename rules](folder-and-naming.md) — `$path` synthetic
  field, slug rules.
- [Body rules](body-rules.md) — body section-rules code fences.
- [Full example](full-example.md) — end-to-end template + instance.
- [Troubleshooting](../troubleshooting.md) — common rule-author errors
  with fixes.
