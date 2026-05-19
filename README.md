# claude-code-vault-keeper

[![CI](https://github.com/nguyenvanduocit/claude-code-vault-keeper/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nguyenvanduocit/claude-code-vault-keeper/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/claude-code-vault-keeper.svg)](https://www.npmjs.com/package/claude-code-vault-keeper)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Template-driven validation for any markdown knowledge-vault.** A
[Claude Code](https://github.com/anthropics/claude-code) plugin that
ships:

- **LSP server** — per-keystroke diagnostics, navigation, hover,
  completion, code-action, code-lens, inlay-hint, rename,
  document-formatting.
- **CLI validator** (`vault-keeper-validate`) — full-vault validation
  with exit codes suitable for CI / pre-commit gating.
- **Shared parsing lib** — markdown body parser, template rules loader,
  conditional-eval DSL, canonical formatter, vault-config.

Editor and CLI parse bodies with the SAME parser and apply the SAME
validation rules. One implementation, two entry points.

The plugin owns **no per-doc-type knowledge** — every rule comes from a
template's `validation_rules` block. Drop in your own `templates/*.md`
and the validator picks them up at runtime.

## Quick start

The package ships two bins: **`vault-keeper`** (multi-tool) and
**`vault-keeper-validate`** (validate-only alias, kept for backwards
compatibility).

### One-shot via `bunx` / `npx` (no install)

```bash
# Multi-tool: any subcommand works
bunx -p claude-code-vault-keeper vault-keeper doctor
bunx -p claude-code-vault-keeper vault-keeper validate --root /path/to/vault --json
bunx -p claude-code-vault-keeper vault-keeper init my-new-vault

# Legacy alias (validate-only) — also works under bunx/npx
bunx claude-code-vault-keeper@latest --root /path/to/vault --json
```

### Install once, reuse

```bash
# Global — adds `vault-keeper` + `vault-keeper-validate` to $PATH
bun add -g claude-code-vault-keeper
npm i  -g claude-code-vault-keeper

# Project dev-dep
bun add -D claude-code-vault-keeper
npm i  -D claude-code-vault-keeper
```

### As a Claude Code plugin (inline LSP diagnostics)

The fastest path is the bundled installer:

```bash
vault-keeper install-claude-code-plugin
```

Equivalent manual steps (the installer prints them if `claude` is absent):

```bash
claude marketplace add https://github.com/nguyenvanduocit/claude-code-vault-keeper.git
claude plugin install claude-code-vault-keeper@vault-keeper
```

The LSP server (`server/main.bundled.cjs`) ships pre-built — editor
diagnostics need no extra install.

### Subcommands

| Subcommand | What it does |
|---|---|
| `vault-keeper validate` | Validate vault docs against template rules (same surface as the legacy `vault-keeper-validate`). |
| `vault-keeper doctor` | Health-check the environment, cwd vault config, and Claude Code plugin state. `--json` for CI. |
| `vault-keeper install-claude-code-plugin` | Run `claude marketplace add` + `claude plugin install` for you. |
| `vault-keeper init [dir]` | Scaffold a minimal vault (`.claude/`, `templates/note-template.md`, `notes/note-001-hello.md`) in `dir` (default: `.`). |
| `vault-keeper help [cmd]` | Top-level or per-command usage. |
| `vault-keeper --version` | Print the package version. |

## Documentation

Full documentation lives in [`docs/`](docs/README.md). Recommended
reading order:

1. [Getting started](docs/getting-started.md) — install + first vault
   walkthrough.
2. [Vault config](docs/vault-config.md) — `.claude/vault-keeper.json`
   reference.
3. [Templates](docs/templates/README.md) — how to author templates that
   declare validation rules.
4. [CLI validator](docs/cli-validator.md) — flags, exit codes, JSON
   output.
5. [LSP features](docs/lsp-features.md) — what shows up in the editor.
6. [CI/CD integration](docs/ci-cd-integration.md) — GitHub Actions /
   GitLab CI / generic Bash patterns.
7. [Troubleshooting](docs/troubleshooting.md) — common errors and fixes.

Reference:

- [Canonical formatter](docs/canonical-formatter.md)
- [Body parser](docs/body-parser.md)
- [Naming conventions](docs/naming-conventions.md)
- [Architecture](docs/architecture.md)

## Repo

Source: <https://github.com/nguyenvanduocit/claude-code-vault-keeper>
Issues: <https://github.com/nguyenvanduocit/claude-code-vault-keeper/issues>
Releasing: see [`docs/releasing.md`](docs/releasing.md) for the tag-driven
release workflow + npm Trusted Publisher / `NPM_TOKEN` setup.

Cloning is only needed to contribute. End users should prefer `bunx` /
`npx` / `bun add` / `npm i` per the Quick start above.

## License

MIT — see [`LICENSE`](LICENSE).
