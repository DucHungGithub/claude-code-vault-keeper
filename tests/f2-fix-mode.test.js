/**
 * F2 — `--fix` / `--fix --write` auto-fix mode.
 *
 * Covers applyFixes() for both supported fixTypes:
 *   - 'remove-field' (template-meta-leak warnings)
 *   - 'add-field'    (required-missing errors)
 *
 * Plus an integration assertion that validateTemplateMetaLeak marks its
 * issues autoFixable=true / fixType=remove-field.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyFixes } from "../cli/validate-documents.js";
import { validateTemplateMetaLeak } from "../lib/validators.js";

let DIR;

beforeEach(() => {
  DIR = mkdtempSync(join(tmpdir(), "f2-fix-"));
});

afterEach(() => {
  rmSync(DIR, { recursive: true, force: true });
});

function writeDoc(name, content) {
  const fp = join(DIR, name);
  writeFileSync(fp, content, "utf-8");
  return fp;
}

describe("applyFixes — remove-field (template-meta-leak)", () => {
  test("removes leaked field from frontmatter (dry-run)", async () => {
    const fp = writeDoc(
      "doc.md",
      "---\ntitle: Hello\ntemplate_meta: leaked\n---\nbody\n",
    );
    const issues = [
      { autoFixable: true, fixType: "remove-field", field: "template_meta" },
    ];
    const { fixed, applied, content } = await applyFixes(fp, issues, { write: false });
    expect(fixed).toBe(1);
    expect(applied).toHaveLength(1);
    expect(content).not.toContain("template_meta");
    // dry-run: disk untouched
    expect(readFileSync(fp, "utf-8")).toContain("template_meta");
  });

  test("writes updated file when write=true", async () => {
    const fp = writeDoc(
      "doc.md",
      "---\ntitle: Hello\ntemplate_meta: leaked\n---\nbody\n",
    );
    const issues = [
      { autoFixable: true, fixType: "remove-field", field: "template_meta" },
    ];
    const { fixed } = await applyFixes(fp, issues, { write: true });
    expect(fixed).toBe(1);
    expect(readFileSync(fp, "utf-8")).not.toContain("template_meta");
  });

  test("is idempotent: second call returns fixed=0", async () => {
    const fp = writeDoc(
      "doc.md",
      "---\ntitle: Hello\ntemplate_meta: leaked\n---\nbody\n",
    );
    const issues = [
      { autoFixable: true, fixType: "remove-field", field: "template_meta" },
    ];
    await applyFixes(fp, issues, { write: true });
    const second = await applyFixes(fp, issues, { write: true });
    expect(second.fixed).toBe(0);
    expect(second.content).toBeNull();
  });

  test("returns fixed=0 when no auto-fixable issues", async () => {
    const fp = writeDoc("doc.md", "---\ntitle: Hello\n---\nbody\n");
    const issues = [{ field: "title", message: "not fixable" }];
    const { fixed, applied, content } = await applyFixes(fp, issues, { write: false });
    expect(fixed).toBe(0);
    expect(applied).toHaveLength(0);
    expect(content).toBeNull();
  });
});

describe("applyFixes — add-field (required-missing)", () => {
  test("adds missing required field with empty placeholder (dry-run)", async () => {
    const fp = writeDoc("doc.md", "---\ntitle: Hello\n---\nbody\n");
    const issues = [
      { autoFixable: true, fixType: "add-field", field: "owner", placeholder: "" },
    ];
    const { fixed, content } = await applyFixes(fp, issues, { write: false });
    expect(fixed).toBe(1);
    expect(content).toContain("owner");
    // dry-run: disk untouched
    expect(readFileSync(fp, "utf-8")).not.toContain("owner");
  });

  test("does not add $path (synthetic field)", async () => {
    const fp = writeDoc("doc.md", "---\ntitle: Hello\n---\nbody\n");
    const issues = [
      { autoFixable: true, fixType: "add-field", field: "$path", placeholder: "" },
    ];
    const { fixed, applied, content } = await applyFixes(fp, issues, { write: false });
    expect(fixed).toBe(0);
    expect(applied).toHaveLength(0);
    expect(content).toBeNull();
  });

  test("does not overwrite existing field", async () => {
    const fp = writeDoc("doc.md", "---\ntitle: Hello\nowner: alice\n---\nbody\n");
    const issues = [
      { autoFixable: true, fixType: "add-field", field: "owner", placeholder: "" },
    ];
    const { fixed, applied } = await applyFixes(fp, issues, { write: true });
    expect(fixed).toBe(0);
    expect(applied).toHaveLength(0);
    expect(readFileSync(fp, "utf-8")).toContain("owner: alice");
  });
});

describe("--fix integration (via validateTemplateMetaLeak)", () => {
  test("leaked field marked autoFixable=true, fixType=remove-field", () => {
    // findTemplateMetaLeaks reads CONFIG.templateOnlyFields against an
    // instance path. Use a leaked canonical template-only field.
    const frontmatter = { title: "Hello", template_id: "x" };
    const issues = validateTemplateMetaLeak(frontmatter, join(DIR, "doc.md"));
    expect(issues.length).toBeGreaterThan(0);
    for (const iss of issues) {
      expect(iss.autoFixable).toBe(true);
      expect(iss.fixType).toBe("remove-field");
    }
  });
});
