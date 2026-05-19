# Skill Suite v0.8.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `claude-code-vault-keeper` v0.8.0 — commit 4 uncommitted skill drafts (vault.{setup,health,fix,sync}), author a new `/vault.new` skill that scaffolds docs from templates, surface the skill catalog in README + getting-started, and release.

**Architecture:** No new JS modules. No new CLI subcommands. The 4 existing draft skills are committed after verification against the v0.7.0 public API. The new `/vault.new` skill is pure agent instructions that invoke the public API (`loadTemplateRules`) via `node -e` from the skill body. A new skill-lint test (`tests/skills-lint.test.js`) guards skill frontmatter shape and cross-references. Release bumps to v0.8.0 in `package.json` + `.claude-plugin/plugin.json` + `CHANGELOG.md`.

**Tech Stack:** Node ≥ 18, bun (test runner), gray-matter (frontmatter parsing in lint test), existing public API (`loadTemplateRules`, `formatVaultDocument`).

**Spec:** `docs/superpowers/specs/2026-05-19-skill-suite-v0.8.0-design.md` (commit `c41f68a`).

---

## File Structure

### Files to create

- `skills/vault.new/SKILL.md` — new skill scaffolding docs from templates
- `skills/README.md` — catalog index page listing all six skills
- `tests/skills-lint.test.js` — frontmatter + cross-reference lint over `skills/*/SKILL.md`

### Files to modify

- `skills/vault.fix/SKILL.md` — verify + commit (no expected edits; verify pass)
- `skills/vault.health/SKILL.md` — verify + commit (expect: confirm JSON shape parsing aligns with `results[].errors[].{field,message,fix}`)
- `skills/vault.setup/SKILL.md` — verify + commit (confirm `vault-keeper init <dir> [--force]` flag set; confirm example templates exist at `examples/example/templates/`)
- `skills/vault.sync/SKILL.md` — verify + commit
- `README.md` — add "Claude Code skills" subsection under "What's in the box"
- `docs/getting-started.md` — add post-install paragraph mentioning `/vault.health`, `/vault.new`
- `CHANGELOG.md` — `[0.8.0]` entry
- `package.json` — version `0.7.0` → `0.8.0`
- `.claude-plugin/plugin.json` — version `0.7.0` → `0.8.0`

### Files NOT touched (deliberate)

- `lib/*`, `cli/*`, `server/*` — no new logic; plugin stays vault-agnostic.
- `.claude-plugin/marketplace.json` — only touched if its description currently says "LSP + CLI"; verify in Task 5.3.

---

## Phase 1 — Verify uncommitted skill drafts against current code

The 4 draft skills make claims about CLI/API behavior. Run each claim against v0.7.0; edit skill text if drift. Outcome: 4 verified-and-committed skills.

### Task 1.1: Capture canonical CLI/API outputs

**Files:** None (read-only capture)

- [ ] **Step 1: Capture doctor JSON shape**

Run:
```bash
node cli/main.js doctor --json | python3 -m json.tool > /tmp/vk-doctor.json
```

Expected (abridged):
```json
{
  "checks": [
    {"name": "Node ≥ 18", "status": "ok", "detail": "v24.15.0"},
    {"name": "claude-code-vault-keeper", "status": "ok", "detail": "v0.7.0 @ ..."},
    {"name": "LSP bundle (server/main.bundled.cjs)", "status": "ok", "detail": "1515 KB"},
    {"name": "bun runtime", "status": "ok", "detail": "v1.3.11"},
    {"name": "claude CLI", "status": "ok", "detail": "..."},
    {"name": "vault config (.claude/vault-keeper.json)", "status": "info", "detail": "..."}
  ]
}
```

Top-level keys: `checks` (array). Per-check fields: `name`, `status` (`ok` | `info` | likely `warn`/`error` on failure), `detail`.

- [ ] **Step 2: Capture validate JSON shape**

Run:
```bash
node cli/validate-documents.js --root examples/example --json > /tmp/vk-validate.json
```

Expected top-level: `{summary, results}`.
- `summary`: `{total, skipped, valid, invalid, errorCount, warningCount, byDocType, byFolder}`
- `results[]`: `{filepath, docType, valid, errors[], warnings[], rulesSource, frontmatter}`
- Each error: `{level, field, message, fix}`

- [ ] **Step 3: Capture public API export list**

Run:
```bash
node -e "import('./lib/index.js').then(m => console.log(Object.keys(m).sort().join('\n')))"
```

Expected to include: `loadTemplateRules`, `formatVaultDocument`, `formatVaultDocumentAsync`, `validateDocument`, `validateBuffer`, `parseDocument`, `parseBody`, `findDocuments`, `resolveProjectRoot`, `loadVaultConfig`, `VERSION`.

- [ ] **Step 4: Confirm CLI subcommand set**

Run:
```bash
node cli/main.js --help
```

Confirm subcommands: `validate`, `doctor`, `install-claude-code-plugin`, `init`, `help`.

- [ ] **Step 5: Confirm `init` flag set**

Run:
```bash
node cli/main.js help init
```

Expected: `vault-keeper init [dir]` with `--force` flag mention.

### Task 1.2: Verify `skills/vault.health/SKILL.md`

**Files:** Modify `skills/vault.health/SKILL.md` if drift found.

- [ ] **Step 1: Read the skill body and list every CLI/API claim**

Claims to verify:
1. `vault-keeper doctor --json` produces structured output → matches Task 1.1 step 1 ✓
2. `vault-keeper validate --json --root "${CLAUDE_PROJECT_DIR:-$PWD}"` produces a report → matches Task 1.1 step 2 ✓
3. Skill claims to group by "template", "folder", "rule kind". JSON has `byDocType` (template) and `byFolder` (folder). "Rule kind" is NOT a direct field — must be derived from `errors[].message` first phrase or `errors[].field`.

- [ ] **Step 2: Edit skill if "rule kind" grouping needs explicit derivation note**

If the current skill body assumes "rule kind" is a direct field, add a sentence: *"Rule kind is not a JSON field — derive it from `errors[].field` (most common) or the leading phrase of `errors[].message`."* If the skill already says this, no edit.

- [ ] **Step 3: Confirm referenced JSON paths exist**

Walk every dotted JSON path in the skill body (e.g. `results[].errors[].field`). Each must resolve in `/tmp/vk-validate.json`.

```bash
python3 -c "import json; d=json.load(open('/tmp/vk-validate.json')); \
  print('errors[0].field:', d['results'][0]['errors'][0]['field'] if d['results'][0]['errors'] else 'no errors in first doc'); \
  print('summary keys:', sorted(d['summary'].keys()))"
```

- [ ] **Step 4: Commit if edited**

```bash
git add skills/vault.health/SKILL.md
git commit -m "fix(skills): align vault.health JSON paths with v0.7.0 validate output"
```

If no edits were needed, defer commit to Task 1.6.

### Task 1.3: Verify `skills/vault.fix/SKILL.md`

**Files:** Modify `skills/vault.fix/SKILL.md` if drift found.

- [ ] **Step 1: Verify formatter import**

The skill body shows:
```js
import { formatVaultDocument } from 'claude-code-vault-keeper/formatter';
```

Run:
```bash
node -e "import('claude-code-vault-keeper/formatter').then(m => console.log(typeof m.formatVaultDocument))"
```

Expected: `function`. If `undefined`, the subpath export is broken — edit skill to use the barrel: `import { formatVaultDocument } from 'claude-code-vault-keeper'`.

- [ ] **Step 2: Verify `formatVaultDocumentAsync` parity**

The skill's CHANGELOG-noted concern from v0.7.0: `formatVaultDocumentAsync` takes `{ projectRoot }` and reads `template:` from doc frontmatter. Confirm:

```bash
node -e "import('claude-code-vault-keeper').then(m => console.log(m.formatVaultDocumentAsync.length))"
```

Expected: `2` (doc string + options object). If skill body shows a different signature, edit it.

- [ ] **Step 3: Test idempotency claim**

Pick one document from `examples/example`, format twice via node, diff:

```bash
node -e "
import('claude-code-vault-keeper').then(async ({formatVaultDocumentAsync}) => {
  const fs = await import('fs');
  const path = 'examples/example/docs/notes/note-001-hello.md';
  const original = fs.readFileSync(path, 'utf8');
  const once = await formatVaultDocumentAsync(original, { projectRoot: 'examples/example' });
  const twice = await formatVaultDocumentAsync(once, { projectRoot: 'examples/example' });
  console.log('idempotent:', once === twice);
});
"
```

Expected: `idempotent: true`. If false, this is a formatter bug — file an issue and proceed (skill's claim is currently aspirational).

- [ ] **Step 4: Commit if edited**

```bash
git add skills/vault.fix/SKILL.md
git commit -m "fix(skills): align vault.fix formatter API with v0.7.0 public surface"
```

### Task 1.4: Verify `skills/vault.setup/SKILL.md`

**Files:** Modify `skills/vault.setup/SKILL.md` if drift found.

- [ ] **Step 1: Verify `vault-keeper init` flag set**

Skill claims `vault-keeper init <vault-root> [--force]`. Confirm:

```bash
node cli/main.js help init
```

Expected output includes `--force`. If not, edit skill.

- [ ] **Step 2: Verify referenced example templates exist**

Skill body references `examples/example/templates/<type>-template.md` as "canonical reference". Confirm:

```bash
ls examples/example/templates/
```

Expected: `decision-template.md  note-template.md  prd-template.md  task-template.md`. If a referenced type doesn't exist, edit skill to use only the available types (note, task, prd, decision).

- [ ] **Step 3: Smoke-test `init` round trip in a tmpdir**

```bash
TMPDIR=$(mktemp -d) && node cli/main.js init "$TMPDIR/v" && \
  node cli/main.js validate --root "$TMPDIR/v" && rm -rf "$TMPDIR"
```

Expected: init creates files, validate exits 0. If anything fails, skill's flow is broken.

- [ ] **Step 4: Commit if edited**

```bash
git add skills/vault.setup/SKILL.md
git commit -m "fix(skills): align vault.setup with v0.7.0 init flag set"
```

### Task 1.5: Verify `skills/vault.sync/SKILL.md`

**Files:** Modify `skills/vault.sync/SKILL.md` if drift found.

- [ ] **Step 1: Confirm validate exit-code contract**

The skill gates the rest of its pipeline on `vault-keeper validate` exit 0. Confirm exit codes:

```bash
node cli/main.js validate --root examples/example; echo "exit=$?"
```

Expected: `exit=1` (the example vault has 15 invalid docs). Then on a clean vault:

```bash
TMPDIR=$(mktemp -d) && node cli/main.js init "$TMPDIR/v" && \
  node cli/main.js validate --root "$TMPDIR/v"; echo "exit=$?"; rm -rf "$TMPDIR"
```

Expected: `exit=0`. The skill's gating logic is sound.

- [ ] **Step 2: Verify `vaultFolders` config field exists**

Skill reads `vaultFolders` from `.claude/vault-keeper.json` to determine which folders to commit. Confirm key name:

```bash
cat examples/example/.claude/vault-keeper.json 2>/dev/null || \
  grep -r "vaultFolders" lib/vault-config.js | head -3
```

Expected: `vaultFolders` appears as a config key in `lib/vault-config.js`. Skill is correct.

- [ ] **Step 3: Commit if edited**

```bash
git add skills/vault.sync/SKILL.md
git commit -m "fix(skills): align vault.sync with v0.7.0 validate exit-code contract"
```

### Task 1.6: Commit verified drafts (single combined commit if no edits)

**Files:** All four `skills/vault.*/SKILL.md` drafts.

- [ ] **Step 1: Check git status**

```bash
git status --short skills/
```

Expected: any `??` (untracked) skills should be `vault.fix`, `vault.health`, `vault.setup`, `vault.sync`. The committed `vault.monitor-git-sync` should NOT appear.

- [ ] **Step 2: Stage all four skills**

```bash
git add skills/vault.fix/SKILL.md skills/vault.health/SKILL.md skills/vault.setup/SKILL.md skills/vault.sync/SKILL.md
```

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(skills): ship 4 Claude Code skills — setup, health, fix, sync

Verified against v0.7.0 public API and CLI surface. Skills are pure
agent instructions; no JS changes. Plugin stays vault-agnostic.

- /vault.setup interviews vault shape, scaffolds via `vault-keeper init`
- /vault.health digests `doctor --json` + `validate --json` reports
- /vault.fix applies `formatVaultDocument` deterministically, re-validates
- /vault.sync gates push on validate, manages stash/rebase/commit pipeline

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

If individual fix commits were already made in Tasks 1.2–1.5 for skills that needed edits, only commit the remaining unmodified drafts here.

---

## Phase 2 — Skill-lint test (TDD)

A net-new test that guards skill frontmatter shape and cross-references. Write the test FIRST so cross-reference drift is caught immediately.

### Task 2.1: Write the failing test

**Files:** Create `tests/skills-lint.test.js`

- [ ] **Step 1: Write the test file**

Create `tests/skills-lint.test.js`:

```js
import { describe, test, expect } from 'bun:test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', 'skills');

function listSkillDirs() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function readSkill(name) {
  const skillPath = join(SKILLS_DIR, name, 'SKILL.md');
  if (!existsSync(skillPath)) return null;
  return { path: skillPath, raw: readFileSync(skillPath, 'utf8') };
}

describe('skills-lint', () => {
  const skillNames = listSkillDirs();

  test('at least the 6 v0.8.0 skills are present', () => {
    const required = ['vault.setup', 'vault.new', 'vault.health', 'vault.fix', 'vault.sync', 'vault.monitor-git-sync'];
    for (const name of required) {
      expect(skillNames).toContain(name);
    }
  });

  for (const name of skillNames) {
    describe(`skills/${name}`, () => {
      const skill = readSkill(name);

      test('SKILL.md exists', () => {
        expect(skill).not.toBeNull();
      });

      test('frontmatter has name + description', () => {
        const { data } = matter(skill.raw);
        expect(data.name).toBe(name);
        expect(typeof data.description).toBe('string');
        expect(data.description.length).toBeGreaterThan(20);
      });

      test('cross-references resolve to actual skill dirs', () => {
        const body = matter(skill.raw).content;
        const refs = [...body.matchAll(/\/vault\.[a-z][a-z0-9.-]*/g)].map(m => m[0].slice(1));
        for (const ref of refs) {
          // strip arg placeholders like /vault.new <type>
          const refName = ref.split(/[\s<`]/)[0];
          if (refName === name) continue; // self-reference
          expect(skillNames).toContain(refName);
        }
      });
    });
  }
});
```

- [ ] **Step 2: Run the test, expect failures**

```bash
bun test tests/skills-lint.test.js
```

Expected: at least one failure on the "at least the 6 v0.8.0 skills are present" assertion because `vault.new` does not yet exist. Other tests may pass for already-present skills.

If `gray-matter` is not installed:
```bash
ls node_modules/gray-matter/package.json
```
The project already depends on `gray-matter` (see `package.json:96`) — no install needed.

### Task 2.2: Commit the failing test

**Files:** `tests/skills-lint.test.js`

- [ ] **Step 1: Stage and commit**

```bash
git add tests/skills-lint.test.js
git commit -m "test(skills): add skill-lint guard for frontmatter + cross-refs"
```

The test is intentionally failing at this point — Phase 3 makes it pass by adding `vault.new`.

---

## Phase 3 — Author `/vault.new`

The only net-new skill. Pure agent instructions that read `validation_rules` via public API and scaffold a doc.

### Task 3.1: Create `skills/vault.new/SKILL.md`

**Files:** Create `skills/vault.new/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `skills/vault.new/SKILL.md`:

```markdown
---
name: vault.new
description: "Scaffold a new vault document from a template — read the template's `validation_rules` via the public API (`loadTemplateRules`), generate frontmatter placeholders for every `required_field`, derive the target path from the template's `path_regex`, write the file, then validate it. Generic across vault shapes; reads everything from the template at runtime. Use when the user says 'new task', 'new doc', 'tạo doc mới', 'scaffold doc', 'thêm task', 'create from template', '/vault.new <type> [slug]'."
---

# vault.new — scaffold a doc from a template

This skill creates a new document conforming to a template's `validation_rules`. It reads the template at runtime via the public API — no field name, no path prefix, no status value is hardcoded.

## Inputs

The user invokes `/vault.new <type> [slug]`. Examples:
- `/vault.new task fix-login`
- `/vault.new prd checkout-redesign`
- `/vault.new note` (slug derived from current date)

## Pre-flight (silent unless blocked)

1. Resolve project root: `${CLAUDE_PROJECT_DIR:-$PWD}`.
2. Resolve template path: `templates/<type>-template.md`. If absent, list `ls templates/` and abort with: *"Template `templates/<type>-template.md` not found. Available: <list>."*

## Step 1 — load template rules via public API

Use `Bash` to invoke the public API:

```bash
node -e "
import('claude-code-vault-keeper').then(async ({ loadTemplateRules }) => {
  const rules = await loadTemplateRules('templates/<type>-template.md');
  console.log(JSON.stringify(rules));
});
"
```

Parse the JSON. Extract:
- `required_fields` — array of field names
- `optional_fields` — array
- `field_rules` — array of per-field constraints (`field`, `values`/`regex`/`type`/`min`)
- `path_regex` — the path pattern the new doc must match
- `state_machine` — keys are valid `status` values (used to pick a starting state)

## Step 2 — derive the target file path

Parse `path_regex` to find the literal prefix (everything before the first regex meta character `\d`, `[`, `(`, `*`, `+`, `?`). Example: `^docs/tasks/t-\\d{3}-[a-z0-9-]+\\.md$` → literal prefix `docs/tasks/t-`, numeric pattern `\d{3}`, slug placeholder.

Algorithm:
1. Extract literal prefix.
2. If regex has a numeric segment (`\d{N}`), `ls <prefix-dir>/` and find max existing `<prefix><number>-*` → increment. Pad to N digits.
3. Append `<slug>.md` (or current date if no slug provided).
4. If the derived path already exists, abort with: *"Target `<path>` already exists. Pick a different slug."*

If `path_regex` is missing or has no literal prefix, ask the user via `AskUserQuestion` for the target path.

## Step 3 — generate frontmatter placeholders

For each field in `required_fields`, pick a value:

| Field shape | Placeholder |
|---|---|
| `template` (always required) | `templates/<type>-template.md` |
| `field_rules` with `values: [...]` | first value in the list |
| `field_rules` with `type: integer, min: M` | `M` |
| `field_rules` with `regex: ...` | `'@TODO'` (literal placeholder for the user to fill in) |
| `field` matching `created` / `updated` / `*_date` | today in `YYYY-MM-DD` |
| `field` matching `owner` | `'@TODO'` |
| `title` | slug humanized (replace hyphens with spaces, title-case) |
| anything else | `'@TODO'` |

Order keys priority-first: `template`, `title`, `status`, `phase`, `owner`, `created`, `updated`, then the rest alphabetically. Match the canonical formatter's expected order.

## Step 4 — write the file

Use the `Write` tool. The body section can include just the H2 headings the template declares under `required_body_sections` (read those from the same `loadTemplateRules` call). Leave each section empty for the user to fill.

## Step 5 — validate

Run:

```bash
node cli/main.js validate --path <newfile> --root "${CLAUDE_PROJECT_DIR:-$PWD}"
```

(Use `vault-keeper validate ...` if on PATH; otherwise the local node invocation above.)

If exit 0 → success.
If exit 1 → the validator's report tells the user exactly which placeholders to replace. Surface the diagnostic verbatim plus: *"Edit `<newfile>` to replace the `'@TODO'` placeholders, then re-validate."*

## Output contract

```
vault.new — created <type> document

  path:      <newfile>
  template:  templates/<type>-template.md
  validate:  ✅ green (or: ⚠️ N placeholders to fill)

Next: edit the file, replace placeholders, then `/vault.health` or `/vault.fix` as needed.
```

## Refusal contract

Refuse if:
- Template does not exist.
- Template's `validation_rules` is missing or unparseable.
- Target path already exists (do not clobber).
- `path_regex` has no derivable literal prefix and the user declines to provide a path.

## Composition

- Pairs with `/vault.setup` — setup creates templates, new creates docs from them.
- Pairs with `/vault.fix` — fix can canonicalize the new doc after manual edits.
- Pairs with `/vault.health` — health verifies the whole vault after multiple new docs.
- Does NOT auto-commit. Commit is the user's call (or `/vault.sync`).
```

- [ ] **Step 2: Run the skill-lint test, expect pass**

```bash
bun test tests/skills-lint.test.js
```

Expected: all assertions pass. The "at least the 6 v0.8.0 skills are present" assertion now passes because `vault.new` exists. Frontmatter has `name: vault.new` matching the directory. Cross-references (`/vault.setup`, `/vault.fix`, `/vault.health`, `/vault.sync`) all resolve.

### Task 3.2: Manual smoke test of `vault.new` workflow

**Files:** None (read-only test in a tmpdir)

- [ ] **Step 1: Set up a scratch vault**

```bash
TMPDIR=$(mktemp -d) && node cli/main.js init "$TMPDIR/v" && cd "$TMPDIR/v"
```

- [ ] **Step 2: Run the public-API call the skill uses**

```bash
node -e "
import('claude-code-vault-keeper').then(async ({ loadTemplateRules }) => {
  const r = await loadTemplateRules('templates/note-template.md');
  console.log(JSON.stringify(r, null, 2));
});
"
```

Expected: a JSON object with at least `required_fields`, `field_rules`, `path_regex`. If `loadTemplateRules` returns `undefined` for a missing key, the skill's algorithm needs a default — note this for later refinement.

- [ ] **Step 3: Manually scaffold a new doc following the skill's algorithm**

Read `required_fields`, generate placeholders, write a new file under `notes/`, then:

```bash
node /Users/firegroup/projects/claude-code-vault-keeper/cli/main.js validate --root "$TMPDIR/v"
```

Expected: exit 0 (new doc is conformant) OR exit 1 with errors only on `'@TODO'` placeholders that fail regex/enum checks. Either is acceptable — the skill surfaces those to the user.

- [ ] **Step 4: Tear down**

```bash
cd - && rm -rf "$TMPDIR"
```

### Task 3.3: Commit `/vault.new` skill

**Files:** `skills/vault.new/SKILL.md`

- [ ] **Step 1: Stage and commit**

```bash
git add skills/vault.new/SKILL.md
git commit -m "$(cat <<'EOF'
feat(skills): add /vault.new for scaffolding docs from templates

Reads validation_rules via loadTemplateRules at runtime; no hardcoded
field, path, or status. Derives target path from template's path_regex
literal prefix and an auto-incremented counter when the regex declares
one. Generates frontmatter placeholders keyed by field shape (enum →
first value; integer min → min; regex → '@TODO'; date → today).
Validates the new doc and reports placeholders the user must fill.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Discoverability surfaces

Make the skill suite visible from the main entry points (README, getting-started, a skills catalog).

### Task 4.1: Create `skills/README.md` catalog

**Files:** Create `skills/README.md`

- [ ] **Step 1: Write the catalog**

Create `skills/README.md`:

```markdown
# Claude Code skills

`claude-code-vault-keeper` ships six Claude Code skills. Each is a verb the user types in a Claude session; together they cover the full vault lifecycle without leaving the editor.

## The skills

| Verb | What it does |
|---|---|
| [`/vault.setup`](vault.setup/SKILL.md) | Interview-driven vault onboarding. Scaffolds `.claude/vault-keeper.json` + per-type templates, then validates. |
| [`/vault.new <type> [slug]`](vault.new/SKILL.md) | Scaffolds a new doc from `templates/<type>-template.md` with frontmatter placeholders derived from `validation_rules`. |
| [`/vault.health`](vault.health/SKILL.md) | Read-only digest of `vault-keeper doctor --json` + `vault-keeper validate --json`. Groups violations by template, folder, rule kind. |
| [`/vault.fix`](vault.fix/SKILL.md) | Deterministic auto-format: frontmatter key order, section order, AC/relationship normalization, whitespace. Never invents values. |
| [`/vault.sync`](vault.sync/SKILL.md) | Validate-then-push: refuses to push if validate fails; otherwise stash → pull --rebase → restore → commit → push. |
| [`/vault.monitor-git-sync`](vault.monitor-git-sync/SKILL.md) | Passive background watcher; auto-fast-forwards `origin/<branch>` into local, notifies only on conflict. |

## Composition

```
/vault.setup ─→ create vault                      (once per repo)
/vault.new   ─→ create individual doc             (daily)
/vault.health → check what's broken               (daily)
/vault.fix   ─→ apply deterministic auto-fixes    (daily)
/vault.sync  ─→ commit + push                     (daily)
/vault.monitor-git-sync → keep main in sync       (always-on watcher)
```

## Plugin invariants

Per the project's [authoring principle](../CLAUDE.md), every skill is **vault-agnostic** — no skill hardcodes a field name, template name, or path prefix. All vault-specific logic comes from the `validation_rules` block of a template, read at runtime.

## See also

- [Templates](../docs/templates/README.md) — the rule vocabulary the skills enforce.
- [Programmatic usage](../docs/programmatic-usage.md) — the public API the skills invoke under the hood.
```

- [ ] **Step 2: Verify markdown renders correctly (optional)**

```bash
head -30 skills/README.md
```

Just visually confirm structure. No tooling required.

### Task 4.2: Update root `README.md`

**Files:** Modify `README.md`

- [ ] **Step 1: Locate the "What's in the box" section**

Open `README.md` and find the section starting with `## What's in the box` (around line 195).

- [ ] **Step 2: Add the skills bullet**

Insert this bullet at the end of the `What's in the box` list (after the "No domain knowledge" bullet):

```markdown
- **Six Claude Code skills** — verbs you type in a Claude session:
  `/vault.setup` (onboarding), `/vault.new <type>` (scaffold doc),
  `/vault.health` (read-only report), `/vault.fix` (auto-format),
  `/vault.sync` (validate-then-push), `/vault.monitor-git-sync`
  (passive watcher). See [`skills/README.md`](skills/README.md).
```

Use the Edit tool with `old_string` anchored to the "No domain knowledge" bullet for uniqueness:

```
old_string: "- **No domain knowledge.** Every rule comes from a template you wrote. Drop\n  `vault-keeper` into any markdown folder and it adapts."

new_string: "- **No domain knowledge.** Every rule comes from a template you wrote. Drop\n  `vault-keeper` into any markdown folder and it adapts.\n- **Six Claude Code skills** — verbs you type in a Claude session:\n  `/vault.setup` (onboarding), `/vault.new <type>` (scaffold doc),\n  `/vault.health` (read-only report), `/vault.fix` (auto-format),\n  `/vault.sync` (validate-then-push), `/vault.monitor-git-sync`\n  (passive watcher). See [`skills/README.md`](skills/README.md)."
```

### Task 4.3: Update `docs/getting-started.md`

**Files:** Modify `docs/getting-started.md`

- [ ] **Step 1: Locate the Claude Code plugin install section**

Open `docs/getting-started.md` and find the section starting around line 99 (`### install-claude-code-plugin`).

- [ ] **Step 2: Add a "next steps after install" paragraph**

After the existing install instructions for the plugin, add:

```markdown
### Post-install — skills you can now type

Once the plugin is installed, six verbs become typeable in any Claude session:

- `/vault.setup` — interview your repo into a configured vault.
- `/vault.new task my-first-task` — scaffold a new doc from a template.
- `/vault.health` — read-only digest of doctor + validate.
- `/vault.fix` — apply deterministic auto-formatting.
- `/vault.sync` — validate, then commit + push.
- `/vault.monitor-git-sync` — arm a passive background watcher.

Full catalog under [`skills/`](../skills/README.md).
```

Insert between the existing `install-claude-code-plugin` walkthrough block and the `Build a real vault from scratch` section.

### Task 4.4: Commit discoverability changes

**Files:** `skills/README.md`, `README.md`, `docs/getting-started.md`

- [ ] **Step 1: Stage and commit**

```bash
git add skills/README.md README.md docs/getting-started.md
git commit -m "docs: surface the 6-skill catalog in README + getting-started"
```

---

## Phase 5 — Release v0.8.0

Bump versions, write CHANGELOG, run the full test suite, commit.

### Task 5.1: Bump `package.json` version

**Files:** Modify `package.json`

- [ ] **Step 1: Edit version**

Use Edit tool:

```
old_string: "  \"version\": \"0.7.0\","
new_string: "  \"version\": \"0.8.0\","
```

- [ ] **Step 2: Verify**

```bash
node -p "require('./package.json').version"
```

Expected: `0.8.0`.

### Task 5.2: Bump `.claude-plugin/plugin.json` version

**Files:** Modify `.claude-plugin/plugin.json`

- [ ] **Step 1: Edit version**

Use Edit tool:

```
old_string: "  \"version\": \"0.7.0\","
new_string: "  \"version\": \"0.8.0\","
```

- [ ] **Step 2: Verify**

```bash
node -p "require('./.claude-plugin/plugin.json').version"
```

Expected: `0.8.0`.

### Task 5.3: Check `marketplace.json` description

**Files:** Read (and optionally modify) `.claude-plugin/marketplace.json`

- [ ] **Step 1: Inspect**

```bash
cat .claude-plugin/marketplace.json
```

If the description mentions "LSP + CLI" or similar without skills, edit it to mention skills too. Otherwise leave it.

- [ ] **Step 2: Edit (only if needed)**

If a description like `"description": "LSP + CLI for ..."` exists, update to:
`"description": "LSP + CLI + Claude Code skills for ..."`.

### Task 5.4: Write `CHANGELOG.md` entry

**Files:** Modify `CHANGELOG.md`

- [ ] **Step 1: Insert the v0.8.0 entry above the v0.7.0 entry**

Use Edit tool to insert a new section. Anchor on `## [0.7.0]` for uniqueness:

```
old_string: "## [0.7.0] — 2026-05-19"
new_string: "## [0.8.0] — 2026-05-19\n\nShips the **Claude Code skill suite** that turns the plugin from \"LSP + CLI\" into six verbs the user types inside a Claude session. All skills are vault-agnostic — they read `validation_rules` from templates at runtime via the v0.7.0 public API, hardcode nothing.\n\n### Added\n\n- **Five Claude Code skills committed for the first time:**\n  - `/vault.setup` — interview-driven onboarding; scaffolds via `vault-keeper init`, then extends templates per the user's answers.\n  - `/vault.new <type> [slug]` — scaffolds a new document from `templates/<type>-template.md`. Reads `required_fields`, `field_rules`, `path_regex` via `loadTemplateRules`; generates frontmatter placeholders per field shape; derives the target path from the regex's literal prefix; validates after write.\n  - `/vault.health` — digests `vault-keeper doctor --json` + `vault-keeper validate --json` into a report grouped by template, folder, and rule kind.\n  - `/vault.fix` — applies `formatVaultDocument` deterministically (frontmatter key order, body section order, AC/relationship normalization, whitespace), re-validates, reports residuals that need human judgment.\n  - `/vault.sync` — validate-then-push pipeline; refuses to push if validate fails; manages stash, rebase, restore, commit, push as a single gated chain.\n- **`skills/README.md`** — catalog index for the six skills (`vault.monitor-git-sync` was already shipped).\n- **`tests/skills-lint.test.js`** — guards skill frontmatter shape and cross-references between skills. Asserts the six v0.8.0 skills are present, each has a valid `name:` + `description:` frontmatter, and every `/vault.<x>` cross-reference resolves to an actual skill directory.\n\n### Changed\n\n- `README.md` — `What's in the box` mentions the six-skill catalog.\n- `docs/getting-started.md` — post-install section lists the six verbs the user can type after `claude plugin install`.\n\n### Compatibility\n\n- No JS source changes. Public API surface from v0.7.0 is unchanged. CLI surface from v0.6.0 is unchanged. Existing scripts continue to work.\n- Skills are auto-discovered by Claude Code from the `skills/` directory; no plugin manifest changes were required.\n\n## [0.7.0] — 2026-05-19"
```

### Task 5.5: Run the full test suite

**Files:** None (validation)

- [ ] **Step 1: Run tests**

```bash
bun test ./tests 2>&1 | tail -20
```

Expected: all tests pass, including the new `skills-lint.test.js`. If any test fails:
- If `skills-lint.test.js` fails: a cross-reference in a skill is broken; fix the skill, re-run.
- If any existing test fails: the version bump did not break behavior; investigate before committing.

- [ ] **Step 2: Run the smoke scripts**

```bash
npm run smoke 2>&1 | tail -10
```

Expected: LSP smoke + example smoke both green.

### Task 5.6: Commit the release

**Files:** `package.json`, `.claude-plugin/plugin.json`, `CHANGELOG.md`, optionally `.claude-plugin/marketplace.json`

- [ ] **Step 1: Stage and commit**

```bash
git add package.json .claude-plugin/plugin.json CHANGELOG.md
# include marketplace.json only if Task 5.3 edited it
if ! git diff --cached --quiet .claude-plugin/marketplace.json 2>/dev/null; then
  git add .claude-plugin/marketplace.json
fi
git commit -m "$(cat <<'EOF'
chore(release): v0.8.0 — ship Claude Code skill suite

Bumps package.json and plugin.json to 0.8.0. CHANGELOG documents the
six skills (five committed for the first time, plus the previously
shipped vault.monitor-git-sync) and the skills-lint test.

No JS source changes. Public API and CLI surface unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Surface tagging instructions to the user**

The plan does NOT auto-push or auto-tag. Print this for the user to run when ready:

```
The release commit is staged on `main`. To publish:

    git push origin main
    git tag v0.8.0
    git push origin v0.8.0

The existing GitHub Actions workflow (`.github/workflows/`) will then
auto-publish to npm under the OIDC-signed Trusted Publisher path.
```

---

## Self-Review

### Spec coverage check

| Spec section | Covered by |
|---|---|
| Final skill catalog (6 skills) | Tasks 1.2–1.5 (verify 4), Task 3.1 (vault.new), already-shipped vault.monitor-git-sync |
| Architecture invariants (vault-agnostic) | Reaffirmed in Task 3.1 skill body; tested by skills-lint not directly but cross-ref test enforces shape |
| vault.new algorithm | Task 3.1 step 1 (full skill body matches spec algorithm 1-7) |
| Work breakdown — 5 batches | Phase 1 = batch 1, Phase 3 = batch 2, Phase 4 = batch 3, cross-reference sanity rolled into Task 2.1 lint test, Phase 5 = batch 5 |
| Test strategy — skills-lint | Task 2.1 |
| Release sequencing | Phase 5 final task |
| Out-of-scope items | Not implemented — correct |

### Placeholder scan

Searched for "TBD", "TODO" outside of `'@TODO'` literal placeholder strings (which are intentional content the skill emits to scaffolded documents). No plan-level placeholders found.

### Type consistency

- `loadTemplateRules` used in Task 3.1 skill body and Task 3.2 smoke test — same name ✓
- `formatVaultDocument` / `formatVaultDocumentAsync` distinguished correctly in Task 1.3 ✓
- `vault-keeper init <dir> [--force]` flag set consistent across Task 1.4 and skill body ✓
- Skill directory names (`vault.setup`, `vault.new`, etc.) match skill frontmatter `name:` field per skills-lint test ✓

No issues. Plan is ready.
