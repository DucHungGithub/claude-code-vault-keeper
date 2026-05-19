---
name: vault.sync
description: "Validate-gated one-shot git sync for a vault repo — runs `vault-keeper validate`, refuses to push if errors exist, then stash → `git pull --rebase` → restore → commit any vault changes with an auto-generated message → push. Composes with `vault.monitor-git-sync` (passive watcher) but does not require it. Use when the user says 'sync vault', 'push vault', 'đẩy vault lên remote', 'commit và push docs', 'vault sync', '/vault.sync'."
---

# vault.sync — validate-then-push, one-shot

This is the **explicit** counterpart to the passive `vault.monitor-git-sync` watcher. It runs once, validates, syncs, and exits. The watcher handles silent fast-forwards in the background; this skill handles the user's explicit *"I'm done editing, ship it"* moment.

## The contract

1. **Validate first.** No errors → proceed. Errors → STOP and surface them. The user can pass `--skip-validate` to override (escape hatch for emergency hotfixes), but never silently skip.
2. **Stash dirty tree** if present. The stash includes untracked + ignored files? No — only tracked changes; untracked stays put.
3. **Pull with rebase.** If conflicts → STOP, surface conflict files, hand off to the user. Do NOT auto-resolve.
4. **Restore stash.**
5. **Commit** any remaining staged + unstaged vault changes with a generated message (see below).
6. **Push.** Only after every prior step succeeds.

Each step's success gates the next. Any failure halts the chain and reports the exact step + reason. Do not retry.

## Pre-flight (silent)

Run in parallel via `Bash`:

1. **In a git repo + has remote** — `git rev-parse --abbrev-ref --symbolic-full-name @{u}`. No upstream → ask user to set one (`git push -u origin <branch>`) before continuing.
2. **vault-keeper reachable** — `command -v vault-keeper`. Not found → fall back to `node "${CLAUDE_PLUGIN_ROOT}/cli/main.js"`.
3. **Branch protection awareness** — `git branch --show-current`. If it's `main` or `master`, ask the user once: *"Push to <branch> directly? (yes/branch off)"*. Don't second-guess on subsequent calls in the same session.

## Step 1 — validate

```
vault-keeper validate --root "${CLAUDE_PROJECT_DIR:-$PWD}"
```

Exit 0 → proceed.
Exit non-zero → print the report, end with: *"Fix violations or pass `--skip-validate` to override. Suggest `/vault.health` for a structured view, `/vault.fix` for deterministic auto-fixes."* DO NOT continue.

User passed `--skip-validate` → log it explicitly: *"validate skipped by --skip-validate flag — proceeding to sync"*. The user sees the override is real, not silent.

## Step 2 — stash if dirty

```
git status --porcelain
```

Non-empty → `git stash push -m "vault.sync auto-stash $(date -u +%FT%TZ)"` then capture the stash ref (`git rev-parse stash@{0}`) for restore.
Empty → skip stash entirely. Note this in the output so the user knows no stash was made.

## Step 3 — pull with rebase

```
git pull --rebase --autostash=false
```

Use `--autostash=false` explicitly — we manage our own stash so failures are diagnosable.

Exit 0 → proceed.
Rebase conflict → STOP. Print: *"Conflict during rebase on <files>. Resolve manually: `git status` to see markers, edit, `git rebase --continue`. Your work is in stash@{0} — restore with `git stash pop` after rebase is clean."* End the skill. Don't try to undo the rebase.

## Step 4 — restore stash

If a stash was made in step 2:
```
git stash pop
```
Pop conflict → STOP same as rebase conflict, with the same hand-off pattern.

## Step 5 — commit

```
git status --porcelain
```

Empty → skip commit (nothing changed locally — pull may have pulled remote work that's now your local). Note in output.
Non-empty → stage everything under the vault folders only (read `.claude/vault-keeper.json` for `vaultFolders`, default `["."]`) and commit.

**Commit message format:**

```
vault: sync <N> docs · <YYYY-MM-DD HH:MM UTC>

<bulleted list of touched files, max 10, then "... and K more">
```

Use a HEREDOC to pass the message (per CLAUDE.md commit-protocol convention). NEVER use `--amend`. NEVER use `--no-verify` unless the user explicitly asked.

## Step 6 — push

```
git push
```

Exit 0 → success. Print one line: *"vault.sync: pushed <N> commit(s) to <remote>/<branch>"*.
Non-fast-forward → STOP. Print: *"Remote advanced again during sync. Re-run `/vault.sync` to fetch and rebase the new commits."* (This race is rare but real when `vault.monitor-git-sync` is not running.)

## Composition with `vault.monitor-git-sync`

The watcher handles the **trivial** case (remote advanced cleanly → local fast-forwards in the background, no user intervention). This skill handles the **non-trivial** case (local has uncommitted work + needs to ship). They never conflict — both call `git pull --rebase`, both refuse to auto-resolve, both rely on the same upstream tracking.

If the user has the watcher armed, `vault.sync` may find the local branch already up-to-date with origin → step 3 is a no-op, sync proceeds straight to commit + push. That's expected.

## Output contract

A single multi-line block, no preamble:

```
vault.sync — <branch> → <remote>

  validate    ✅ 42 docs · 0 errors
  stash       ⚪ clean tree, skipped
  pull        ✅ already up-to-date
  restore     ⚪ no stash
  commit      ✅ vault: sync 3 docs · 2026-05-19 09:00 UTC
  push        ✅ 1 commit pushed to origin/main

Done.
```

Or a failure block at the first failing step, with the suggested next action. No retry loop, no automatic resolution. The user is the conflict resolver.
