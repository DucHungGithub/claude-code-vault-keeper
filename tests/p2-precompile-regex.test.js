/**
 * TDD tests for P2 — Pre-compile regex trong normalizeRules()
 *
 * Red criteria:
 *  - normalizeRules chưa set _compiledRegex trên field_rules
 *  - normalizeRules chưa set _compiledPathRegex trên rules object
 *
 * Green criteria:
 *  - field_rules với regex → rule._compiledRegex là RegExp instance
 *  - field_rules không có regex → rule._compiledRegex undefined
 *  - path_regex string → rules._compiledPathRegex là RegExp instance
 *  - không có path_regex → rules._compiledPathRegex undefined
 *  - invalid regex → _compiledRegex / _compiledPathRegex là null (graceful)
 *  - validators.js dùng _compiledRegex thay vì new RegExp (behavior unchanged)
 */

import { describe, test, expect } from "bun:test";
import { normalizeRules } from "../lib/template-rules.js";
import { applyRules } from "../lib/validators.js";

// ── normalizeRules: _compiledRegex on field_rules ────────────────────────────

describe("P2 — normalizeRules sets _compiledRegex on field_rules", () => {
  test("field_rule with regex → _compiledRegex is RegExp", () => {
    const rules = normalizeRules({
      field_rules: [{ field: "slug", regex: "^[a-z0-9-]+$" }],
    });

    expect(rules.field_rules[0]._compiledRegex).toBeInstanceOf(RegExp);
    expect(rules.field_rules[0]._compiledRegex.source).toBe("^[a-z0-9-]+$");
  });

  test("field_rule without regex → _compiledRegex is undefined", () => {
    const rules = normalizeRules({
      field_rules: [{ field: "status", values: ["draft", "done"] }],
    });

    expect(rules.field_rules[0]._compiledRegex).toBeUndefined();
  });

  test("mixed field_rules: only regex fields get compiled", () => {
    const rules = normalizeRules({
      field_rules: [
        { field: "slug", regex: "^[a-z]+$" },
        { field: "status", values: ["a", "b"] },
        { field: "count", type: "integer", min: 0 },
        { field: "id", regex: "^\\d{3}$" },
      ],
    });

    expect(rules.field_rules[0]._compiledRegex).toBeInstanceOf(RegExp);
    expect(rules.field_rules[1]._compiledRegex).toBeUndefined();
    expect(rules.field_rules[2]._compiledRegex).toBeUndefined();
    expect(rules.field_rules[3]._compiledRegex).toBeInstanceOf(RegExp);
    expect(rules.field_rules[3]._compiledRegex.source).toBe("^\\d{3}$");
  });

  test("invalid regex in field_rule → _compiledRegex is null (no throw)", () => {
    // Should NOT throw — graceful null so caller can report the error
    expect(() => {
      normalizeRules({ field_rules: [{ field: "x", regex: "[invalid" }] });
    }).not.toThrow();

    const rules = normalizeRules({
      field_rules: [{ field: "x", regex: "[invalid" }],
    });
    expect(rules.field_rules[0]._compiledRegex).toBeNull();
  });

  test("empty field_rules → no compiled regexes", () => {
    const rules = normalizeRules({ field_rules: [] });
    expect(rules.field_rules).toHaveLength(0);
  });

  test("no field_rules key → field_rules is empty array", () => {
    const rules = normalizeRules({ required_fields: ["title"] });
    expect(rules.field_rules).toHaveLength(0);
  });
});

// ── normalizeRules: _compiledPathRegex ───────────────────────────────────────

describe("P2 — normalizeRules sets _compiledPathRegex", () => {
  test("path_regex string → _compiledPathRegex is RegExp that matches correctly", () => {
    const rules = normalizeRules({ path_regex: "^notes/.*\\.md$" });
    expect(rules._compiledPathRegex).toBeInstanceOf(RegExp);
    // Test behavior, not source string (runtimes may normalize `/` → `\/` in .source)
    expect(rules._compiledPathRegex.test("notes/my-note.md")).toBe(true);
    expect(rules._compiledPathRegex.test("other/file.md")).toBe(false);
  });

  test("no path_regex → _compiledPathRegex is undefined", () => {
    const rules = normalizeRules({ required_fields: ["title"] });
    expect(rules._compiledPathRegex).toBeUndefined();
  });

  test("invalid path_regex → _compiledPathRegex is null (no throw)", () => {
    expect(() => {
      normalizeRules({ path_regex: "[bad" });
    }).not.toThrow();

    const rules = normalizeRules({ path_regex: "[bad" });
    expect(rules._compiledPathRegex).toBeNull();
  });
});

// ── applyRules: behavior unchanged when using compiled regex ─────────────────

describe("P2 — applyRules behavior unchanged with compiled regex", () => {
  test("valid value matching regex → no issues", () => {
    const rules = normalizeRules({
      required_fields: ["slug"],
      field_rules: [{ field: "slug", regex: "^[a-z0-9-]+$" }],
    });

    const issues = applyRules(rules, { slug: "hello-world" });
    expect(issues.filter((i) => i.field === "slug")).toHaveLength(0);
  });

  test("value failing regex → error issue", () => {
    const rules = normalizeRules({
      required_fields: ["slug"],
      field_rules: [{ field: "slug", regex: "^[a-z0-9-]+$" }],
    });

    const issues = applyRules(rules, { slug: "Hello World!" });
    const slugIssues = issues.filter((i) => i.field === "slug");
    expect(slugIssues.length).toBeGreaterThan(0);
    expect(slugIssues[0].level).toBe("error");
  });

  test("enum values check still works alongside regex", () => {
    const rules = normalizeRules({
      required_fields: ["status"],
      field_rules: [{ field: "status", values: ["draft", "done"] }],
    });

    const okIssues = applyRules(rules, { status: "draft" });
    expect(okIssues.filter((i) => i.field === "status")).toHaveLength(0);

    const badIssues = applyRules(rules, { status: "wip" });
    expect(badIssues.filter((i) => i.field === "status").length).toBeGreaterThan(0);
  });
});
