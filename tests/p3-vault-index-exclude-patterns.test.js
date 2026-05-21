/**
 * TDD tests for P3 — Honor excludePatterns in VaultIndex._walkDir
 *
 * Problem: _walkDir has a hardcoded SKIP set (codebase, node_modules, .git,
 * .omc) but never reads excludePatterns from vault-keeper.json. Docs in
 * user-configured excluded folders (e.g. archive/) still appear in the LSP
 * index even though the CLI correctly filters them out.
 *
 * Red criteria (before fix):
 *  - Docs inside archive/ appear in search() despite excludePatterns config
 *  - getBacklinks() includes links from excluded docs
 *
 * Green criteria (after fix):
 *  - Docs whose repo-relative path matches any excludePattern are skipped
 *  - Hardcoded SKIP set still applies (node_modules, .git, codebase, .omc)
 *  - Docs outside excluded folders are still indexed normally
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { VaultIndex } from "../server/vault-index.js";

let tmp;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vk-p3-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeDoc(root, rel, fm = {}, body = "") {
  const abs = join(root, rel);
  mkdirSync(abs.replace(/\/[^/]+$/, ""), { recursive: true });
  const fmLines = Object.entries(fm)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  const content = fmLines ? `---\n${fmLines}\n---\n${body}` : body;
  writeFileSync(abs, content, "utf-8");
}

function writeVaultConfig(root, config) {
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "vault-keeper.json"),
    JSON.stringify(config),
    "utf-8",
  );
}

// ── excludePatterns from vault config ────────────────────────────────────────

describe("P3 — excludePatterns respected in VaultIndex", () => {
  test("docs in excluded folder do not appear in search()", async () => {
    writeVaultConfig(tmp, { excludePatterns: ["**/archive/**"] });

    writeDoc(tmp, "docs/active.md", { title: "Active Doc" });
    writeDoc(tmp, "docs/archive/old.md", { title: "Old Archived Doc" });

    const index = new VaultIndex(tmp);
    await index.ensureLoaded();

    const hits = index.search("doc");
    const titles = hits.map((h) => h.name);

    expect(titles).toContain("Active Doc");
    expect(titles).not.toContain("Old Archived Doc"); // FAILS before fix
  });

  test("docs in excluded folder do not appear in allEntries()", async () => {
    writeVaultConfig(tmp, { excludePatterns: ["**/archive/**"] });

    writeDoc(tmp, "notes/keep.md", { title: "Keep" });
    writeDoc(tmp, "notes/archive/discard.md", { title: "Discard" });

    const index = new VaultIndex(tmp);
    await index.ensureLoaded();

    const paths = index.allEntries().map((e) => e.absPath);
    expect(paths.some((p) => p.includes("keep.md"))).toBe(true);
    expect(paths.some((p) => p.includes("discard.md"))).toBe(false); // FAILS before fix
  });

  test("links from excluded docs are not in backlink graph", async () => {
    writeVaultConfig(tmp, { excludePatterns: ["**/archive/**"] });

    writeDoc(tmp, "docs/target.md", { title: "Target" });
    // Archived doc links to target — should NOT create a backlink
    writeDoc(
      tmp,
      "docs/archive/linker.md",
      { title: "Linker" },
      "[target](../target.md)",
    );

    const index = new VaultIndex(tmp);
    await index.ensureLoaded();

    const targetAbs = join(tmp, "docs/target.md");
    const backlinks = index.getBacklinks(targetAbs);
    const sources = backlinks.map((b) => b.source);

    expect(sources.some((s) => s.includes("linker.md"))).toBe(false); // FAILS before fix
  });

  test("multiple exclude patterns all apply", async () => {
    writeVaultConfig(tmp, {
      excludePatterns: ["**/archive/**", "**/drafts/**"],
    });

    writeDoc(tmp, "docs/published.md", { title: "Published" });
    writeDoc(tmp, "docs/archive/old.md", { title: "Archived" });
    writeDoc(tmp, "docs/drafts/wip.md", { title: "Draft" });

    const index = new VaultIndex(tmp);
    await index.ensureLoaded();

    const titles = index.allEntries().map((e) => e.title);
    expect(titles).toContain("Published");
    expect(titles).not.toContain("Archived");
    expect(titles).not.toContain("Draft");
  });

  test("no excludePatterns config → all docs indexed", async () => {
    // No vault-keeper.json → use defaults (no custom excludes beyond SKIP set)
    writeDoc(tmp, "docs/a.md", { title: "A" });
    writeDoc(tmp, "docs/b.md", { title: "B" });

    const index = new VaultIndex(tmp);
    await index.ensureLoaded();

    const titles = index.allEntries().map((e) => e.title);
    expect(titles).toContain("A");
    expect(titles).toContain("B");
  });
});

// ── Hardcoded SKIP set still applies ─────────────────────────────────────────

describe("P3 — hardcoded SKIP set preserved", () => {
  test("node_modules/ never indexed regardless of config", async () => {
    writeDoc(tmp, "node_modules/pkg/README.md", { title: "Pkg Readme" });
    writeDoc(tmp, "docs/real.md", { title: "Real" });

    const index = new VaultIndex(tmp);
    await index.ensureLoaded();

    const titles = index.allEntries().map((e) => e.title);
    expect(titles).not.toContain("Pkg Readme");
    expect(titles).toContain("Real");
  });
});
