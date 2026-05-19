# Getting started

End-to-end walkthrough: install the CLI, set up a vault, write a template,
validate a conforming document. Editor-side diagnostics via Claude Code are
covered at the end.

## Prerequisites

- **Node.js** ≥ 18 — required by the CLI runtime.
- *Optional:* **[Bun](https://bun.sh)** — `bunx` makes the one-shot run
  below faster and avoids touching your npm cache.
- *Optional:* **[Claude Code](https://github.com/anthropics/claude-code)** —
  required only if you want editor-side LSP diagnostics. The CLI works
  standalone.

## Pick an installation style

| Style | Use when | Command |
|---|---|---|
| **One-shot** (no install) | Evaluating the tool / one-off CI check. | `bunx -p claude-code-vault-keeper vault-keeper <command>` *(or `npx -p claude-code-vault-keeper vault-keeper <command>`)* |
| **Project dev-dep** | The vault lives inside a JS/TS repo and CI runs `npm`/`bun` already. | `bun add -D claude-code-vault-keeper` *(or `npm i -D claude-code-vault-keeper`)* |
| **Global** | You author many vaults; want `vault-keeper` in `$PATH`. | `bun add -g claude-code-vault-keeper` *(or `npm i -g claude-code-vault-keeper`)* |
| **Claude Code plugin (LSP)** | You want inline diagnostics in your editor. | `vault-keeper install-claude-code-plugin` *(or run the two `claude …` commands yourself — see below)* |

You do **not** need to `git clone` the repo to use the validator. Cloning
is only for contributing — see [Architecture](architecture.md#repo-layout).

## Available subcommands

After install, the `vault-keeper` bin exposes:

```text
vault-keeper validate [--root <vault>] [--path <file>] [--strict] [--json]
vault-keeper doctor [--json]
vault-keeper install-claude-code-plugin
vault-keeper init [<dir>] [--force]
vault-keeper help [<command>]
vault-keeper --version
```

The legacy bin `vault-keeper-validate` (validate-only, same flag surface as
`vault-keeper validate`) is kept for backwards compatibility — both names
remain on `$PATH` after install.

### `doctor`

Verify the environment and the current vault are ready to go:

```bash
vault-keeper doctor
```

The checklist covers Node version, bun availability, the `claude` CLI, the
LSP bundle, and the cwd's vault config + `templates/` directory. Pass
`--json` for CI-consumable output.

### `install-claude-code-plugin`

```bash
vault-keeper install-claude-code-plugin
```

Wraps the two-step manual install:

```bash
claude marketplace add https://github.com/nguyenvanduocit/claude-code-vault-keeper.git
claude plugin install claude-code-vault-keeper@vault-keeper
```

If `claude` is not on `$PATH`, the command prints the manual steps instead
of failing silently.

### `init`

Scaffold a minimal vault skeleton:

```bash
vault-keeper init my-vault
cd my-vault
vault-keeper validate
```

Creates `.claude/vault-keeper.json`, `templates/note-template.md`, and a
sample `notes/note-001-hello.md`. The sample validates clean — start
editing.

## Verify the install

Run `doctor` from anywhere to confirm Node, the LSP bundle, the optional
`claude` CLI, and the cwd vault state are all healthy:

```bash
vault-keeper doctor
```

For an end-to-end check, scaffold and validate a fresh vault in one step:

```bash
vault-keeper init /tmp/vk-smoke && cd /tmp/vk-smoke && vault-keeper validate
# → "Valid: 1/1", exit 0
```

The repository's runnable example vault (15 invalid fixtures + 9 valid
documents) is browsable on GitHub:
<https://github.com/nguyenvanduocit/claude-code-vault-keeper/tree/main/examples/example>.

## Set up your own vault

A vault needs three things:

1. **Templates** — at least one markdown file in `templates/` whose
   frontmatter contains a `validation_rules:` block.
2. **Documents** — markdown files under the configured `vaultRoot` whose
   own frontmatter declares `template: templates/<your-template>.md`.
3. **(Optional) config** — `.claude/vault-keeper.json` if your folder
   layout differs from the defaults (whole repo as vault).

### Step 1 — create the layout

```bash
mkdir -p my-vault/.claude my-vault/templates my-vault/notes
cd my-vault
```

### Step 2 — declare vault config (optional)

If you want the validator to scan only `notes/` instead of the whole
repo:

```bash
cat > .claude/vault-keeper.json <<'EOF'
{
  "vaultRoot": "notes",
  "vaultFolders": ["notes"]
}
EOF
```

With no config file, the whole repo IS the vault and only generic patterns
are excluded (`node_modules`, `.vitepress`, `README.md`, `CLAUDE.md`,
`CLAUDE.local.md`). See [vault-config](vault-config.md) for every atom.

### Step 3 — write a template

````bash
cat > templates/note-template.md <<'EOF'
---
template_path: templates/note-template.md
document_type: note
validation_rules:
  required_fields: [template, document_type, title, owner]
  optional_fields: [tags]
  field_rules:
    - field: status
      values: [draft, review, approved]
  path_regex: "^notes/"
---

# Note template

Body sections this template expects.

## Relationships

```yaml section-rules
relationships:
  required: false
```
EOF
````

See [templates/frontmatter-rules](templates/frontmatter-rules.md) for the
full `validation_rules` vocabulary.

### Step 4 — write a conforming document

```bash
cat > notes/hello.md <<'EOF'
---
template: templates/note-template.md
document_type: note
title: Hello vault
owner: '@alice'
status: draft
---

# Hello

This is my first note.

## Relationships
EOF
```

### Step 5 — validate

From the vault directory:

```bash
bunx claude-code-vault-keeper@latest --root .
# or, if installed locally / globally:
vault-keeper-validate --root .
```

Expected: `Valid: 1/1`, exit code `0`. Try removing the `owner:` line —
the validator will exit `1` and tell you which field is missing plus how
to fix it.

For JSON-formatted output (the form CI consumes):

```bash
bunx claude-code-vault-keeper@latest --root . --json
```

### Step 6 — open in an editor with the LSP

If you installed via Claude Code (the marketplace path above), the LSP is
already wired up. Open any `.md` file in your vault and diagnostics show
inline as you type.

The LSP recognizes a directory as a vault root when it contains either a
`templates/` directory or a `.claude/vault-keeper.json` file. Both are
present in your setup.

For a deeper editor walkthrough see [lsp-features](lsp-features.md).

## What to read next

- Your templates ARE the configuration surface — read
  [templates/README](templates/README.md) for the full vocabulary.
- For CI gating see [ci-cd-integration](ci-cd-integration.md).
- Stuck on an error? Check [troubleshooting](troubleshooting.md).
- Browse the bundled `examples/example/` for a working vault that
  exercises every rule kind — both the
  [README map](https://github.com/nguyenvanduocit/claude-code-vault-keeper/blob/main/examples/example/README.md)
  and [`tests/example-vault.expectations.json`](https://github.com/nguyenvanduocit/claude-code-vault-keeper/blob/main/tests/example-vault.expectations.json)
  enumerate every fixture and the diagnostic it demonstrates.
