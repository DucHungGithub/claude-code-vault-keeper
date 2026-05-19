/**
 * Tests for the template-rules loader.
 *
 * `loadTemplateRules` returns `{ rules, error }`:
 *   - success: { rules: NormalizedRules, error: null }
 *   - failure: { rules: null, error: "<specific reason>" }
 * `normalizeRules` is pure and runs on inline objects.
 *
 * Each test uses an isolated temp dir; no real templates are read.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  loadTemplateRules,
  normalizeRules,
} from "../lib/template-rules.js";

let SANDBOX;

beforeEach(() => {
  SANDBOX = mkdtempSync(join(tmpdir(), "tpl-rules-"));
});

afterEach(() => {
  rmSync(SANDBOX, { recursive: true, force: true });
});

function writeFile(rel, content) {
  const abs = join(SANDBOX, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf-8");
  return abs;
}

// ────────────────────────────────────────────────────────────────────────────
// loadTemplateRules — null cases
// ────────────────────────────────────────────────────────────────────────────

describe("loadTemplateRules — error cases", () => {
  test("templatePath is null → { rules: null, error: string }", async () => {
    const { rules, error } = await loadTemplateRules(null, SANDBOX);
    expect(rules).toBeNull();
    expect(typeof error).toBe("string");
    expect(error.length).toBeGreaterThan(0);
  });

  test("templatePath is empty string → { rules: null, error: string }", async () => {
    const { rules, error } = await loadTemplateRules("", SANDBOX);
    expect(rules).toBeNull();
    expect(typeof error).toBe("string");
  });

  test("file does not exist → { rules: null, error } (not throw)", async () => {
    const { rules, error } = await loadTemplateRules("templates/nope.md", SANDBOX);
    expect(rules).toBeNull();
    expect(error).toMatch(/not found/i);
    expect(error).toContain("templates/nope.md");
  });

  test("file exists but no frontmatter → { rules: null, error }", async () => {
    writeFile("templates/foo.md", "# heading only\n\nbody\n");
    const { rules, error } = await loadTemplateRules("templates/foo.md", SANDBOX);
    expect(rules).toBeNull();
    expect(typeof error).toBe("string");
  });

  test("frontmatter exists but no validation_rules block → { rules: null, error }", async () => {
    writeFile(
      "templates/foo.md",
      "---\ntemplate_id: foo\nstatus: x\n---\nbody\n",
    );
    const { rules, error } = await loadTemplateRules("templates/foo.md", SANDBOX);
    expect(rules).toBeNull();
    expect(error).toMatch(/validation_rules/i);
  });

  test("malformed YAML in frontmatter → { rules: null, error } (not throw)", async () => {
    writeFile("templates/bad.md", "---\nbroken: [unclosed\n---\nbody\n");
    const { rules, error } = await loadTemplateRules("templates/bad.md", SANDBOX);
    expect(rules).toBeNull();
    expect(typeof error).toBe("string");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// loadTemplateRules — happy paths
// ────────────────────────────────────────────────────────────────────────────

describe("loadTemplateRules — happy paths", () => {
  test("required_fields list is loaded verbatim", async () => {
    writeFile(
      "templates/r.md",
      `---
validation_rules:
  required_fields: [template, status, owner]
---
body
`,
    );
    const { rules, error } = await loadTemplateRules("templates/r.md", SANDBOX);
    expect(error).toBeNull();
    expect(rules.required_fields).toEqual(["template", "status", "owner"]);
  });

  test("field_rules with all variants (regex / values / type+min)", async () => {
    writeFile(
      "templates/f.md",
      `---
validation_rules:
  field_rules:
    - field: status
      values: [draft, review]
    - field: created
      regex: "^\\\\d{4}-\\\\d{2}-\\\\d{2}$"
    - field: count
      type: integer
      min: 0
---
`,
    );
    const { rules } = await loadTemplateRules("templates/f.md", SANDBOX);
    expect(rules.field_rules).toHaveLength(3);
    expect(rules.field_rules[0]).toMatchObject({
      field: "status",
      values: ["draft", "review"],
    });
    expect(rules.field_rules[1].field).toBe("created");
    expect(rules.field_rules[1].regex).toMatch(/\\d\{4\}/);
    expect(rules.field_rules[2]).toMatchObject({
      field: "count",
      type: "integer",
      min: 0,
    });
  });

  test("conditional_required_fields preserves shape", async () => {
    writeFile(
      "templates/c.md",
      `---
validation_rules:
  conditional_required_fields:
    - condition: "type in ['x']"
      field: foo
      required: true
    - condition: "type in ['y']"
      field: bar
      min_count: 2
---
`,
    );
    const { rules } = await loadTemplateRules("templates/c.md", SANDBOX);
    expect(rules.conditional_required_fields).toHaveLength(2);
    expect(rules.conditional_required_fields[0]).toMatchObject({
      condition: "type in ['x']",
      field: "foo",
      required: true,
    });
    expect(rules.conditional_required_fields[1]).toMatchObject({
      condition: "type in ['y']",
      field: "bar",
      min_count: 2,
    });
  });

  test("state_machine map is loaded as transition graph", async () => {
    writeFile(
      "templates/s.md",
      `---
validation_rules:
  state_machine:
    draft: [review, cancelled]
    review: [approved]
    approved: []
---
`,
    );
    const { rules } = await loadTemplateRules("templates/s.md", SANDBOX);
    expect(rules.state_machine).toEqual({
      draft: ["review", "cancelled"],
      review: ["approved"],
      approved: [],
    });
  });

  test("optional_fields list", async () => {
    writeFile(
      "templates/o.md",
      `---
validation_rules:
  optional_fields: [tags, references]
---
`,
    );
    const { rules } = await loadTemplateRules("templates/o.md", SANDBOX);
    expect(rules.optional_fields).toEqual(["tags", "references"]);
  });

  test("__source records the template path it was loaded from", async () => {
    writeFile(
      "templates/x.md",
      `---
validation_rules:
  required_fields: [a]
---
`,
    );
    const { rules } = await loadTemplateRules("templates/x.md", SANDBOX);
    expect(rules.__source).toBe("templates/x.md");
  });

  test("absolute path is honoured (no projectRoot join)", async () => {
    const abs = writeFile(
      "templates/abs.md",
      `---
validation_rules:
  required_fields: [a]
---
`,
    );
    const { rules } = await loadTemplateRules(abs);
    expect(rules.required_fields).toEqual(["a"]);
  });

  test("missing arrays normalize to empty arrays (not undefined)", async () => {
    writeFile(
      "templates/empty.md",
      `---
validation_rules: {}
---
`,
    );
    const { rules } = await loadTemplateRules("templates/empty.md", SANDBOX);
    expect(rules.required_fields).toEqual([]);
    expect(rules.conditional_required_fields).toEqual([]);
    expect(rules.field_rules).toEqual([]);
    expect(rules.optional_fields).toEqual([]);
    expect(rules.state_machine).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// normalizeRules — pure transformation contract
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeRules", () => {
  test("array fields are defensively copied", () => {
    const input = ["a", "b"];
    const r = normalizeRules({ required_fields: input });
    r.required_fields.push("c");
    expect(input).toEqual(["a", "b"]); // input untouched
  });

  test("non-array required_fields → empty array (graceful coerce)", () => {
    expect(normalizeRules({ required_fields: "not array" }).required_fields).toEqual([]);
    expect(normalizeRules({ required_fields: null }).required_fields).toEqual([]);
    expect(normalizeRules({}).required_fields).toEqual([]);
  });

  test("__source defaults to 'inline' when not provided", () => {
    expect(normalizeRules({}).__source).toBe("inline");
  });

  test("__source override is preserved", () => {
    expect(normalizeRules({}, "templates/foo.md").__source).toBe("templates/foo.md");
  });

  test("state_machine values defensively copied", () => {
    const sm = { draft: ["review"] };
    const r = normalizeRules({ state_machine: sm });
    r.state_machine.draft.push("cancelled");
    expect(sm.draft).toEqual(["review"]);
  });

  test("conditional entries are shallow-copied (mutation-safe at one level)", () => {
    const entries = [{ condition: "x in ['y']", field: "z", required: true }];
    const r = normalizeRules({ conditional_required_fields: entries });
    r.conditional_required_fields[0].field = "MUTATED";
    expect(entries[0].field).toBe("z");
  });

  test("null/undefined input returns an empty rule object (not throw)", () => {
    const r = normalizeRules(null);
    expect(r.required_fields).toEqual([]);
    expect(r.field_rules).toEqual([]);
    expect(r.state_machine).toBeNull();
  });
});

