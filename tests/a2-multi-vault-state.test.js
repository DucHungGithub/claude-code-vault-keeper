/**
 * TDD tests for A2 — Fix _bundleMismatchMap mutable module state
 *
 * Problem: loadContentTemplateBundlePatterns caches patterns in a module-level
 * variable (_bundleTemplatePatternsCache). When validateDocument is called
 * with vault A then vault B, vault B gets vault A's cached bundle patterns.
 *
 * Red criteria (before fix):
 *  - clearBundleStateCaches not exported → import fails
 *  - loadContentTemplateBundlePatterns caches ignore projectRoot (bug)
 *
 * Green criteria (after fix):
 *  - clearBundleStateCaches() exported and callable
 *  - Cache keyed by projectRoot — different roots get independent caches
 *  - Calling with vault A then vault B returns vault B's patterns (not A's)
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

// These are the internal exports we're adding as part of the fix
import {
  loadContentTemplateBundlePatterns,
  clearBundleStateCaches,
} from "../cli/validate-documents.js";

let VAULT_A, VAULT_B;

beforeEach(() => {
  VAULT_A = mkdtempSync(join(tmpdir(), "vault-a-"));
  VAULT_B = mkdtempSync(join(tmpdir(), "vault-b-"));
  if (typeof clearBundleStateCaches === "function") {
    clearBundleStateCaches();
  }
});

afterEach(() => {
  rmSync(VAULT_A, { recursive: true, force: true });
  rmSync(VAULT_B, { recursive: true, force: true });
});

function writeFile(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf-8");
}

// v0.9.0 composable schema: the path pattern lives in `fields.$path.pattern`.
// loadContentTemplateBundlePatterns only collects templates whose pattern
// advertises bundle support (contains a `/README\.md` alternative).
//
// Use single-quoted YAML: in single-quoted YAML strings, backslash is NOT
// a special character, so '\.' is a literal backslash + period. Double-quoted
// YAML would require '\\.' but js-yaml throws on unknown escapes like '\.'.
const BUNDLE_TEMPLATE = `---
fields:
  $path:
    pattern: '^docs/prds/[^/]+\\.md$|^docs/prds/[^/]+/README\\.md$'
---
`;

// A flat-only content template — has a $path pattern but NO /README.md
// alternative, so it must NOT be collected as a bundle pattern.
const SIMPLE_TEMPLATE = `---
fields:
  $path:
    pattern: '^docs/notes/[^/]+\\.md$'
---
`;

// ── Export contract ───────────────────────────────────────────────────────────

describe("A2 — exports", () => {
  test("clearBundleStateCaches is exported as a function", () => {
    expect(typeof clearBundleStateCaches).toBe("function");
  });

  test("loadContentTemplateBundlePatterns is exported as a function", () => {
    expect(typeof loadContentTemplateBundlePatterns).toBe("function");
  });
});

// ── Per-projectRoot cache isolation ──────────────────────────────────────────

describe("A2 — cache isolated per projectRoot", () => {
  test("vault with bundle template → returns patterns", async () => {
    writeFile(VAULT_A, "templates/prd-template.md", BUNDLE_TEMPLATE);

    const patterns = await loadContentTemplateBundlePatterns(VAULT_A);

    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].template).toContain("prd-template");
    expect(patterns[0].regex).toBeInstanceOf(RegExp);
  });

  test("vault with no bundle templates → returns empty array", async () => {
    writeFile(VAULT_B, "templates/simple-template.md", SIMPLE_TEMPLATE);

    const patterns = await loadContentTemplateBundlePatterns(VAULT_B);

    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns).toHaveLength(0);
  });

  test("calling vault A then vault B returns B's patterns (not A's cached)", async () => {
    writeFile(VAULT_A, "templates/prd-template.md", BUNDLE_TEMPLATE);
    writeFile(VAULT_B, "templates/simple-template.md", SIMPLE_TEMPLATE);

    // Prime cache with vault A
    const patternsA = await loadContentTemplateBundlePatterns(VAULT_A);
    expect(patternsA.length).toBeGreaterThan(0);

    // Vault B must return its own (empty) patterns, not vault A's
    const patternsB = await loadContentTemplateBundlePatterns(VAULT_B);
    expect(patternsB).toHaveLength(0); // FAILS before fix (returns vault A patterns)
  });

  test("calling vault B then vault A returns A's patterns (independent)", async () => {
    writeFile(VAULT_A, "templates/prd-template.md", BUNDLE_TEMPLATE);
    writeFile(VAULT_B, "templates/simple-template.md", SIMPLE_TEMPLATE);

    // Prime cache with vault B first
    const patternsB = await loadContentTemplateBundlePatterns(VAULT_B);
    expect(patternsB).toHaveLength(0);

    // Vault A must still scan and find its bundle template
    const patternsA = await loadContentTemplateBundlePatterns(VAULT_A);
    expect(patternsA.length).toBeGreaterThan(0); // FAILS before fix (vault B cache returned)
  });

  test("same vault called twice → returns cached object (same reference)", async () => {
    writeFile(VAULT_A, "templates/prd-template.md", BUNDLE_TEMPLATE);

    const first = await loadContentTemplateBundlePatterns(VAULT_A);
    const second = await loadContentTemplateBundlePatterns(VAULT_A);

    // Cache should return same array reference
    expect(first).toBe(second);
  });
});

// ── clearBundleStateCaches ────────────────────────────────────────────────────

describe("A2 — clearBundleStateCaches()", () => {
  test("clear all caches → next call re-scans", async () => {
    writeFile(VAULT_A, "templates/prd-template.md", BUNDLE_TEMPLATE);

    const first = await loadContentTemplateBundlePatterns(VAULT_A);
    expect(first.length).toBeGreaterThan(0);

    clearBundleStateCaches();

    // After clear, re-scan should return a new (non-identical) array
    const second = await loadContentTemplateBundlePatterns(VAULT_A);
    expect(second.length).toBeGreaterThan(0);
    expect(second).not.toBe(first); // re-parsed, different reference
  });

  test("clear by specific root → only that root is invalidated", async () => {
    writeFile(VAULT_A, "templates/prd-template.md", BUNDLE_TEMPLATE);
    writeFile(VAULT_B, "templates/simple-template.md", SIMPLE_TEMPLATE);

    const cacheA = await loadContentTemplateBundlePatterns(VAULT_A);
    const cacheB = await loadContentTemplateBundlePatterns(VAULT_B);

    // Clear vault B only
    clearBundleStateCaches(VAULT_B);

    // Vault A cache still intact (same reference)
    const cacheA2 = await loadContentTemplateBundlePatterns(VAULT_A);
    expect(cacheA2).toBe(cacheA);

    // Vault B re-scanned (new reference)
    const cacheB2 = await loadContentTemplateBundlePatterns(VAULT_B);
    expect(cacheB2).not.toBe(cacheB);
  });
});
