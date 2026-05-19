/**
 * TDD tests for P1 — Cache loadTemplateRules với mtime invalidation
 *
 * Red criteria:
 *  1. clearTemplateRulesCache không tồn tại → undefined
 *  2. loadTemplateRules gọi 2 lần cùng path → trả 2 object khác nhau (no cache)
 *
 * Green criteria:
 *  1. clearTemplateRulesCache export được
 *  2. Gọi 2 lần → same object reference (===)
 *  3. File thay đổi (mtime mới) → cache invalidated, rules mới được trả về
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
  // Clear cache trước mỗi test để tránh cross-test contamination
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
validation_rules:
  required_fields: [title]
---
# Template body
`;

const UPDATED_TEMPLATE = `---
validation_rules:
  required_fields: [title, status]
---
# Template body
`;

// ── Test 1: clearTemplateRulesCache must be exported ────────────────────────

describe("P1 — clearTemplateRulesCache export", () => {
  test("clearTemplateRulesCache is exported as a function", () => {
    expect(typeof clearTemplateRulesCache).toBe("function");
  });
});

// ── Test 2: Same path → same object reference (cache hit) ───────────────────

describe("P1 — cache returns same reference on repeat calls", () => {
  test("second call returns identical object reference (===)", async () => {
    writeTemplate("templates/cached.md", SIMPLE_TEMPLATE);

    const first = await loadTemplateRules("templates/cached.md", SANDBOX);
    const second = await loadTemplateRules("templates/cached.md", SANDBOX);

    // Without cache: two separate parsed objects → not ===
    // With cache: same object returned → ===
    expect(first).not.toBeNull();
    expect(first).toBe(second); // identity, not just equality
  });

  test("third call also returns same reference", async () => {
    writeTemplate("templates/t.md", SIMPLE_TEMPLATE);

    const first = await loadTemplateRules("templates/t.md", SANDBOX);
    const second = await loadTemplateRules("templates/t.md", SANDBOX);
    const third = await loadTemplateRules("templates/t.md", SANDBOX);

    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  test("different paths get independent cache entries", async () => {
    writeTemplate("templates/a.md", `---\nvalidation_rules:\n  required_fields: [alpha]\n---`);
    writeTemplate("templates/b.md", `---\nvalidation_rules:\n  required_fields: [beta]\n---`);

    const a = await loadTemplateRules("templates/a.md", SANDBOX);
    const b = await loadTemplateRules("templates/b.md", SANDBOX);

    expect(a.required_fields).toEqual(["alpha"]);
    expect(b.required_fields).toEqual(["beta"]);
    expect(a).not.toBe(b);

    // Second calls still hit their respective caches
    const a2 = await loadTemplateRules("templates/a.md", SANDBOX);
    const b2 = await loadTemplateRules("templates/b.md", SANDBOX);
    expect(a).toBe(a2);
    expect(b).toBe(b2);
  });
});

// ── Test 3: mtime changes → cache invalidated ────────────────────────────────

describe("P1 — cache invalidated when file mtime changes", () => {
  test("updated file content is reflected after mtime change", async () => {
    writeTemplate("templates/inv.md", SIMPLE_TEMPLATE);

    const first = await loadTemplateRules("templates/inv.md", SANDBOX);
    expect(first.required_fields).toEqual(["title"]);

    // Wait to guarantee different mtime on next write
    await Bun.sleep(15);
    writeTemplate("templates/inv.md", UPDATED_TEMPLATE);

    const second = await loadTemplateRules("templates/inv.md", SANDBOX);
    expect(second.required_fields).toEqual(["title", "status"]); // fresh rules
    expect(second).not.toBe(first); // different object
  });

  test("clearTemplateRulesCache forces re-read on next call", async () => {
    writeTemplate("templates/clr.md", SIMPLE_TEMPLATE);

    const first = await loadTemplateRules("templates/clr.md", SANDBOX);

    clearTemplateRulesCache();

    // After clear, even without mtime change, cache is gone → new object
    const second = await loadTemplateRules("templates/clr.md", SANDBOX);
    expect(second.required_fields).toEqual(["title"]); // same content
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
    // Second call also null (missing file not cached)
    const result2 = await loadTemplateRules("templates/missing.md", SANDBOX);
    expect(result2).toBeNull();
  });
});
