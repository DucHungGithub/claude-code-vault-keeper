/**
 * Tests for the template-rules loader — Phase 3a (LOADER layer).
 *
 * `loadTemplateRules` reads a markdown template, parses its frontmatter
 * (`fields:`, `strict`, `sections:`, `tier:`), parses the body into a
 * BodySchemaNode tree, runs meta-validation, and returns the full schema
 * object (or null on failure).
 *
 * Each test uses an isolated temp dir; no real templates are read.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { loadTemplateRules } from "../lib/template-rules.js";

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

describe("loadTemplateRules — null cases", () => {
  test("templatePath is null → null", async () => {
    expect(await loadTemplateRules(null, SANDBOX)).toBeNull();
  });

  test("templatePath is empty string → null", async () => {
    expect(await loadTemplateRules("", SANDBOX)).toBeNull();
  });

  test("file does not exist → null (not throw)", async () => {
    expect(await loadTemplateRules("templates/nope.md", SANDBOX)).toBeNull();
  });

  test("malformed YAML in frontmatter → null (not throw)", async () => {
    writeFile("templates/bad.md", "---\nbroken: [unclosed\n---\nbody\n");
    expect(await loadTemplateRules("templates/bad.md", SANDBOX)).toBeNull();
  });

  test("empty file → object (gray-matter parses empty as {})", async () => {
    writeFile("templates/empty.md", "");
    const result = await loadTemplateRules("templates/empty.md", SANDBOX);
    // gray-matter parses an empty string as { data: {}, content: '' }.
    // {} is a valid object, so we get a result, not null.
    expect(result).not.toBeNull();
    expect(result.fields).toBeUndefined();
    expect(result.bodySchema).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// loadTemplateRules — return shape
// ────────────────────────────────────────────────────────────────────────────

describe("loadTemplateRules — return shape", () => {
  test("template with frontmatter but no fields: → fields is undefined", async () => {
    writeFile(
      "templates/minimal.md",
      "---\ntier: basic\n---\nbody\n",
    );
    const result = await loadTemplateRules("templates/minimal.md", SANDBOX);
    expect(result).not.toBeNull();
    expect(result.fields).toBeUndefined();
    expect(result.tier).toBe("basic");
    expect(result.strict).toBe(false);
    expect(result.sections).toEqual([]);
    expect(result.bodySchema).toEqual([]);
    expect(result.templateErrors).toEqual([]);
  });

  test("file with no frontmatter → object with fields undefined", async () => {
    writeFile("templates/nofront.md", "# Just a heading\n\nbody\n");
    // gray-matter returns data as {} for no-frontmatter files — a valid
    // object, so loadTemplateRules returns a result (not null).
    const result = await loadTemplateRules("templates/nofront.md", SANDBOX);
    expect(result).not.toBeNull();
    expect(result.fields).toBeUndefined();
    expect(result.strict).toBe(false);
    expect(result.sections).toEqual([]);
    expect(result.tier).toBeNull();
  });

  test("returns all six keys in result object", async () => {
    writeFile(
      "templates/full.md",
      [
        "---",
        "fields:",
        "  status:",
        "    type: string",
        "    required: true",
        "    enum: [draft, review]",
        "strict: true",
        "sections: [overview, details]",
        "tier: premium",
        "---",
        "",
        "## Overview",
        "",
        "```yaml section-rules",
        "required: true",
        "```",
      ].join("\n"),
    );
    const result = await loadTemplateRules("templates/full.md", SANDBOX);
    expect(result).not.toBeNull();

    // fields
    expect(result.fields).toBeDefined();
    expect(result.fields.status).toEqual({
      type: "string",
      required: true,
      enum: ["draft", "review"],
    });

    // strict
    expect(result.strict).toBe(true);

    // sections
    expect(result.sections).toEqual(["overview", "details"]);

    // tier
    expect(result.tier).toBe("premium");

    // bodySchema
    expect(result.bodySchema).toHaveLength(1);
    expect(result.bodySchema[0].text).toBe("Overview");
    expect(result.bodySchema[0].sectionRules).toEqual({ required: true });

    // templateErrors
    expect(Array.isArray(result.templateErrors)).toBe(true);
    expect(result.templateErrors).toEqual([]); // valid template → no errors
  });

  test("absolute path is honoured (no projectRoot join)", async () => {
    const abs = writeFile(
      "templates/abs.md",
      "---\ntier: alpha\n---\nbody\n",
    );
    const result = await loadTemplateRules(abs);
    expect(result).not.toBeNull();
    expect(result.tier).toBe("alpha");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// loadTemplateRules — fields: extraction
// ────────────────────────────────────────────────────────────────────────────

describe("loadTemplateRules — fields extraction", () => {
  test("fields: with multiple field schemas", async () => {
    writeFile(
      "templates/fields.md",
      [
        "---",
        "fields:",
        "  title:",
        "    type: string",
        "    required: true",
        "  count:",
        "    type: integer",
        "    min: 0",
        "    max: 100",
        "  tags:",
        "    type: array",
        "    uniqueItems: true",
        "---",
        "body",
      ].join("\n"),
    );
    const result = await loadTemplateRules("templates/fields.md", SANDBOX);
    expect(result.fields.title).toEqual({ type: "string", required: true });
    expect(result.fields.count).toEqual({ type: "integer", min: 0, max: 100 });
    expect(result.fields.tags).toEqual({ type: "array", uniqueItems: true });
  });

  test("synthetic $path field", async () => {
    writeFile(
      "templates/synth.md",
      [
        "---",
        "fields:",
        '  $path:',
        '    pattern: "^docs/.*\\\\.md$"',
        "---",
        "body",
      ].join("\n"),
    );
    const result = await loadTemplateRules("templates/synth.md", SANDBOX);
    expect(result.fields.$path).toEqual({ pattern: "^docs/.*\\.md$" });
  });

  test("fields: null in frontmatter → fields is undefined", async () => {
    writeFile(
      "templates/nullfields.md",
      "---\nfields: null\ntier: x\n---\nbody\n",
    );
    const result = await loadTemplateRules("templates/nullfields.md", SANDBOX);
    expect(result.fields).toBeUndefined();
  });

  test("fields: as a string (invalid) → fields is undefined", async () => {
    writeFile(
      "templates/strfields.md",
      "---\nfields: not-an-object\n---\nbody\n",
    );
    const result = await loadTemplateRules("templates/strfields.md", SANDBOX);
    expect(result.fields).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// loadTemplateRules — strict / sections / tier defaults
// ────────────────────────────────────────────────────────────────────────────

describe("loadTemplateRules — top-level keys", () => {
  test("strict defaults to false", async () => {
    writeFile("templates/nostrict.md", "---\ntier: x\n---\nbody\n");
    const result = await loadTemplateRules("templates/nostrict.md", SANDBOX);
    expect(result.strict).toBe(false);
  });

  test("strict: true is honoured", async () => {
    writeFile("templates/strict.md", "---\nstrict: true\n---\nbody\n");
    const result = await loadTemplateRules("templates/strict.md", SANDBOX);
    expect(result.strict).toBe(true);
  });

  test("strict: 'yes' (string, not boolean) → false", async () => {
    writeFile("templates/strictstr.md", "---\nstrict: yes\n---\nbody\n");
    const result = await loadTemplateRules("templates/strictstr.md", SANDBOX);
    // gray-matter parses 'yes' as the string "yes", not boolean true.
    // Only boolean true activates strict mode.
    expect(result.strict).toBe(false);
  });

  test("sections is defensively copied", async () => {
    writeFile(
      "templates/sec.md",
      "---\nsections: [a, b, c]\n---\nbody\n",
    );
    const result = await loadTemplateRules("templates/sec.md", SANDBOX);
    expect(result.sections).toEqual(["a", "b", "c"]);
    // Mutating returned array should not affect internal state.
    result.sections.push("d");
    const result2 = await loadTemplateRules("templates/sec.md", SANDBOX);
    expect(result2.sections).toEqual(["a", "b", "c"]);
  });

  test("sections missing → empty array", async () => {
    writeFile("templates/nosec.md", "---\ntier: x\n---\nbody\n");
    const result = await loadTemplateRules("templates/nosec.md", SANDBOX);
    expect(result.sections).toEqual([]);
  });

  test("tier missing → null", async () => {
    writeFile("templates/notier.md", "---\nstrict: true\n---\nbody\n");
    const result = await loadTemplateRules("templates/notier.md", SANDBOX);
    expect(result.tier).toBeNull();
  });

  test("tier as non-string → null", async () => {
    writeFile("templates/badtier.md", "---\ntier: 42\n---\nbody\n");
    const result = await loadTemplateRules("templates/badtier.md", SANDBOX);
    expect(result.tier).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// loadTemplateRules — bodySchema extraction
// ────────────────────────────────────────────────────────────────────────────

describe("loadTemplateRules — bodySchema", () => {
  test("template body with section-rules → bodySchema tree", async () => {
    writeFile(
      "templates/body.md",
      [
        "---",
        "tier: full",
        "---",
        "",
        "## Section A",
        "",
        "```yaml section-rules",
        "required: true",
        "```",
        "",
        "### Sub A1",
        "",
        "```yaml section-rules",
        "repeatable: true",
        "```",
        "",
        "## Section B",
        "",
        "Content only.",
      ].join("\n"),
    );
    const result = await loadTemplateRules("templates/body.md", SANDBOX);
    expect(result.bodySchema).toHaveLength(2);
    expect(result.bodySchema[0].text).toBe("Section A");
    expect(result.bodySchema[0].sectionRules).toEqual({ required: true });
    expect(result.bodySchema[0].children).toHaveLength(1);
    expect(result.bodySchema[0].children[0].text).toBe("Sub A1");
    expect(result.bodySchema[0].children[0].sectionRules).toEqual({ repeatable: true });
    expect(result.bodySchema[1].text).toBe("Section B");
    expect(result.bodySchema[1].sectionRules).toBeNull();
  });

  test("template with no body → bodySchema is empty array", async () => {
    writeFile("templates/nobody.md", "---\ntier: x\n---\n");
    const result = await loadTemplateRules("templates/nobody.md", SANDBOX);
    expect(result.bodySchema).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// loadTemplateRules — templateErrors (meta-validation)
// ────────────────────────────────────────────────────────────────────────────

describe("loadTemplateRules — templateErrors", () => {
  test("valid template → empty templateErrors", async () => {
    writeFile(
      "templates/valid.md",
      [
        "---",
        "fields:",
        "  name:",
        "    type: string",
        "    required: true",
        "---",
        "",
        "## Section",
        "",
        "```yaml section-rules",
        "required: true",
        "```",
      ].join("\n"),
    );
    const result = await loadTemplateRules("templates/valid.md", SANDBOX);
    expect(result.templateErrors).toEqual([]);
  });

  test("unknown primitive in fields → templateErrors populated", async () => {
    writeFile(
      "templates/badfield.md",
      [
        "---",
        "fields:",
        "  name:",
        "    type: string",
        "    frobnicate: true",
        "---",
        "body",
      ].join("\n"),
    );
    const result = await loadTemplateRules("templates/badfield.md", SANDBOX);
    expect(result.templateErrors.length).toBeGreaterThan(0);
    expect(result.templateErrors[0].error_type).toBe("template-schema-invalid");
  });

  test("unknown key in section-rules → templateErrors populated", async () => {
    writeFile(
      "templates/badbody.md",
      [
        "---",
        "tier: x",
        "---",
        "",
        "## Section",
        "",
        "```yaml section-rules",
        "required: true",
        "alien_key: oops",
        "```",
      ].join("\n"),
    );
    const result = await loadTemplateRules("templates/badbody.md", SANDBOX);
    expect(result.templateErrors.length).toBeGreaterThan(0);
    const bodyError = result.templateErrors.find((e) =>
      e.message.includes("alien_key"),
    );
    expect(bodyError).toBeDefined();
    expect(bodyError.error_type).toBe("template-schema-invalid");
  });

  test("both field and body errors are concatenated", async () => {
    writeFile(
      "templates/botherrors.md",
      [
        "---",
        "fields:",
        "  x:",
        "    badprim: yes",
        "---",
        "",
        "## S",
        "",
        "```yaml section-rules",
        "unknown_rule: 1",
        "```",
      ].join("\n"),
    );
    const result = await loadTemplateRules("templates/botherrors.md", SANDBOX);
    expect(result.templateErrors.length).toBeGreaterThanOrEqual(2);
    const fieldErr = result.templateErrors.find((e) =>
      e.message.includes("badprim"),
    );
    const bodyErr = result.templateErrors.find((e) =>
      e.message.includes("unknown_rule"),
    );
    expect(fieldErr).toBeDefined();
    expect(bodyErr).toBeDefined();
  });

  test("no fields: → only body meta-validation runs", async () => {
    writeFile(
      "templates/nofieldsbody.md",
      [
        "---",
        "tier: x",
        "---",
        "",
        "## Good",
        "",
        "```yaml section-rules",
        "required: true",
        "```",
      ].join("\n"),
    );
    const result = await loadTemplateRules("templates/nofieldsbody.md", SANDBOX);
    expect(result.templateErrors).toEqual([]);
  });
});
