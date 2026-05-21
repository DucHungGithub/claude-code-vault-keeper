/**
 * TDD tests for F1 — Orphan document detection
 *
 * Problem: VaultIndex._incoming backlink graph is already built, but there is
 * no API or CLI flag to surface docs with zero incoming links (orphans).
 *
 * Red criteria (before fix):
 *  - findOrphans is not exported → import fails
 *
 * Green criteria (after fix):
 *  - findOrphans(root) returns repo-relative paths of docs with no backlinks
 *  - Template files (templates/*.md) are never reported as orphans
 *  - Docs with no_orphan_check: true are excluded
 *  - Docs that have at least one incoming link are not reported
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findOrphans } from "../cli/validate-documents.js";

let tmp;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vk-f1-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeDoc(root, rel, frontmatter = {}, body = "") {
  const abs = join(root, rel);
  mkdirSync(abs.replace(/\/[^/]+$/, ""), { recursive: true });
  const fmLines = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");
  const content = fmLines ? `---\n${fmLines}\n---\n${body}` : body;
  writeFileSync(abs, content, "utf-8");
}

// ── Export contract ───────────────────────────────────────────────────────────

describe("F1 — exports", () => {
  test("findOrphans is exported as a function", () => {
    expect(typeof findOrphans).toBe("function");
  });
});

// ── Basic orphan detection ────────────────────────────────────────────────────

describe("F1 — basic orphan detection", () => {
  test("doc with no incoming links is reported as orphan", async () => {
    writeDoc(tmp, "docs/alone.md", { title: "Alone" });

    const orphans = await findOrphans(tmp);
    expect(orphans.some((p) => p.includes("alone.md"))).toBe(true);
  });

  test("doc linked from another doc is NOT orphan", async () => {
    writeDoc(tmp, "docs/target.md", { title: "Target" });
    writeDoc(
      tmp,
      "docs/linker.md",
      { title: "Linker" },
      "[target](target.md)",
    );

    const orphans = await findOrphans(tmp);
    // target.md has one incoming link (from linker.md) → not orphan
    expect(orphans.some((p) => p.includes("target.md"))).toBe(false);
    // linker.md has no incoming links → orphan
    expect(orphans.some((p) => p.includes("linker.md"))).toBe(true);
  });

  test("vault with all docs linked → empty orphan list", async () => {
    // a links to b, b links to a → both have backlinks
    writeDoc(tmp, "docs/a.md", { title: "A" }, "[b](b.md)");
    writeDoc(tmp, "docs/b.md", { title: "B" }, "[a](a.md)");

    const orphans = await findOrphans(tmp);
    expect(orphans.some((p) => p.includes("a.md"))).toBe(false);
    expect(orphans.some((p) => p.includes("b.md"))).toBe(false);
  });

  test("correctly counts 3 orphans in 5-doc vault", async () => {
    // hub.md links to spoke-a and spoke-b
    writeDoc(tmp, "docs/hub.md", { title: "Hub" }, "[a](spoke-a.md) [b](spoke-b.md)");
    writeDoc(tmp, "docs/spoke-a.md", { title: "Spoke A" }); // linked from hub
    writeDoc(tmp, "docs/spoke-b.md", { title: "Spoke B" }); // linked from hub
    writeDoc(tmp, "docs/orphan-1.md", { title: "Orphan 1" });
    writeDoc(tmp, "docs/orphan-2.md", { title: "Orphan 2" });
    // hub itself has no incoming links → orphan too

    const orphans = await findOrphans(tmp);
    // hub, orphan-1, orphan-2 are orphans (spoke-a, spoke-b have backlinks from hub)
    expect(orphans.some((p) => p.includes("hub.md"))).toBe(true);
    expect(orphans.some((p) => p.includes("orphan-1.md"))).toBe(true);
    expect(orphans.some((p) => p.includes("orphan-2.md"))).toBe(true);
    expect(orphans.some((p) => p.includes("spoke-a.md"))).toBe(false);
    expect(orphans.some((p) => p.includes("spoke-b.md"))).toBe(false);
  });
});

// ── Template files excluded ───────────────────────────────────────────────────

describe("F1 — template files not reported as orphans", () => {
  test("templates/*.md are never orphans regardless of link count", async () => {
    // Template file with no incoming links — should be excluded from orphan report
    writeDoc(tmp, "templates/note-template.md", {
      template_path: "templates/note-template.md",
    });
    writeDoc(tmp, "docs/real.md", { title: "Real" });

    const orphans = await findOrphans(tmp);
    expect(orphans.some((p) => p.includes("note-template.md"))).toBe(false);
  });
});

// ── no_orphan_check opt-out ───────────────────────────────────────────────────

describe("F1 — no_orphan_check frontmatter opt-out", () => {
  test("doc with no_orphan_check: true is excluded even with no backlinks", async () => {
    writeDoc(tmp, "docs/standalone.md", {
      title: "Standalone",
      no_orphan_check: true,
    });
    writeDoc(tmp, "docs/normal.md", { title: "Normal" });

    const orphans = await findOrphans(tmp);
    expect(orphans.some((p) => p.includes("standalone.md"))).toBe(false);
    // normal.md has no backlinks and no opt-out → should be orphan
    expect(orphans.some((p) => p.includes("normal.md"))).toBe(true);
  });
});

// ── Empty vault ───────────────────────────────────────────────────────────────

describe("F1 — edge cases", () => {
  test("empty vault → empty orphan list", async () => {
    const orphans = await findOrphans(tmp);
    expect(orphans).toEqual([]);
  });
});
