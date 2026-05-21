/**
 * init-presets.js — Opinionated vault scaffolds for common PKM workflows.
 *
 * Each preset produces a set of files (vault-keeper.json, templates, sample
 * docs) that demonstrate best-practice usage of the composable field schema.
 * The sample document in every preset is intentionally valid so users see a
 * green baseline before adding their own constraints.
 *
 * Exported surface:
 *   PRESETS     — Map<presetId, PresetSpec>
 *   scaffoldPreset(presetId, targetDir) — write preset files to disk
 *   listPresets() — string[] of known preset ids
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ── Preset definitions ────────────────────────────────────────────────────────

export const PRESETS = {
  // ── Obsidian ───────────────────────────────────────────────────────────────
  obsidian: {
    name: 'Obsidian',
    description: 'Free-form notes with tags, aliases, and Map-of-Content pattern',
    files: [
      {
        path: '.claude/vault-keeper.json',
        content: JSON.stringify(
          { vaultRoot: '.', vaultFolders: ['notes', 'mocs'] },
          null, 2,
        ) + '\n',
      },
      {
        path: 'templates/note-template.md',
        content: `---
template_path: templates/note-template.md
document_type: note
tier: KNOWLEDGE
fields:
  template:
    required: true
  document_type:
    required: true
  title:
    type: string
    required: true
    description: Human-readable title shown in graph view
  tags:
    type: array
    uniqueItems: true
  aliases:
    type: array
  status:
    type: string
    enum:
      - draft
      - evergreen
      - archived
  $path:
    pattern: '^notes/[a-z0-9-]+\\.md$'
---

# Note template

## Summary

\`\`\`yaml section-rules
required: true
\`\`\`

Write your note content here.

## References
`,
      },
      {
        path: 'templates/moc-template.md',
        content: `---
template_path: templates/moc-template.md
document_type: moc
tier: KNOWLEDGE
fields:
  template:
    required: true
  document_type:
    required: true
  title:
    type: string
    required: true
    description: Name of this Map of Content
  $path:
    pattern: '^mocs/[a-z0-9-]+\\.md$'
---

# MOC template

A Map of Content organises related notes by topic.

## Notes in this MOC

\`\`\`yaml section-rules
required: true
\`\`\`

Link to notes here.
`,
      },
      {
        path: 'notes/note-001-welcome.md',
        content: `---
template: templates/note-template.md
document_type: note
title: Welcome to your Obsidian vault
tags:
  - meta
  - getting-started
status: evergreen
---

# Welcome to your Obsidian vault

This note validates against \`templates/note-template.md\`.
Add your own notes to the \`notes/\` folder.

## Summary

Run \`vault-keeper validate\` to check your entire vault.
Use \`vault-keeper lint-templates\` to validate your templates.

## References
`,
      },
    ],
  },

  // ── Zettelkasten ───────────────────────────────────────────────────────────
  zettelkasten: {
    name: 'Zettelkasten',
    description: 'Atomic notes with permanent/fleeting split and unique IDs',
    files: [
      {
        path: '.claude/vault-keeper.json',
        content: JSON.stringify(
          { vaultRoot: '.', vaultFolders: ['permanent', 'fleeting'] },
          null, 2,
        ) + '\n',
      },
      {
        path: 'templates/permanent-template.md',
        content: `---
template_path: templates/permanent-template.md
document_type: permanent
tier: KNOWLEDGE
fields:
  template:
    required: true
  document_type:
    required: true
  title:
    type: string
    required: true
    description: One clear, complete thought
  id:
    type: string
    required: true
    description: Unique Zettel ID (e.g. 202405211430)
  tags:
    type: array
    uniqueItems: true
  $path:
    pattern: '^permanent/[a-z0-9-]+\\.md$'
---

# Permanent note template

Permanent notes capture a single, atomic idea in your own words.

## Idea

\`\`\`yaml section-rules
required: true
\`\`\`

State the core idea clearly.

## Connections
`,
      },
      {
        path: 'templates/fleeting-template.md',
        content: `---
template_path: templates/fleeting-template.md
document_type: fleeting
tier: KNOWLEDGE
fields:
  template:
    required: true
  document_type:
    required: true
  title:
    type: string
    required: true
  status:
    type: string
    required: true
    enum:
      - raw
      - processed
      - archived
  $path:
    pattern: '^fleeting/[a-z0-9-]+\\.md$'
---

# Fleeting note template

Fleeting notes are quick captures. Process them into permanent notes
or archive them within a few days.

## Capture

\`\`\`yaml section-rules
required: true
\`\`\`

Raw thought or reference here.
`,
      },
      {
        path: 'permanent/permanent-001-example.md',
        content: `---
template: templates/permanent-template.md
document_type: permanent
title: The purpose of Zettelkasten is thinking, not storing
id: "20240101000001"
tags:
  - zettelkasten
  - pkm
---

# The purpose of Zettelkasten is thinking, not storing

## Idea

A Zettelkasten is not a filing cabinet — it is a conversation partner.
Each note must earn its place by connecting to at least one other idea.
The act of linking forces you to articulate *why* the connection exists.

## Connections

- See [[permanent/permanent-001-example]] for more
`,
      },
      {
        path: 'fleeting/fleeting-001-example.md',
        content: `---
template: templates/fleeting-template.md
document_type: fleeting
title: Quick capture — process into permanent soon
status: raw
---

# Quick capture — process into permanent soon

## Capture

Raw thought captured here. Process this into a permanent note or archive it.
`,
      },
    ],
  },

  // ── ADR ────────────────────────────────────────────────────────────────────
  adr: {
    name: 'Architecture Decision Records',
    description: 'ADR log for software teams — status tracking + decider field',
    files: [
      {
        path: '.claude/vault-keeper.json',
        content: JSON.stringify(
          { vaultRoot: '.', vaultFolders: ['decisions'] },
          null, 2,
        ) + '\n',
      },
      {
        path: 'templates/adr-template.md',
        content: `---
template_path: templates/adr-template.md
document_type: adr
tier: ENGINEERING
fields:
  template:
    required: true
  document_type:
    required: true
  title:
    type: string
    required: true
    description: Short imperative phrase describing the decision
  status:
    type: string
    required: true
    enum:
      - proposed
      - accepted
      - deprecated
      - superseded
    state_machine:
      proposed:
        - accepted
        - deprecated
      accepted:
        - deprecated
        - superseded
      deprecated: []
      superseded: []
  deciders:
    type: array
    required: true
    description: People who made this decision
  date:
    type: date
    required: true
  $path:
    pattern: '^decisions/adr-\\d{3}-[a-z0-9-]+\\.md$'
---

# ADR template

## Context

\`\`\`yaml section-rules
required: true
\`\`\`

What is the issue that motivates this decision?

## Decision

\`\`\`yaml section-rules
required: true
\`\`\`

What is the change we're proposing?

## Consequences

\`\`\`yaml section-rules
required: true
\`\`\`

What becomes easier or harder after this decision?
`,
      },
      {
        path: 'decisions/adr-001-use-vault-keeper.md',
        content: `---
template: templates/adr-template.md
document_type: adr
title: Use vault-keeper to enforce ADR conventions
status: accepted
deciders:
  - '@alice'
  - '@bob'
date: 2024-01-01
---

# ADR-001: Use vault-keeper to enforce ADR conventions

## Context

Our ADR log has grown to 40+ records. Without tooling, authors
inconsistently name status values (\`Accepted\` vs \`accepted\` vs \`ACCEPTED\`),
miss required fields, and use irregular file naming.

## Decision

Adopt \`vault-keeper\` with an ADR template that enforces:
- Slug-based filename: \`adr-NNN-short-title.md\`
- Required fields: title, status, deciders, date
- Allowed status values via \`enum\`
- Valid transitions via \`state_machine\`

## Consequences

ADR authors get inline red squiggles for violations. CI fails on merge
if any ADR is non-conforming. The query \`status: accepted\` is now reliable.
`,
      },
    ],
  },

  // ── Book notes ─────────────────────────────────────────────────────────────
  'book-notes': {
    name: 'Book Notes',
    description: 'Book annotation vault with author, rating, reading status',
    files: [
      {
        path: '.claude/vault-keeper.json',
        content: JSON.stringify(
          { vaultRoot: '.', vaultFolders: ['books'] },
          null, 2,
        ) + '\n',
      },
      {
        path: 'templates/book-template.md',
        content: `---
template_path: templates/book-template.md
document_type: book
tier: KNOWLEDGE
fields:
  template:
    required: true
  document_type:
    required: true
  title:
    type: string
    required: true
    description: Book title
  author:
    type: string
    required: true
    description: Author name(s)
  status:
    type: string
    required: true
    enum:
      - want-to-read
      - reading
      - done
      - abandoned
  rating:
    type: integer
    min: 1
    max: 5
    description: Your rating out of 5 (only after finishing)
  year:
    type: integer
    description: Publication year
  tags:
    type: array
    uniqueItems: true
  $path:
    pattern: '^books/[a-z0-9-]+-[a-z0-9-]+\\.md$'
---

# Book template

## Summary

\`\`\`yaml section-rules
required: true
\`\`\`

One-paragraph summary of the book.

## Key Ideas

\`\`\`yaml section-rules
required: true
\`\`\`

The ideas that stuck.

## Quotes

Memorable quotes or passages.

## Notes
`,
      },
      {
        path: 'books/clear-atomic-habits.md',
        content: `---
template: templates/book-template.md
document_type: book
title: Atomic Habits
author: James Clear
status: done
rating: 5
year: 2018
tags:
  - habits
  - productivity
  - behaviour-change
---

# Atomic Habits — James Clear

## Summary

Tiny changes compound into remarkable results. The key is to focus on
systems (the process) rather than goals (the outcome). Identity-based
habits — becoming the kind of person who does X — are more durable
than outcome-based habits.

## Key Ideas

- **1% better every day** compounds to 37x better in a year
- **Identity beats outcomes**: "I am a reader" > "I want to read more"
- **Make habits obvious, attractive, easy, satisfying** (the Four Laws)
- **Environment design** beats willpower every time

## Quotes

> "You do not rise to the level of your goals. You fall to the level of your systems."

## Notes

Pairs well with *The Power of Habit* by Charles Duhigg for the neuroscience angle.
`,
      },
    ],
  },

  // ── AI workspace ──────────────────────────────────────────────────────────
  'ai-workspace': {
    name: 'AI Workspace',
    description: 'Project context, tool registry, and AI instruction context',
    files: [
      {
        path: '.claude/vault-keeper.json',
        content: JSON.stringify(
          { vaultRoot: '.', vaultFolders: ['contexts', 'tools', 'ai-context'] },
          null,
          2,
        ) + '\n',
      },
      {
        path: 'templates/context-template.md',
        content: `---
template_path: templates/context-template.md
document_type: context
tier: AI_CONTEXT
sections:
  - Purpose
  - Facts
  - Constraints
  - References
fields:
  template:
    required: true
  document_type:
    required: true
  title:
    type: string
    required: true
  scope:
    type: string
    required: true
    enum:
      - project
      - domain
      - session
      - feature
  status:
    type: string
    required: true
    enum:
      - active
      - stale
      - archived
  owner:
    type: string
    required: true
  updated_at:
    type: date
    required: true
  tags:
    type: array
    uniqueItems: true
  $path:
    pattern: '^contexts/[a-z0-9-]+\\.md$'
---

# Context template

## Purpose

\`\`\`yaml section-rules
required: true
\`\`\`

What this context helps the AI understand.

## Facts

\`\`\`yaml section-rules
required: true
\`\`\`

Stable facts the assistant should preserve.

## Constraints

\`\`\`yaml section-rules
required: true
\`\`\`

Boundaries, assumptions, and rules.

## References
`,
      },
      {
        path: 'templates/tool-template.md',
        content: `---
template_path: templates/tool-template.md
document_type: tool
tier: AI_CONTEXT
sections:
  - Capability
  - Inputs
  - Outputs
  - Safety Notes
fields:
  template:
    required: true
  document_type:
    required: true
  title:
    type: string
    required: true
  tool_type:
    type: string
    required: true
    enum:
      - cli
      - api
      - mcp
      - skill
      - script
      - ui
  command:
    type: string
  status:
    type: string
    required: true
    enum:
      - available
      - experimental
      - deprecated
  owner:
    type: string
    required: true
  $path:
    pattern: '^tools/[a-z0-9-]+\\.md$'
---

# Tool template

## Capability

\`\`\`yaml section-rules
required: true
\`\`\`

What the tool can do.

## Inputs

Expected arguments, files, env vars, or UI state.

## Outputs

Files, responses, side effects, or reports produced.

## Safety Notes

\`\`\`yaml section-rules
required: true
\`\`\`

Risks, permissions, and when not to use it.
`,
      },
      {
        path: 'templates/ai-context-template.md',
        content: `---
template_path: templates/ai-context-template.md
document_type: ai-context
tier: AI_CONTEXT
sections:
  - Operating Instructions
  - Relevant Context
  - Do Not
fields:
  template:
    required: true
  document_type:
    required: true
  title:
    type: string
    required: true
  audience:
    type: string
    required: true
    enum:
      - claude
      - chatgpt
      - cursor
      - codex
      - all
  context_type:
    type: string
    required: true
    enum:
      - system
      - project
      - task
      - memory
  priority:
    type: integer
    min: 1
    max: 5
  status:
    type: string
    required: true
    enum:
      - active
      - stale
      - archived
  $path:
    pattern: '^ai-context/[a-z0-9-]+\\.md$'
---

# AI context template

## Operating Instructions

\`\`\`yaml section-rules
required: true
\`\`\`

Instructions the AI should follow.

## Relevant Context

\`\`\`yaml section-rules
required: true
\`\`\`

Project facts, glossary, and assumptions.

## Do Not

\`\`\`yaml section-rules
required: true
\`\`\`

Behaviors, tools, or changes the AI should avoid.
`,
      },
      {
        path: 'contexts/project-overview.md',
        content: `---
template: templates/context-template.md
document_type: context
title: Project overview
scope: project
status: active
owner: '@team'
updated_at: 2026-05-21
tags:
  - onboarding
  - ai
---

# Project overview

## Purpose

Give AI assistants a stable starting point before they edit or explain this project.

## Facts

- The vault stores Markdown documents and templates.
- Templates define the rules; validators enforce them without domain knowledge.

## Constraints

- Keep project-specific assumptions in context docs, not in validator code.
- Validate after generating or changing documents.

## References
`,
      },
      {
        path: 'tools/vault-keeper-dashboard.md',
        content: `---
template: templates/tool-template.md
document_type: tool
title: Vault Keeper dashboard
tool_type: cli
command: node cli/main.js dashboard --serve
status: available
owner: '@team'
---

# Vault Keeper dashboard

## Capability

Starts a local UI for choosing a vault, validating documents, and creating templates or documents.

## Inputs

- Optional root path
- Optional validation path

## Outputs

- Local dashboard URL
- Validation summary and create workflows

## Safety Notes

Server mode writes templates and documents only under the selected vault root.
`,
      },
      {
        path: 'ai-context/codex-project-rules.md',
        content: `---
template: templates/ai-context-template.md
document_type: ai-context
title: Codex project rules
audience: codex
context_type: project
priority: 1
status: active
---

# Codex project rules

## Operating Instructions

Read existing patterns before editing. Keep changes scoped and run tests after changes.

## Relevant Context

Vault Keeper validates Markdown against template-defined frontmatter and body section rules.

## Do Not

Do not hardcode context, tool, or AI-specific domain rules into the validator.
`,
      },
    ],
  },
};

// ── scaffoldPreset ─────────────────────────────────────────────────────────────

/**
 * Write all files for a preset to `targetDir`.
 *
 * @param {string} presetId - key in PRESETS (e.g. 'obsidian')
 * @param {string} targetDir - absolute path to the output directory
 * @throws {Error} if presetId is unknown
 */
export function scaffoldPreset(presetId, targetDir) {
  const preset = PRESETS[presetId];
  if (!preset) {
    const known = Object.keys(PRESETS).join(', ');
    throw new Error(`Unknown preset '${presetId}'. Known presets: ${known}`);
  }

  for (const { path: relPath, content } of preset.files) {
    const abs = join(targetDir, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }
}

/**
 * List available preset IDs.
 * @returns {string[]}
 */
export function listPresets() {
  return Object.keys(PRESETS);
}
