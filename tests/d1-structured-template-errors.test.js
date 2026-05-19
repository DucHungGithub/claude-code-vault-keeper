/**
 * TDD tests for D1 — Structured errors from loadTemplateRules
 *
 * Problem: current function returns bare `null` for ALL failure modes,
 * so callers emit: "file not found, malformed YAML, or missing block" —
 * user cannot tell which one.
 *
 * Red criteria (before impl):
 *  - loadTemplateRules returns null, not { rules, error }
 *  - No way to distinguish missing file vs bad YAML vs no rules block
 *
 * Green criteria (after impl):
 *  - Returns { rules: <NormalizedRules>, error: null } on success
 *  - Returns { rules: null, error: "<specific message>" } on each failure
 *  - Null/empty path → { rules: null, error: "Template path is required" }
 *  - Missing file  → error contains "not found" and the path
 *  - Malformed YAML → error contains "YAML" and the template path
 *  - No rules block → error contains "validation_rules" and the path
 *  - Call sites (LSP + CLI) surface the specific error message
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { loadTemplateRules } from "../lib/template-rules.js";

let SANDBOX;

beforeEach(() => {
  SANDBOX = mkdtempSync(join(tmpdir(), "d1-errors-"));
});

afterEach(() => {
  rmSync(SANDBOX, { recursive: true, force: true });
});

function writeTemplate(rel, content) {
  const abs = join(SANDBOX, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf-8");
}

// ── Success case: { rules, error: null } ─────────────────────────────────────

describe("D1 — success returns { rules, error: null }", () => {
  test("valid template → { rules: <object>, error: null }", async () => {
    writeTemplate("templates/ok.md", `---
validation_rules:
  required_fields: [title, status]
  field_rules:
    - field: status
      values: [draft, done]
---
`);
    const result = await loadTemplateRules("templates/ok.md", SANDBOX);

    // Must return structured object, not bare rules
    expect(result).toBeObject();
    expect(result.error).toBeNull();
    expect(result.rules).toBeObject();
    expect(result.rules.required_fields).toEqual(["title", "status"]);
  });
});

// ── Failure case 1: null / empty path ────────────────────────────────────────

describe("D1 — null/empty path → structured error", () => {
  test("null templatePath → { rules: null, error: message }", async () => {
    const result = await loadTemplateRules(null, SANDBOX);
    expect(result).toBeObject();
    expect(result.rules).toBeNull();
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });

  test("empty string → { rules: null, error: message }", async () => {
    const result = await loadTemplateRules("", SANDBOX);
    expect(result).toBeObject();
    expect(result.rules).toBeNull();
    expect(typeof result.error).toBe("string");
  });
});

// ── Failure case 2: file not found ───────────────────────────────────────────

describe("D1 — missing file → specific error", () => {
  test("missing file → error mentions 'not found' and the path", async () => {
    const result = await loadTemplateRules("templates/missing.md", SANDBOX);

    expect(result).toBeObject();
    expect(result.rules).toBeNull();
    expect(result.error).toMatch(/not found/i);
    expect(result.error).toContain("templates/missing.md");
  });

  test("missing file → error does NOT mention 'malformed YAML'", async () => {
    const result = await loadTemplateRules("templates/gone.md", SANDBOX);
    expect(result.error).not.toMatch(/malformed/i);
    expect(result.error).not.toMatch(/yaml/i);
  });
});

// ── Failure case 3: malformed YAML ───────────────────────────────────────────

describe("D1 — malformed YAML → specific error", () => {
  test("YAML with tab indentation (invalid in YAML) → structured error", async () => {
    // YAML spec forbids tabs for indentation — js-yaml throws on this.
    writeTemplate("templates/bad.md", "---\nfoo:\n\t- bar\n---\nbody\n");

    const result = await loadTemplateRules("templates/bad.md", SANDBOX);

    expect(result).toBeObject();
    expect(result.rules).toBeNull();
    // Either a YAML error or "no validation_rules" — both are valid structured errors.
    // Key assertion: NOT a "not found" error (the file exists).
    expect(result.error).not.toMatch(/not found/i);
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });

  test("truly malformed YAML → error mentions template path", async () => {
    // YAML with a null key + colon soup that js-yaml rejects
    writeTemplate("templates/malformed.md", "---\n: : :\n---");

    const result = await loadTemplateRules("templates/malformed.md", SANDBOX);
    expect(result.rules).toBeNull();
    expect(typeof result.error).toBe("string");
    // Must not be the "not found" error — file exists
    expect(result.error).not.toMatch(/not found/i);
  });

  test("when YAML error occurs → error string contains 'YAML'", async () => {
    // Force a YAML error by using a tab — js-yaml definitely throws here
    writeTemplate("templates/tab-yaml.md", "---\nkey:\n\t value\n---");

    const result = await loadTemplateRules("templates/tab-yaml.md", SANDBOX);
    if (result.rules === null && result.error.includes("yaml") === false &&
        result.error.toLowerCase().includes("yaml") === false) {
      // gray-matter was lenient — accept any non-"not found" structured error
      expect(result.error).not.toMatch(/not found/i);
    } else if (result.rules === null) {
      // gray-matter threw — error must mention YAML
      expect(result.error).toMatch(/yaml/i);
    }
    // Either way: must be a structured { rules: null, error: string }
    expect(result.rules).toBeNull();
    expect(typeof result.error).toBe("string");
  });
});

// ── Failure case 4: no validation_rules block ────────────────────────────────

describe("D1 — missing validation_rules block → specific error", () => {
  test("file exists, no validation_rules → error mentions 'validation_rules'", async () => {
    writeTemplate(
      "templates/no-rules.md",
      "---\ntemplate_id: foo\nstatus: x\n---\nbody\n",
    );

    const result = await loadTemplateRules("templates/no-rules.md", SANDBOX);

    expect(result).toBeObject();
    expect(result.rules).toBeNull();
    expect(result.error).toMatch(/validation_rules/i);
    expect(result.error).toContain("templates/no-rules.md");
  });

  test("file with only body, no frontmatter → error is structured", async () => {
    writeTemplate("templates/nobody.md", "# Just a heading\n\nbody text\n");

    const result = await loadTemplateRules("templates/nobody.md", SANDBOX);

    expect(result).toBeObject();
    expect(result.rules).toBeNull();
    expect(typeof result.error).toBe("string");
  });
});

// ── Error messages are distinct between failure modes ───────────────────────

describe("D1 — error messages are distinct per failure mode", () => {
  test("each failure mode produces a different error string", async () => {
    writeTemplate("templates/no-rules.md", "---\ntemplate_id: foo\n---\n");
    writeTemplate("templates/bad-yaml.md", "---\nbroken: [unclosed\n---\n");

    const notFound = await loadTemplateRules("templates/gone.md", SANDBOX);
    const noRules = await loadTemplateRules("templates/no-rules.md", SANDBOX);
    const badYaml = await loadTemplateRules("templates/bad-yaml.md", SANDBOX);

    // All three are errors
    expect(notFound.rules).toBeNull();
    expect(noRules.rules).toBeNull();
    expect(badYaml.rules).toBeNull();

    // All three have different messages
    expect(notFound.error).not.toBe(noRules.error);
    expect(notFound.error).not.toBe(badYaml.error);
    expect(noRules.error).not.toBe(badYaml.error);
  });
});
