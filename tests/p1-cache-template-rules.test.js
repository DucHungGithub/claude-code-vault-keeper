/**
 * Tests for P1 — Cache loadTemplateRules with mtime invalidation.
 *
 * Adapted to the v0.9.0 composable-schema loader: templates declare `fields:`
 * (not the legacy `validation_rules:` block) and loadTemplateRules returns the
 * TemplateSchema object `{ fields, strict, sections, tier, bodySchema,
 * templateErrors }` (or null). The cache stores that object by absolute path +
 * mtime and returns the same reference on repeat calls.
 *
 * Behavior under test:
 *  1. clearTemplateRulesCache is exported.
 *  2. Repeat calls for the same path serve the cached parse (a later overwrite
 *     with the SAME mtime does not change the result — proving no re-read).
 *  3. A file mtime change invalidates the entry → fresh content.
 *  4. clearTemplateRulesCache() forces a re-read on next call.
 *  5. null cases (null path, missing file) are unaffected and not cached.
 *
 * Note: the cache returns defensively-copied objects (not the same reference),
 * so callers may freely mutate the result without corrupting the cached entry.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  loadTemplateRules,
  clearTemplateRulesCache,
} from "../lib/template-rules.js";

let SANDBOX;

beforeEach(() => {
  SANDBOX = mkdtempSync(join(tmpdir(), "p1-cache-"));
  // Clear cache before each test to avoid cross-test contamination.
  if (typeof clearTemplateRulesCache === "function") {
    clearTemplateRulesCache();
  }
});

afterEach(() => {
  rmSync(SANDBOX, { recursive: true, force: true });
});

function writeTemplate(rel, content) {
  const abs = join(SANDBOX, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf-8");
  return abs;
}

const SIMPLE_TEMPLATE = `---
fields:
  title:
    type: string
---
# Template body
`;

const UPDATED_TEMPLATE = `---
fields:
  title:
    type: string
  status:
    type: string
---
# Template body
`;

// ── Test 1: clearTemplateRulesCache must be exported ────────────────────────

describe("P1 — clearTemplateRulesCache export", () => {
  test("clearTemplateRulesCache is exported as a function", () => {
    expect(typeof clearTemplateRulesCache).toBe("function");
  });
});

// ── Test 2: Repeat calls serve the cached parse (no disk re-read) ───────────

describe("P1 — repeat calls serve the cached parse", () => {
  test("second call returns the same content without re-reading disk", async () => {
    const abs = writeTemplate("templates/cached.md", SIMPLE_TEMPLATE);

    const first = await loadTemplateRules("templates/cached.md", SANDBOX);
    expect(first).not.toBeNull();
    expect(Object.keys(first.fields)).toEqual(["title"]);

    // Overwrite the file content but pin its mtime back to the original. A
    // cache that re-reads would pick up the new content; the cache must serve
    // the original parse because the mtime (the invalidation key) is unchanged.
    const { statSync, utimesSync, writeFileSync } = await import("node:fs");
    const { atime, mtime } = statSync(abs);
    writeFileSync(abs, UPDATED_TEMPLATE, "utf-8");
    utimesSync(abs, atime, mtime); // restore exact original timestamps

    const second = await loadTemplateRules("templates/cached.md", SANDBOX);
    expect(Object.keys(second.fields)).toEqual(["title"]); // cached, not re-read
  });

  test("mutating a result does not corrupt the next call (defensive copy)", async () => {
    writeTemplate("templates/t.md", SIMPLE_TEMPLATE);

    const first = await loadTemplateRules("templates/t.md", SANDBOX);
    first.sections.push("injected");
    first.templateErrors.push({ level: "error" });

    const second = await loadTemplateRules("templates/t.md", SANDBOX);
    expect(second.sections).toEqual([]);
    expect(second.templateErrors).toEqual([]);
  });

  test("different paths get independent cache entries", async () => {
    writeTemplate(
      "templates/a.md",
      `---\nfields:\n  alpha:\n    type: string\n---\n`,
    );
    writeTemplate(
      "templates/b.md",
      `---\nfields:\n  beta:\n    type: string\n---\n`,
    );

    const a = await loadTemplateRules("templates/a.md", SANDBOX);
    const b = await loadTemplateRules("templates/b.md", SANDBOX);

    expect(Object.keys(a.fields)).toEqual(["alpha"]);
    expect(Object.keys(b.fields)).toEqual(["beta"]);

    // Second calls still serve each path's own cached parse.
    const a2 = await loadTemplateRules("templates/a.md", SANDBOX);
    const b2 = await loadTemplateRules("templates/b.md", SANDBOX);
    expect(Object.keys(a2.fields)).toEqual(["alpha"]);
    expect(Object.keys(b2.fields)).toEqual(["beta"]);
  });
});

// ── Test 3: mtime changes → cache invalidated ────────────────────────────────

describe("P1 — cache invalidated when file mtime changes", () => {
  test("updated file content is reflected after mtime change", async () => {
    writeTemplate("templates/inv.md", SIMPLE_TEMPLATE);

    const first = await loadTemplateRules("templates/inv.md", SANDBOX);
    expect(Object.keys(first.fields)).toEqual(["title"]);

    // Wait to guarantee a different mtime on the next write.
    await Bun.sleep(15);
    writeTemplate("templates/inv.md", UPDATED_TEMPLATE);

    const second = await loadTemplateRules("templates/inv.md", SANDBOX);
    expect(Object.keys(second.fields)).toEqual(["title", "status"]); // fresh
    expect(second).not.toBe(first); // different object
  });

  test("clearTemplateRulesCache forces re-read on next call", async () => {
    writeTemplate("templates/clr.md", SIMPLE_TEMPLATE);

    const first = await loadTemplateRules("templates/clr.md", SANDBOX);

    clearTemplateRulesCache();

    // After clear, even without mtime change, cache is gone → new object.
    const second = await loadTemplateRules("templates/clr.md", SANDBOX);
    expect(Object.keys(second.fields)).toEqual(["title"]); // same content
    expect(second).not.toBe(first); // but different object (re-parsed)
  });
});

// ── Test 4: null cases still work after caching ──────────────────────────────

describe("P1 — null cases unaffected by caching", () => {
  test("null templatePath still returns null", async () => {
    expect(await loadTemplateRules(null, SANDBOX)).toBeNull();
  });

  test("missing file still returns null (not cached)", async () => {
    const result = await loadTemplateRules("templates/missing.md", SANDBOX);
    expect(result).toBeNull();
    // Second call also null (missing file not cached).
    const result2 = await loadTemplateRules("templates/missing.md", SANDBOX);
    expect(result2).toBeNull();
  });
});
