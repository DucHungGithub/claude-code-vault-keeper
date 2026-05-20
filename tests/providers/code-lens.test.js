/**
 * Tests for server/providers/code-lens.js
 *
 * Strategy: mock LSP connection, TextDocuments, and VaultIndex.
 * All markdown is inline strings.
 */

import { describe, test, expect } from "bun:test";

// ── Minimal mocks ─────────────────────────────────────────────────────────

function makeConnection() {
  let handler = null;
  return {
    onCodeLens(fn) { handler = fn; },
    console: { error() {} },
    async callLens(params) { return handler(params); },
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

const { register } = await import("../../server/providers/code-lens.js");

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
  return () => connection.callLens({ textDocument: { uri: URI } });
}

// ── Tests: empty doc ──────────────────────────────────────────────────────

describe("code-lens — empty doc", () => {
  test("returns [] for empty text", async () => {
    const call = setup("");
    const lenses = await call();
    expect(lenses).toEqual([]);
  });

  test("returns [] when doc not found", async () => {
    const connection = makeConnection();
    const docs = { get: () => null };
    register({ connection, docs, vaultIndex: makeVaultIndex(), projectRoot: PROJECT_ROOT });
    const lenses = await connection.callLens({ textDocument: { uri: URI } });
    expect(lenses).toEqual([]);
  });
});

// ── Tests: template: line lens ────────────────────────────────────────────

describe("code-lens — template: line", () => {
  const doc = `---
id: prd-001
template: templates/prd-template.md
status: draft
updated_at: 2026-01-01T00:00:00+07:00
---

## Acceptance Criteria

### AC1 — Basic feature — \`must\` · \`draft\`

Some description.

`;

  test("lens appears above template: line", async () => {
    const call = setup(doc, {
      vaultIndex: { backlinks: [{ source: "/a.md", line: 1 }, { source: "/b.md", line: 2 }] },
    });
    const lenses = await call();
    const templateLens = lenses.find((l) => l.command.command === "vault-keeper.openBacklinkList");
    expect(templateLens).toBeDefined();
  });

  test("template lens shows backlink count", async () => {
    const call = setup(doc, {
      vaultIndex: { backlinks: [{ source: "/a.md", line: 1 }, { source: "/b.md", line: 2 }] },
    });
    const lenses = await call();
    const templateLens = lenses.find((l) => l.command.command === "vault-keeper.openBacklinkList");
    expect(templateLens.command.title).toContain("↗ 2 backlinks");
  });

  test("template lens shows days ago when updated_at present", async () => {
    const call = setup(doc, { vaultIndex: { backlinks: [] } });
    const lenses = await call();
    const templateLens = lenses.find((l) => l.command.command === "vault-keeper.openBacklinkList");
    expect(templateLens.command.title).toMatch(/⏱ updated \d+d ago/);
  });

  test("template lens has correct range on the template: line", async () => {
    const call = setup(doc, { vaultIndex: { backlinks: [] } });
    const lenses = await call();
    const templateLens = lenses.find((l) => l.command.command === "vault-keeper.openBacklinkList");
    const lines = doc.split("\n");
    const lineIdx = lines.findIndex((l) => /^template:/.test(l));
    expect(templateLens.range.start.line).toBe(lineIdx);
    expect(templateLens.range.start.character).toBe(0);
    expect(templateLens.range.end.character).toBe(1);
  });

  test("no updated_at → days ago omitted from title", async () => {
    const docNoDate = `---
id: prd-002
template: templates/prd-template.md
status: draft
---

`;
    const call = setup(docNoDate, { vaultIndex: { backlinks: [] } });
    const lenses = await call();
    const templateLens = lenses.find((l) => l.command.command === "vault-keeper.openBacklinkList");
    expect(templateLens.command.title).not.toContain("⏱");
  });
});

// ── Tests: error resilience ───────────────────────────────────────────────

describe("code-lens — error resilience", () => {
  test("no throw on doc with no frontmatter", async () => {
    const doc = `# Heading only

## Acceptance Criteria

### AC1 — X — \`must\` · \`draft\`

`;
    const call = setup(doc, { vaultIndex: { backlinks: [] } });
    const lenses = await call();
    expect(Array.isArray(lenses)).toBe(true);
  });

  test("no throw when vaultIndex is null", async () => {
    const doc = `---
id: t-008
template: templates/task-template.md
---

## Decision Log

`;
    const connection = makeConnection();
    const docs = makeDocs(doc, URI);
    register({ connection, docs, vaultIndex: null, projectRoot: PROJECT_ROOT });
    const lenses = await connection.callLens({ textDocument: { uri: URI } });
    expect(Array.isArray(lenses)).toBe(true);
  });
});

// ── Tests: non-vault URI rejected (isVaultUri negative branch) ────────────
// Regression guard for the reject path: a lens-worthy doc that EXISTS but
// whose URI resolves OUTSIDE projectRoot must yield [] solely because of the
// isVaultUri gate (not the no-doc / empty-text paths). If the gate is removed
// this test fails (returns populated lenses).

describe("code-lens — non-vault URI rejected", () => {
  test("lens-worthy doc OUTSIDE projectRoot returns [] (relative starts with ..)", async () => {
    const outsideUri = "file:///elsewhere/test.md"; // relative("/vault", ...) → "../elsewhere/test.md"
    const lensWorthy = `---
id: prd-001
template: templates/prd-template.md
status: draft
updated_at: 2026-01-01T00:00:00+07:00
---

## Acceptance Criteria

### AC1 — Login — \`must\` · \`draft\`

Description.

`;
    const connection = makeConnection();
    const docs = { get: (u) => (u === outsideUri ? { getText: () => lensWorthy, uri: u } : null) };
    register({
      connection,
      docs,
      vaultIndex: makeVaultIndex({ backlinks: [{ source: "/a.md", line: 1 }] }),
      projectRoot: PROJECT_ROOT,
    });
    const lenses = await connection.callLens({ textDocument: { uri: outsideUri } });
    expect(lenses).toEqual([]);
  });
});
