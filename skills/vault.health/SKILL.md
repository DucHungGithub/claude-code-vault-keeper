---
name: vault.health
description: "Read-only vault health check — runs `vault-keeper doctor` for environment + config state, then `vault-keeper validate --json` for per-doc rule violations, groups errors by template + folder, and surfaces the top fixable issues with file:line citations. Never modifies files. For deterministic batch auto-fixes, hand off to `/vault.fix`. Use when the user says 'check vault', 'vault health', 'vault status', 'validate documents', 'kiểm tra vault', 'vault có lỗi gì không', '/vault.health'."
---

# vault.health — read-only vault report

This skill runs the validator and the doctor, then **interprets** the output — it never edits files. The output is a digested report the user can act on, not a raw paste of stdout.

## Pre-flight (silent)

Resolve project root: `${CLAUDE_PROJECT_DIR:-$PWD}`. If no `.claude/vault-keeper.json` exists, the plugin still works (whole-repo-is-vault default) — proceed without asking, but mention defaults are in effect in the final report.

## Step 1 — environment health

Run in parallel via `Bash`:

```
vault-keeper doctor --json
vault-keeper validate --json --root "${CLAUDE_PROJECT_DIR:-$PWD}"
```

Both emit JSON. Do NOT shell into them with `2>&1 | tail` — you need the structured output. Capture both stdout streams.

If `doctor` reports any `status: error` check (e.g. missing LSP bundle, broken config parse), surface those FIRST and stop the rest of the report. Environment errors mask document errors — fixing them is prerequisite.

## Step 2 — parse the validate report

The `--json` report shape (see `cli/validate-documents.js` for the contract) lists files, errors, warnings, and the template each doc resolved to. Group findings by:

1. **template** — which authoring contract is producing the most violations? Often signals a template-side issue, not a per-doc issue.
2. **folder** — which subtree of the vault is least healthy?
3. **rule kind** — required_fields missing? path_regex mismatch? state_machine illegal transition? body_section_format violation?

## Step 3 — render the report

Output a fixed structure (don't freestyle):

```
vault.health — <project-root>

Environment
  vault-keeper vX.Y.Z · config: <vaultRoot=… vaultFolders=[…]>
  doctor: <N ok, M warn, K error>

Documents
  <total> docs · <healthy> ✅ · <warned> ⚠️  · <invalid> ❌

Top violations (by frequency)
  1. <rule kind>: <count> occurrences across <N> docs
     e.g. <docs/path/foo.md:12 — required field `owner` missing>
     e.g. <docs/path/bar.md:8 — status `wip` not in allowed values [todo, in_progress, done]>
  2. ...
  3. ...

Templates with most issues
  templates/<x>-template.md → <N> docs failing
    most-common failure: <rule kind>

Suggested next steps
  - <concrete action 1>
  - <concrete action 2>
  - run `/vault.fix` to auto-format deterministic issues (frontmatter ordering, section ordering, trailing whitespace)
```

Cap "top violations" at 5. Cap "suggested next steps" at 3. If a template is producing >50% of all violations, raise that as the single top recommendation — it almost always means the template's `validation_rules` are mis-shaped, not the documents.

## What this skill DOES NOT do

- Does NOT modify any file (no edits, no formatting, no frontmatter rewrites).
- Does NOT run `git` commands.
- Does NOT propose changes to template `validation_rules` unless explicitly asked — that's an authoring decision, not a health check.
- Does NOT loop. One run, one report, exit.

For auto-fixes hand off to `/vault.fix`. For git sync hand off to `/vault.sync`.

## Exit contract

The skill's last line is one of:
- `vault.health: 0 errors, 0 warnings — vault is clean`
- `vault.health: N errors, M warnings — see report above`

No emoji, no celebration. Evidence over enthusiasm.
