/**
 * F4 — State machine transition validation tests
 *
 * state_machine is declared on the status field in a template:
 *
 *   status:
 *     type: string
 *     enum: [draft, review, approved]
 *     state_machine:
 *       draft: [review]
 *       review: [approved, draft]
 *       approved: []
 *
 * Transition check is opt-in via `previous_status` in the document:
 *   - absent  → skip (backwards compatible, no error)
 *   - present → enforce that state_machine[previous_status] includes status
 *
 * Tests cover: unit (applyFieldSchema), meta-validation
 * (validateTemplateSchema), and integration (validateDocument).
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyFieldSchema, validateTemplateSchema } from '../lib/schema-engine.js';
import { validateDocument } from '../cli/validate-documents.js';

// Shared state_machine spec used by unit tests
const SM = {
  draft: ['review'],
  review: ['approved', 'draft'],
  approved: [],
  abandoned: ['draft'],
};

const SCHEMA = {
  fields: {
    status: { type: 'string', enum: Object.keys(SM), state_machine: SM },
    previous_status: { type: 'string' },
  },
};

function docMeta() {
  return { repoRelativePath: 'notes/doc.md', fileExists: () => true };
}

// ── Unit: applyFieldSchema ────────────────────────────────────────────────────

describe('state_machine primitive — applyFieldSchema', () => {
  test('no previous_status → skip transition check (backwards compat)', () => {
    const fm = { status: 'approved' }; // no previous_status
    const issues = applyFieldSchema(SCHEMA, fm, docMeta());
    const transitionErrors = issues.filter((i) => i.error_type === 'invalid-transition');
    expect(transitionErrors).toHaveLength(0);
  });

  test('valid transition → no error', () => {
    const fm = { status: 'review', previous_status: 'draft' };
    const issues = applyFieldSchema(SCHEMA, fm, docMeta());
    const transitionErrors = issues.filter((i) => i.error_type === 'invalid-transition');
    expect(transitionErrors).toHaveLength(0);
  });

  test('invalid transition → invalid-transition error', () => {
    // draft cannot go directly to approved
    const fm = { status: 'approved', previous_status: 'draft' };
    const issues = applyFieldSchema(SCHEMA, fm, docMeta());
    const transitionErrors = issues.filter((i) => i.error_type === 'invalid-transition');
    expect(transitionErrors).toHaveLength(1);
    expect(transitionErrors[0].message).toContain('draft');
    expect(transitionErrors[0].message).toContain('approved');
    expect(transitionErrors[0].fix).toBeDefined();
  });

  test('terminal state (empty allowed-next list) → invalid-transition error', () => {
    // approved cannot transition anywhere
    const fm = { status: 'draft', previous_status: 'approved' };
    const issues = applyFieldSchema(SCHEMA, fm, docMeta());
    const transitionErrors = issues.filter((i) => i.error_type === 'invalid-transition');
    expect(transitionErrors).toHaveLength(1);
    expect(transitionErrors[0].message).toContain('terminal');
  });

  test('previous_status unknown in state_machine → skip (no false-positive)', () => {
    // previous_status was some legacy value not in the state machine
    const fm = { status: 'draft', previous_status: 'old-state' };
    const issues = applyFieldSchema(SCHEMA, fm, docMeta());
    const transitionErrors = issues.filter((i) => i.error_type === 'invalid-transition');
    expect(transitionErrors).toHaveLength(0);
  });

  test('previous_status empty string → skip (treated as absent)', () => {
    const fm = { status: 'approved', previous_status: '' };
    const issues = applyFieldSchema(SCHEMA, fm, docMeta());
    const transitionErrors = issues.filter((i) => i.error_type === 'invalid-transition');
    expect(transitionErrors).toHaveLength(0);
  });

  test('multiple valid transitions work independently', () => {
    // review → approved ✓
    const fm1 = { status: 'approved', previous_status: 'review' };
    // review → draft ✓
    const fm2 = { status: 'draft', previous_status: 'review' };

    for (const fm of [fm1, fm2]) {
      const issues = applyFieldSchema(SCHEMA, fm, docMeta()).filter(
        (i) => i.error_type === 'invalid-transition',
      );
      expect(issues).toHaveLength(0);
    }
  });

  test('abandoned can return to draft (cycle supported)', () => {
    const fm = { status: 'draft', previous_status: 'abandoned' };
    const issues = applyFieldSchema(SCHEMA, fm, docMeta());
    const transitionErrors = issues.filter((i) => i.error_type === 'invalid-transition');
    expect(transitionErrors).toHaveLength(0);
  });
});

// ── Meta-validation: validateTemplateSchema ───────────────────────────────────

describe('state_machine meta-validation (validateTemplateSchema)', () => {
  test('well-formed state_machine → zero templateErrors', () => {
    const fields = {
      status: {
        type: 'string',
        state_machine: { draft: ['review'], review: ['approved'], approved: [] },
      },
    };
    expect(validateTemplateSchema(fields)).toHaveLength(0);
  });

  test('state_machine is not an object → template-schema-invalid', () => {
    const fields = { status: { type: 'string', state_machine: 'draft,review' } };
    const errs = validateTemplateSchema(fields).filter(
      (e) => e.error_type === 'template-schema-invalid',
    );
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].field).toBe('status');
  });

  test('state_machine value for a state is not array → template-schema-invalid', () => {
    const fields = {
      status: { type: 'string', state_machine: { draft: 'review' } }, // string, not array
    };
    const errs = validateTemplateSchema(fields).filter(
      (e) => e.error_type === 'template-schema-invalid',
    );
    expect(errs.length).toBeGreaterThan(0);
  });

  test('state_machine references undeclared state → template-schema-invalid', () => {
    const fields = {
      status: {
        type: 'string',
        state_machine: { draft: ['review', 'nonexistent'], review: ['approved'], approved: [] },
      },
    };
    const errs = validateTemplateSchema(fields).filter(
      (e) => e.error_type === 'template-schema-invalid',
    );
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].message).toContain('nonexistent');
  });

  test('state_machine with all states self-referentially correct → zero errors', () => {
    const fields = {
      status: {
        type: 'string',
        state_machine: {
          new: ['in_progress', 'cancelled'],
          in_progress: ['done', 'cancelled', 'new'],
          done: [],
          cancelled: ['new'],
        },
      },
    };
    expect(validateTemplateSchema(fields)).toHaveLength(0);
  });
});

// ── Integration: validateDocument with real template + filesystem ─────────────

describe('state_machine — validateDocument integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'f4-test-'));
    mkdirSync(join(tmpDir, 'templates'), { recursive: true });
    mkdirSync(join(tmpDir, 'tasks'), { recursive: true });

    writeFileSync(join(tmpDir, 'templates', 'task-template.md'), `---
fields:
  template:
    required: true
  title:
    type: string
    required: true
  status:
    type: string
    required: true
    enum:
      - draft
      - review
      - approved
    state_machine:
      draft:
        - review
      review:
        - approved
        - draft
      approved: []
  previous_status:
    type: string
---
# Task template
`, 'utf-8');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDoc(filename, frontmatter) {
    const yaml = Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    const abs = join(tmpDir, 'tasks', filename);
    writeFileSync(abs, `---\n${yaml}\n---\n# Doc\n`, 'utf-8');
    return abs;
  }

  test('document without previous_status → no transition error', async () => {
    const doc = writeDoc('task-001.md', {
      template: 'templates/task-template.md',
      title: 'My Task',
      status: 'approved',
    });
    const result = await validateDocument(doc, { projectRoot: tmpDir });
    const transitionErrors = result.errors.filter((e) => e.error_type === 'invalid-transition');
    expect(transitionErrors).toHaveLength(0);
  });

  test('valid transition with previous_status → no transition error', async () => {
    const doc = writeDoc('task-002.md', {
      template: 'templates/task-template.md',
      title: 'My Task',
      status: 'review',
      previous_status: 'draft',
    });
    const result = await validateDocument(doc, { projectRoot: tmpDir });
    const transitionErrors = result.errors.filter((e) => e.error_type === 'invalid-transition');
    expect(transitionErrors).toHaveLength(0);
  });

  test('invalid transition → invalid-transition error in result', async () => {
    const doc = writeDoc('task-003.md', {
      template: 'templates/task-template.md',
      title: 'My Task',
      status: 'approved',    // draft → approved not allowed (must go via review)
      previous_status: 'draft',
    });
    const result = await validateDocument(doc, { projectRoot: tmpDir });
    const transitionErrors = result.errors.filter((e) => e.error_type === 'invalid-transition');
    expect(transitionErrors).toHaveLength(1);
    expect(result.valid).toBe(false);
    expect(transitionErrors[0].message).toContain('draft');
    expect(transitionErrors[0].message).toContain('approved');
  });
});
