# Skill Suite v0.8.0 — Design

**Date**: 2026-05-19
**Status**: Approved for planning
**Author**: brainstorming session (duocnv@firegroup.io)

## Problem

After `claude plugin install claude-code-vault-keeper@vault-keeper`, the user gets LSP diagnostics. Every other interaction with the vault still happens via terminal (`vault-keeper validate`, `vault-keeper init`, `vault-keeper doctor`). The Claude Code plugin layer adds no verb-level differentiation over plain `bunx`/`npx` install.

Four skill drafts already exist in the working tree but are not committed:

- `skills/vault.fix/SKILL.md`
- `skills/vault.health/SKILL.md`
- `skills/vault.setup/SKILL.md`
- `skills/vault.sync/SKILL.md`

A fifth skill, `skills/vault.monitor-git-sync/SKILL.md`, is already committed and shipped.

## Goal

Ship `claude-code-vault-keeper` v0.8.0 turning the plugin from "LSP + bins" into a **verb-driven Claude Code experience**: six skills the user types in a Claude session, where the daily-use loop happens inside Claude rather than inside a terminal.

## Final skill catalog

| Verb | Trigger | Status before this release |
|---|---|---|
| `/vault.setup` | Onboarding interview → `vault-keeper init` + extend templates per answers | uncommitted draft |
| `/vault.new <type> [slug]` | Scaffold new doc from a template, frontmatter pre-filled from `required_fields`, target path derived from `path_regex` | **NEW (this release)** |
| `/vault.health` | Parse `vault-keeper doctor --json` + `validate --json`, render digested report grouped by template + folder + rule kind | uncommitted draft |
| `/vault.fix` | Apply `formatVaultDocument` deterministic auto-format, re-validate, report residuals | uncommitted draft |
| `/vault.sync` | Validate-then-push pipeline (validate → stash → pull --rebase → restore → commit → push), refuses to push on validate failure | uncommitted draft |
| `/vault.monitor-git-sync` | Spawn `scripts/poll-fetch.sh` via `Monitor` tool, passive background watcher | already shipped |

## Architecture invariants (preserved)

The two non-negotiable rules from `CLAUDE.md` remain unviolated:

1. **Plugin JS stays vault-agnostic.** No skill ships logic in `lib/`, `cli/`, or `server/`. `vault.new` reads `required_fields` / `path_regex` from the user-specified template at runtime via the public API (`loadTemplateRules`) — it does NOT hardcode any field, template name, folder, or status value.
2. **All vault-specific configuration lives in template `validation_rules`.** `vault.new` does not extend the template-rule schema. It consumes existing fields.

The skills are pure agent instructions. They invoke:

- Existing CLI commands (`vault-keeper validate`, `vault-keeper doctor`, `vault-keeper init`)
- The public library API (`formatVaultDocument`, `loadTemplateRules`) via `node -e` one-liners from the skill
- Built-in Claude Code tools (`Bash`, `Read`, `Write`, `Monitor`, `AskUserQuestion`)

No new JS module is created. No new CLI subcommand is added.

## `/vault.new` flow (the only net-new skill)

### Inputs

Skill invoked as `/vault.new <type> [slug]`. Example: `/vault.new task fix-login`.

### Algorithm

1. **Resolve template path**: `templates/<type>-template.md` (relative to `${CLAUDE_PROJECT_DIR}`). If it does not exist, list available templates and abort.
2. **Load template rules** via public API:
   ```bash
   node -e "import('claude-code-vault-keeper').then(({ loadTemplateRules }) => \
     console.log(JSON.stringify(loadTemplateRules('templates/<type>-template.md'))))"
   ```
   Parse the JSON. Extract `required_fields`, `optional_fields`, `field_rules`, `path_regex`.
3. **Derive target file path**: extract the literal prefix from `path_regex` (the leading non-regex-meta segment up to the first `\d` / `[` / `(` / quantifier) and append `<slug>.md`. If a numeric counter is part of the regex (`-\d{3}-`), find the highest existing number under the literal prefix and increment.
4. **Generate frontmatter placeholders** keyed by field name. Defaults:
   - `template: templates/<type>-template.md`
   - `title: <slug humanized>`
   - For each `required_field`: pick the first valid `enum` value when one exists; for `regex`-constrained fields, emit `'@TODO'` placeholder; for `type: integer` fields with `min: M`, emit `M`; for date-shaped fields (`created`, `updated`), emit today (`YYYY-MM-DD`).
5. **Write file** to the derived path using the `Write` tool.
6. **Validate the new file**:
   ```bash
   vault-keeper validate --path <newfile>
   ```
   Confirm green-on-create. If `--strict` would flag the `'@TODO'` placeholders, surface them explicitly: *"placeholders to replace: owner, decision_date"* so the user knows what to fill in.
7. **Open file for editing** by printing the path; do not auto-open.

### Refusal contract

Refuse and explain if:

- The template path does not exist.
- The template's `validation_rules` block is missing or unparseable.
- The derived target path already exists (do not clobber).

## Work breakdown — 5 batches

Batches are designed to be independent so they can land in any order or in parallel via subagents.

### Batch 1 — Verify drafts against current code

For each of the four uncommitted skills, run every command and import the skill text references against the actual v0.7.0 codebase. Fix mismatches inline before committing.

- `vault.fix` references `formatVaultDocument` from `claude-code-vault-keeper/formatter`. Confirm against `lib/index.js` exports.
- `vault.health` references `vault-keeper doctor --json` and `vault-keeper validate --json` JSON shapes. Capture actual stdout, confirm field names match the skill's parsing.
- `vault.setup` references `vault-keeper init <dir> [--force]`. Confirm flag set.
- `vault.sync` references `vault-keeper validate --json` and git operations. Confirm exit-code contract.

Output: PR `chore(skills): verify uncommitted skill drafts against v0.7.0 API`.

### Batch 2 — Write `vault.new` skill

Create `skills/vault.new/SKILL.md` per the algorithm above. Skill is skill-only — no new JS.

Output: PR `feat(skills): add /vault.new for scaffolding docs from templates`.

### Batch 3 — Discoverability surfaces

- `README.md` *"What's in the box"* section: add a bullet *"Six Claude Code skills"* + a 6-row table mapping each verb to its one-line trigger.
- `docs/getting-started.md`: after the *"install via Claude Code plugin"* step, add one paragraph: *"Try `/vault.health` to inspect the vault, `/vault.new task my-first` to scaffold a doc. Full catalog under [`skills/`](../skills/)."*
- `skills/README.md` (new file): index of all six skills with one-line summaries. This is the catalog page the README points at.

Output: PR `docs: surface skill catalog in README + getting-started`.

### Batch 4 — Cross-reference sanity

Audit every cross-reference in every skill (`vault.health → vault.fix`, `vault.sync ↔ vault.monitor-git-sync`, `vault.setup → vault.health`, etc.). Confirm each reference resolves to the actual skill name on disk. Fix any drift.

Output: small PR or rolled into Batch 1.

### Batch 5 — Release v0.8.0

- Bump `package.json` `version` to `0.8.0`.
- Bump `.claude-plugin/plugin.json` `version` to `0.8.0`.
- Optionally update `.claude-plugin/marketplace.json` description if it references "LSP + CLI" — verify on implementation.
- Add `CHANGELOG.md` entry: list the four committed-from-draft skills, the new `vault.new` skill, and the discoverability docs.
- Tag `v0.8.0` → CI auto-publishes to npm.

Output: PR `chore(release): v0.8.0 — ship skill suite (setup/new/health/fix/sync)`.

## Test strategy

Skills are agent-execution instructions, not unit-testable. The supporting surfaces ARE testable and already are:

- `vault-keeper doctor --json` — `tests/cli-main.test.js`.
- `vault-keeper validate --json` — `tests/validate-documents.integration.test.js`, `tests/example-vault.test.js`.
- `vault-keeper init` — `tests/cli-main.test.js`.
- `formatVaultDocument` — `tests/canonical-formatter.test.js`.
- `loadTemplateRules` — `tests/template-rules.test.js`, `tests/public-api.test.js`.

Net-new test: a **skill-lint script** (`tests/skills-lint.test.js`) that asserts:

1. Every `skills/*/SKILL.md` has a valid YAML frontmatter with `name:` and `description:` keys.
2. Every command referenced inside a skill body resolves on `PATH` or to a file in the repo.
3. Cross-references between skills (`/vault.<x>` mentions) all resolve to an actual skill directory.

This is a lightweight integration check, not a behavioral test of the skills themselves.

## Release sequencing

Batches 1, 2, 4 can land in parallel. Batch 3 can land after 1 (needs verified skill names). Batch 5 lands last.

Recommended order:

1. Batch 1 (verify-against-code) + Batch 2 (vault.new) in parallel
2. Batch 4 (cross-reference sanity) — small, can be a follow-up commit on the same PR as 1
3. Batch 3 (discoverability) — depends on final skill names
4. Batch 5 (release) — depends on all of the above merged

## Out of scope

These are explicitly NOT part of this release. Each deserves its own design later.

- **README hero rewrite** — separate "Adoption & DX option B" from the brainstorm. Not touched here to avoid mixing positioning work with feature work.
- **`/vault.template`** — skill for authoring templates. Rare verb. Skip this batch.
- **`/vault.migrate`** — bulk-rewrite when a template changes. Risky, deserves its own design.
- **`monitors.json` `on-skill-invoke` trigger inert at runtime** — known issue documented inside `vault.monitor-git-sync` itself. File as a separate GitHub issue; not blocking this release.
- **CLI subcommand `vault-keeper new`** — considered, rejected. Skill-only is sufficient because the public API exposes `loadTemplateRules` since v0.7.0.

## Open questions resolved during brainstorming

| Question | Decision |
|---|---|
| Should `vault.new` add a CLI subcommand? | No. Skill-only. Public API is enough. |
| Should the plugin manifest declare skills? | No. Skills auto-discovered from `skills/` by Claude Code. |
| Should `marketplace.json` description be updated? | Verify during implementation; update only if it currently says "LSP + CLI". |

## Estimated impact

**Before**: plugin install adds LSP diagnostics; user runs `vault-keeper <cmd>` in a terminal for everything else.

**After**: plugin install adds LSP + six verbs typeable inside Claude. The daily loop — author a doc, check health, fix mechanical drift, commit + push — lives inside the Claude session.

The plugin Claude Code surface now has a reason to exist that `bunx vault-keeper` does not provide.
