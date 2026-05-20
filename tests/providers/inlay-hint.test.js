/**
 * Tests for server/providers/inlay-hint.js
 *
 * Strategy: mock the LSP connection, TextDocuments, and VaultIndex — no
 * filesystem access. All markdown is inline strings.
 */

import { describe, test, expect } from "bun:test";

// ── Minimal mocks ─────────────────────────────────────────────────────────

function makeConnection() {
  let handler = null;
  return {
    languages: {
      inlayHint: {
        on(fn) { handler = fn; },
      },
    },
    console: { error() {} },
    async callHint(params) { return handler(params); },
  };
}

function makeDocs(text, uri = "file:///vault/product-knowledge/test.md") {
  return {
    get(u) {
      if (u === uri) return { getText: () => text, uri: u };
      return null;
    },
  };
}

function makeVaultIndex({ backlinks = [], frontmatterMap = {} } = {}) {
  return {
    getBacklinks(_absPath) { return backlinks; },
    getFrontmatter(absPath) { return frontmatterMap[absPath] ?? null; },
  };
}

// Import the register function
const { register } = await import("../../server/providers/inlay-hint.js");

const PROJECT_ROOT = "/vault";
// Doc lives UNDER projectRoot's vault folder so isVaultUri (mirrors
// server/main.js isVaultFile — relative-to-projectRoot membership in
// vaultFolders) classifies it as a vault file. The default config's
// vaultFolders includes "product-knowledge".
const URI = "file:///vault/product-knowledge/test.md";

function setup(text, opts = {}) {
  const connection = makeConnection();
  const docs = makeDocs(text, URI);
  const vaultIndex = makeVaultIndex(opts.vaultIndex ?? {});
  register({ connection, docs, vaultIndex, projectRoot: PROJECT_ROOT });
  return (extraParams = {}) =>
    connection.callHint({ textDocument: { uri: URI }, ...extraParams });
}

// ── Tests: empty doc ──────────────────────────────────────────────────────

describe("inlay-hint — empty doc", () => {
  test("returns [] for empty text", async () => {
    const call = setup("");
    const hints = await call();
    expect(hints).toEqual([]);
  });

  test("returns [] when doc not found", async () => {
    const connection = makeConnection();
    const docs = { get: () => null };
    const vaultIndex = makeVaultIndex();
    register({ connection, docs, vaultIndex, projectRoot: PROJECT_ROOT });
    const hints = await connection.callHint({ textDocument: { uri: URI } });
    expect(hints).toEqual([]);
  });
});

// ── Tests: error resilience ───────────────────────────────────────────────

describe("inlay-hint — error resilience", () => {
  test("no throw on doc with no frontmatter", async () => {
    const doc = `# Just a heading

Some prose.

## Relationships

`;
    const call = setup(doc, { vaultIndex: { backlinks: [] } });
    const hints = await call();
    expect(Array.isArray(hints)).toBe(true);
  });

  test("no throw when vaultIndex is null", async () => {
    const doc = `---
id: t-006
---

## Relationships

- [X](./x.md)
`;
    const connection = makeConnection();
    const docs = makeDocs(doc, URI);
    register({ connection, docs, vaultIndex: null, projectRoot: PROJECT_ROOT });
    const hints = await connection.callHint({ textDocument: { uri: URI } });
    expect(Array.isArray(hints)).toBe(true);
  });
});

// ── Tests: non-vault URI rejected (isVaultUri negative branch) ────────────
// Regression guard for the reject path: a hint-worthy doc that EXISTS but
// whose URI resolves OUTSIDE projectRoot must yield [] solely because of the
// isVaultUri gate. If the gate is removed this test fails (returns hints).

describe("inlay-hint — non-vault URI rejected", () => {
  test("hint-worthy doc OUTSIDE projectRoot returns [] (relative starts with ..)", async () => {
    const outsideUri = "file:///elsewhere/test.md"; // relative("/vault", ...) → "../elsewhere/test.md"
    const hintWorthy = `---
id: t-001
status: draft
---

## Relationships

- [DIBB-001](../01-strategy/dibb-001.md)
- [PRD-001](../02-product/prd-001.md)
`;
    const connection = makeConnection();
    const docs = { get: (u) => (u === outsideUri ? { getText: () => hintWorthy, uri: u } : null) };
    register({
      connection,
      docs,
      vaultIndex: makeVaultIndex({ backlinks: [{ source: "/other.md", line: 5 }] }),
      projectRoot: PROJECT_ROOT,
    });
    const hints = await connection.callHint({ textDocument: { uri: outsideUri } });
    expect(hints).toEqual([]);
  });
});
