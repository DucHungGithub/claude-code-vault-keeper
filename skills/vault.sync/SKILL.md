---
name: vault.sync
description: "Validate-gated one-shot git sync for a vault repo — runs `vault-keeper validate`, refuses to push if errors exist, then stash → `git pull --rebase` → restore → group-aware commit (reads each touched doc's git status + frontmatter `template`/`status` field to split unrelated changes into separate atomic commits OR combine related tiny changes; never invents domain meaning, only reflects user-defined values) → push. Pass `--single-commit` for the legacy one-commit behavior. Composes with `vault.monitor-git-sync` (passive watcher) but does not require it. Use when the user says 'sync vault', 'push vault', 'đẩy vault lên remote', 'commit và push docs', 'vault sync', '/vault.sync'."
---

# vault.sync — validate-then-push, one-shot

This is the **explicit** counterpart to the passive `vault.monitor-git-sync` watcher. It runs once, validates, syncs, and exits. The watcher handles silent fast-forwards in the background; this skill handles the user's explicit *"I'm done editing, ship it"* moment.

## The contract

1. **Validate first.** No errors → proceed. Errors → STOP and surface them. The user can pass `--skip-validate` to override (escape hatch for emergency hotfixes), but never silently skip.
2. **Stash dirty tree** if present. The stash includes untracked + ignored files? No — only tracked changes; untracked stays put.
3. **Pull with rebase.** If conflicts → STOP, surface conflict files, hand off to the user. Do NOT auto-resolve.
4. **Restore stash.**
5. **Commit** any remaining staged + unstaged + untracked vault changes — by default split into atomic groups (one commit per semantic cluster), or one big commit with `--single-commit`. See Step 5 for the grouping rules.
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

## Step 5 — group-aware commits

Goal: keep history readable by emitting **atomic, semantically-grouped** commits. The skill reads each touched doc's `git status` entry + frontmatter (`template:` and `status:` only — never the body diff) and groups changes by what those values say; unrelated concerns get separate commits, related tiny changes get combined. Domain meaning is never invented — group labels reflect literal frontmatter values authored by the user. The plugin already ships `gray-matter` (see `lib/doc-io.js`) — use it to parse frontmatter cheaply.

### 5.1 — collect the change set

```
git status --porcelain -z
```

Empty after filtering to `vaultFolders` → skip commit entirely (pull may have advanced HEAD with remote work, nothing local to ship). Note in output, jump to Step 6.

For each remaining entry, capture:

| field | source |
|---|---|
| `kind` | porcelain code → see mapping table below |
| `path` | porcelain new-path (for renames) or sole path (for everything else) |
| `old_path` | porcelain old-path; only set for `kind = renamed`, otherwise `null` |
| `top_folder` | first path segment of `path` under `vaultRoot` |
| `template` | `template:` from current-file frontmatter at `path` (or HEAD's frontmatter at `old_path or path` if deleted); `null` if absent or non-markdown |
| `status_before` | `status:` field from `git show HEAD:<old_path or path>` frontmatter (or `null` if added/no field). Always use `old_path` for renames — HEAD has the file under the old name |
| `status_after` | `status:` field from working-copy frontmatter at `path` (or `null` if deleted/no field) |
| `status_transition` | `(status_before, status_after)` tuple; `null` if either side is `null` or they're equal |

**Important — `git status --porcelain -z` for renames emits two NUL-separated fields per entry** (new-path NUL old-path NUL). The parser must consume both for `R `/`C ` codes; consume one for everything else. Treating them as one will mis-align all subsequent entries. The plugin's own `git status -z` parser (if you add one) MUST handle this; otherwise prefer `git status --porcelain=v2 -z` which uses an explicit `2 ` prefix on rename entries.

**Porcelain code → `kind` mapping** (explicit so untracked files don't get dropped — a new doc from `/vault.new` shows up as `??` and IS an addition):

| porcelain code | `kind` |
|---|---|
| `??` (untracked) | `added` |
| `A ` (staged add) | `added` |
| `M `, ` M`, `MM`, `AM` | `modified` |
| `D `, ` D` | `deleted` |
| `R ` | `renamed` |
| `C ` | `added` (copy treated as a fresh add — git rarely emits this without `-C`) |
| `MD`, `AD` | `deleted` (final intent wins) |
| anything else (e.g. `U `, `UU` — unmerged) | STOP — surface as "unmerged paths present, resolve before sync" |

Read frontmatter with the same parser the validator uses (`require("gray-matter")`) — do NOT regex YAML. Failures to parse → treat that file's metadata fields as `null`, do not abort; the file still belongs in some group, just a coarser one.

### 5.2 — `--single-commit` escape hatch

User passed `--single-commit` → skip all grouping logic, behave like the legacy path: stage every changed vault file in one shot, emit one commit with subject `vault: sync <N> docs · <UTC>` and a flat bulleted body capped at 20 lines. Continue to Step 6. This is the explicit override for users who want one-commit-per-sync; never silent-fallback to this mode.

### 5.3 — group the change set

Composite group key per change: `(template, top_folder, kind, status_transition)`. Bucket every change by that key.

**Combine pass** (merge tiny adjacent groups so we don't emit 1-file commits when they're really part of the same edit session):

1. Any group with exactly 1 change → look for another group sharing the same `top_folder` AND `template` (transition/kind may differ) AND total size after merge ≤ 5. If found, merge. Repeat one pass.
2. After step 1, if the total group count is still > 5, keep the top 4 by size, collapse the rest into a final **misc** group keyed `(*, *, mixed, null)`. The misc group's subject and body acknowledge the mixing explicitly.

**Post-merge key reconciliation** (so the verb table in 5.4 doesn't misfire on merged groups):

- `template` — keep the original key (combine only merges same-template entries except for misc).
- `top_folder` — keep the original key (combine only merges same-top_folder entries except for misc).
- `kind` — if all members share one kind, keep it; otherwise set to literal `mixed`.
- `status_transition` — if all members share the same non-null `(X, Y)`, keep it; otherwise set to `null`.

The verb table in 5.4 already handles `mixed`/`null` correctly (falls through to `update`), so this rule is just an explicit reminder: the executing LLM MUST recompute the group's `kind` and `status_transition` from its members after merging, NOT inherit them from the largest sub-bucket.

This combine pass is bounded — one pass, deterministic, no recursion. Don't optimize further; consistency > cleverness.

### 5.4 — generate subject + body per group

**Verb** is derived only from `kind` + `status_transition`, never from semantic interpretation of the status value:

| condition | verb |
|---|---|
| all `kind = added` | `add` |
| all `kind = deleted` | `remove` |
| all `kind = renamed` | `rename` |
| all `kind = modified`, all share the same non-null `status_transition (X, Y)` | `set ... to <Y>` |
| mixed `kind`, or `modified` with no shared transition | `update` |

`<Y>` is the literal status string the user defined in their template — the plugin doesn't know what it means and won't substitute synonyms. If the user's vocabulary is `"todo" → "shipped"`, the commit reads `set 3 tasks to shipped`. That preserves the user's domain language without the plugin pretending to understand it.

**Template-noun** is the literal `template` value, lowercased, with `_template` / `-template` suffix stripped (e.g. `task-template` → `task` → noun `task`). Null `template` → `doc`. Pluralize by appending `s` for `N > 1` (skip pluralization if noun already ends in `s`).

**Subject patterns** (target ≤ 72 chars; truncate the slug end with `…` if a single-file subject exceeds):

```
1 file, has template/slug:    vault(<top_folder>): <verb> <slug>
N files, all same template:   vault(<top_folder>): <verb> <N> <noun>(s)
N files, mixed templates:     vault(<top_folder>): <verb> <N> docs
misc group (top_folder=*):    vault: sync <N> assorted docs across <M> folders
```

For the `set ... to <Y>` verb, the subject becomes:
```
vault(<top_folder>): set <N> <noun>(s) to <Y>
```

Cap subjects at 72 chars hard; if exceeded after substitution, drop `<N>` to just `several` (e.g. `vault(docs): set several tasks to in_progress`). Never split a UTF-8 codepoint while truncating.

**Body** — empty for 1-file groups (subject says it all). Multi-file groups get a bulleted list (max 20 lines, then `… and K more`):

```
- <relpath>                          (no annotation)
- <relpath> (<status_before> → <status_after>)   (when transition is non-null and the verb didn't already encode it)
+ <relpath>                          (when kind=added)
- <relpath>  [deleted]               (when kind=deleted)
~ <relpath>  [renamed from <old>]    (when kind=renamed)
```

The misc group's body explicitly lists per-sub-bucket counts:
```
- 3 modified across notes/ (templates: note, journal)
- 2 added in archive/
- 1 deleted in drafts/
```

### 5.5 — emit commits in order

Order groups deterministically:

1. Deletions first (smallest risk if the push later fails partway).
2. Renames.
3. Modifications.
4. Additions.
5. Misc group last.

Within a kind, alphabetize by `(top_folder, template)`. This ordering is mechanical — don't reorder for "narrative".

For each group in order:

```
git add -- <path>...                   # stage just this group's paths
                                       # for renamed entries, stage BOTH path AND old_path
                                       # in the same `git add` invocation — otherwise git
                                       # records a separate `D <old>` + `A <new>` instead
                                       # of a single rename, and the next group picks up
                                       # the stray deletion
git commit -F - <<'EOF'                # HEREDOC, per CLAUDE.md commit-protocol convention
<subject>

<body>
EOF
```

**Expected staged set per group** — `git diff --cached --name-only` should match:

| group kind | expected staged paths |
|---|---|
| `added` / `modified` / `deleted` | the group's `path` values (one entry per change) |
| `renamed` | the group's `path` values only (one entry per change — git's rename detection collapses old+new because both were staged together) |
| `mixed` (after combine) | union of all sub-bucket expectations |

Any mismatch (interactive editor inserted whitespace? hook rewrote file? rename detection didn't kick in because `diff.renameThreshold` is too high?) → STOP, surface the mismatch, do not push partial history. For a stuck rename, suggest `git config diff.renames true` or commit with `--single-commit` as the workaround.

NEVER use `--amend`. NEVER use `--no-verify` unless the user explicitly asked.

### 5.6 — abort on commit failure (any group)

If any `git commit` in the loop fails (hook rejected, empty after staging, signing failed), STOP at that group. Earlier groups stay committed (they're durable history); later groups remain unstaged. Report:

```
commit  ❌ failed at group <K>/<total>: <reason>
        committed: <K-1> groups so far · push aborted
        recover with: <git command to inspect or undo>
```

Do NOT auto-rollback prior commits — they may already be in a coherent state the user wants to keep. The user owns recovery.

## Step 6 — push

```
git push
```

Push is one operation regardless of how many commits Step 5 produced — git transmits all of them in a single ref update.

Exit 0 → success. Print one line: *"vault.sync: pushed <N> commit(s) to <remote>/<branch>"* where `<N>` is the number of commits emitted by Step 5 (1 in `--single-commit` mode, ≥1 in group mode).
Non-fast-forward → STOP. Print: *"Remote advanced again during sync. Re-run `/vault.sync` to fetch and rebase the new commits. Your <N> local commit(s) from this run remain on the local branch."* (This race is rare but real when `vault.monitor-git-sync` is not running.) The user's committed work is durable — only the push failed.

## Composition with `vault.monitor-git-sync`

The watcher handles the **trivial** case (remote advanced cleanly → local fast-forwards in the background, no user intervention). This skill handles the **non-trivial** case (local has uncommitted work + needs to ship). They never conflict — both call `git pull --rebase`, both refuse to auto-resolve, both rely on the same upstream tracking.

If the user has the watcher armed, `vault.sync` may find the local branch already up-to-date with origin → step 3 is a no-op, sync proceeds straight to commit + push. That's expected.

## Output contract

A single multi-line block, no preamble. When Step 5 emits multiple commits, the `commit` row expands into one indented sub-row per commit so the user sees the exact subject lines that landed in history:

```
vault.sync — <branch> → <remote>

  validate    ✅ 42 docs · 0 errors
  stash       ⚪ clean tree, skipped
  pull        ✅ already up-to-date
  restore     ⚪ no stash
  commit      ✅ 3 commits
                · vault(notes): add 2 journals
                · vault(notes): set 4 tasks to in_progress
                · vault(archive): remove stale-meeting-2024-q1
  push        ✅ 3 commits pushed to origin/main

Done.
```

`--single-commit` mode collapses the commit block back to one line:

```
  commit      ✅ vault: sync 6 docs · 2026-05-19 09:00 UTC
  push        ✅ 1 commit pushed to origin/main
```

Or a failure block at the first failing step, with the suggested next action. If Step 5 fails partway, the row shows which group failed and how many committed before it (those earlier commits stay; recovery is the user's call). No retry loop, no automatic resolution. The user is the conflict resolver.
