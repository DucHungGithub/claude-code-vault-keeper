---
name: vault.fix
description: "Apply deterministic, safe auto-fixes to vault documents — frontmatter key reordering, body section reordering per template, AC heading normalization, trailing whitespace, multi-blank-line collapse. Powered by `lib/canonical-formatter.js`. Only fixes that are 100% mechanical and information-preserving — never invents content, never changes field VALUES, never guesses missing required fields. After fixing, re-runs validate and reports residual issues that need human attention. Use when the user says 'fix vault', 'format vault docs', 'auto-fix', 'canonicalize', 'sửa vault', 'format lại docs', '/vault.fix'."
---

# vault.fix — deterministic auto-fixes

This skill applies the **canonical formatter** (`lib/canonical-formatter.js`) to vault documents. The formatter is **idempotent** and **information-preserving** — it reorders, normalizes whitespace, and canonicalizes headings/bullets, but never invents content or changes values. Anything that requires judgment is reported as a residual issue for the user to handle.

## Scope of safe fixes (what this skill DOES)

From `canonical-formatter.js`:

1. Frontmatter YAML key ordering — priority keys first (`id`, `title`, `template`, `status`, `phase`, `owner`, `created`, `updated`), then alphabetical.
2. Body section reordering per the template's `sections:` list.
3. AC heading normalization → `### AC<n> — <Title>`.
4. Relationship bullet normalization → `- **predicate** [...](...) — reason`.
5. Trailing whitespace strip.
6. Multi-blank-line collapse (max 1 inside a section, max 2 between sections).
7. Final newline normalization.

## Scope of UNSAFE fixes (what this skill REFUSES)

- Filling in a missing `required_fields` entry — that's authoring.
- Coercing an invalid `status` value into a legal one — that's a semantic guess.
- Renaming a file to match `path_regex` — that affects links and history.
- Adding missing `required_body_sections` H2 headings — empty section is meaningless.
- Anything that depends on knowing what the user *meant*.

If the user explicitly asks for one of the above, refuse and explain: *"That requires authoring judgment, not formatting. Open the file and decide."*

## Pre-flight (silent)

1. Confirm clean git state — `git -C "${CLAUDE_PROJECT_DIR}" status --porcelain | head -5`. If uncommitted changes exist, STOP and ask: *"Working tree is dirty. Commit or stash first, or pass `--allow-dirty` to proceed. Auto-fixes touch many files; you want a clean diff to review."* Never silently overwrite uncommitted work.
2. Resolve scope:
   - No arg → fix entire vault.
   - Arg path → fix only that file or subtree.
3. Run `vault-keeper validate --json` first to capture the **before** error count.

## Step 1 — dry-run preview

Before writing, compute a diff preview:

```js
import { formatVaultDocument } from 'claude-code-vault-keeper/formatter';
// for each markdown file in scope:
//   read → format → diff against original → collect change summary
```

(Use `node -e` one-liner via `Bash` if a JS environment is needed. Do NOT inline-bundle the formatter logic — always invoke `lib/canonical-formatter.js`.)

Show the user:
- Files that would change (count + list, cap list at 20).
- A representative diff (one file, max 30 lines).
- Estimated runtime if file count > 200.

Ask via `AskUserQuestion`: *"Apply auto-fixes to N files?"* with options `yes, apply`, `no, abort`, `only files matching <subpath>`. Do NOT proceed without explicit confirmation.

## Step 2 — apply

For each file in scope, write the formatted output back. Preserve file mode. Do NOT touch files that the formatter returns unchanged (skip the write — keeps mtime stable for unaffected docs).

## Step 3 — verify

Re-run `vault-keeper validate --json`. Capture the **after** error count. The expected outcome:

- `after.errors == 0` → success, vault is clean.
- `0 < after.errors < before.errors` → partial success. Residual errors are non-deterministic (required field missing, etc.) — report them for human follow-up.
- `after.errors >= before.errors` → **formatter regression**. STOP. Print the diff between before and after error lists, suggest `git restore .` to roll back. This branch should be rare; if it fires, it's a formatter bug worth filing.

## Output contract

```
vault.fix — formatted <N> files, skipped <M> already-canonical

Validate before → after: <X errors> → <Y errors>

Residual (need human judgment):
  - <docs/path/foo.md:12 — required field `owner` missing — formatter can't guess a value>
  - <docs/path/bar.md:8 — status `wip` not in allowed values [todo, in_progress, done] — pick one>
  - ...

Git diff is staged for review. Commit when satisfied, or `git restore .` to undo.
```

Do NOT auto-commit. The user reviews the diff and commits themselves (or via `/vault.sync`).

## Composition

- Pairs with `/vault.health` — health diagnoses, fix repairs the mechanical subset.
- Pairs with `/vault.sync` — fix first, then sync, so the remote receives canonical docs.
- Never invoked silently by `/vault.sync` — sync runs validate, not fix. Fix is opt-in because it touches many files.
