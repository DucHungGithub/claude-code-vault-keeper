/**
 * Tests for generic markdown shape parsers (lib/body-shapes.js). Pure tests — no I/O.
 *
 * Covers: parseHeadingTree (flat, nested, mixed depths, empty, pre-heading content),
 *         parseTable (headers, rows, empty, non-table),
 *         parseList (items, lines, empty, non-list),
 *         findCodeFences (lang, value, multiple, empty, non-code).
 */

import { describe, test, expect } from "bun:test";
import {
  parseHeadingTree,
  parseTable,
  parseList,
  findCodeFences,
} from "../lib/body-shapes.js";

// ────────────────────────────────────────────────────────────────────────────
// parseHeadingTree
// ────────────────────────────────────────────────────────────────────────────

describe("parseHeadingTree", () => {
  test("empty string → virtual root with no children", () => {
    const root = parseHeadingTree("");
    expect(root.depth).toBe(0);
    expect(root.text).toBe("");
    expect(root.children).toHaveLength(0);
    expect(root.contentNodes).toHaveLength(0);
  });

  test("null input → virtual root with no children", () => {
    const root = parseHeadingTree(null);
    expect(root.depth).toBe(0);
    expect(root.children).toHaveLength(0);
  });

  test("undefined input → virtual root with no children", () => {
    const root = parseHeadingTree(undefined);
    expect(root.depth).toBe(0);
    expect(root.children).toHaveLength(0);
  });

  test("only prose (no headings) → content on virtual root", () => {
    const root = parseHeadingTree("Hello world\n\nSome paragraph.");
    expect(root.depth).toBe(0);
    expect(root.children).toHaveLength(0);
    expect(root.contentNodes.length).toBeGreaterThan(0);
  });

  test("single H2 heading with content", () => {
    const md = "## Overview\n\nSome content here.";
    const root = parseHeadingTree(md);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].depth).toBe(2);
    expect(root.children[0].text).toBe("Overview");
    expect(root.children[0].line).toBe(1);
    expect(root.children[0].contentNodes.length).toBeGreaterThan(0);
    expect(root.children[0].children).toHaveLength(0);
  });

  test("two sibling H2 headings", () => {
    const md = "## First\n\nContent A.\n\n## Second\n\nContent B.";
    const root = parseHeadingTree(md);
    expect(root.children).toHaveLength(2);
    expect(root.children[0].text).toBe("First");
    expect(root.children[1].text).toBe("Second");
    // Each has its own content
    expect(root.children[0].contentNodes.length).toBeGreaterThan(0);
    expect(root.children[1].contentNodes.length).toBeGreaterThan(0);
  });

  test("nested H3 under H2", () => {
    const md = "## Parent\n\n### Child\n\nChild content.";
    const root = parseHeadingTree(md);
    expect(root.children).toHaveLength(1);
    const parent = root.children[0];
    expect(parent.text).toBe("Parent");
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].text).toBe("Child");
    expect(parent.children[0].depth).toBe(3);
  });

  test("deeply nested H2 > H3 > H4", () => {
    const md = "## A\n\n### B\n\n#### C\n\nDeep content.";
    const root = parseHeadingTree(md);
    expect(root.children).toHaveLength(1);
    const a = root.children[0];
    expect(a.text).toBe("A");
    expect(a.children).toHaveLength(1);
    const b = a.children[0];
    expect(b.text).toBe("B");
    expect(b.children).toHaveLength(1);
    const c = b.children[0];
    expect(c.text).toBe("C");
    expect(c.contentNodes.length).toBeGreaterThan(0);
  });

  test("H3 after H2 then another H2 → H3 is child of first H2", () => {
    const md = "## X\n\n### Y\n\n## Z\n";
    const root = parseHeadingTree(md);
    expect(root.children).toHaveLength(2);
    expect(root.children[0].text).toBe("X");
    expect(root.children[0].children).toHaveLength(1);
    expect(root.children[0].children[0].text).toBe("Y");
    expect(root.children[1].text).toBe("Z");
    expect(root.children[1].children).toHaveLength(0);
  });

  test("content before first heading → on virtual root", () => {
    const md = "Intro paragraph.\n\n## Section\n\nBody.";
    const root = parseHeadingTree(md);
    expect(root.contentNodes.length).toBeGreaterThan(0);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].text).toBe("Section");
  });

  test("heading with no content → empty contentNodes", () => {
    const md = "## Empty\n\n## Next\n\nContent.";
    const root = parseHeadingTree(md);
    expect(root.children).toHaveLength(2);
    expect(root.children[0].text).toBe("Empty");
    expect(root.children[0].contentNodes).toHaveLength(0);
    expect(root.children[1].contentNodes.length).toBeGreaterThan(0);
  });

  test("multiple H3s under one H2", () => {
    const md = "## Parent\n\n### A\n\nA content.\n\n### B\n\nB content.\n\n### C\n\nC content.";
    const root = parseHeadingTree(md);
    expect(root.children).toHaveLength(1);
    const parent = root.children[0];
    expect(parent.children).toHaveLength(3);
    expect(parent.children[0].text).toBe("A");
    expect(parent.children[1].text).toBe("B");
    expect(parent.children[2].text).toBe("C");
  });

  test("H3 without preceding H2 → child of virtual root", () => {
    const md = "### Orphan H3\n\nContent.";
    const root = parseHeadingTree(md);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].depth).toBe(3);
    expect(root.children[0].text).toBe("Orphan H3");
  });

  test("line numbers are 1-indexed and body-relative", () => {
    const md = "## First\n\nParagraph.\n\n## Second\n\nMore.";
    const root = parseHeadingTree(md);
    expect(root.children[0].line).toBe(1);
    // Second heading starts after blank line + paragraph + blank line
    expect(root.children[1].line).toBeGreaterThan(1);
  });

  test("heading with inline formatting preserves text", () => {
    const md = "## Section with **bold** and `code`\n\nContent.";
    const root = parseHeadingTree(md);
    expect(root.children[0].text).toBe("Section with bold and code");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// parseTable
// ────────────────────────────────────────────────────────────────────────────

describe("parseTable", () => {
  test("null input → null", () => {
    expect(parseTable(null)).toBeNull();
  });

  test("non-table node → null", () => {
    expect(parseTable({ type: "paragraph" })).toBeNull();
  });

  test("table node with no rows → null", () => {
    expect(parseTable({ type: "table", children: [] })).toBeNull();
  });

  test("valid GFM table — headers + rows", () => {
    // Build a table AST from markdown
    const md = "| Name | Value |\n|---|---|\n| alpha | 10 |\n| beta | 20 |";
    const tree = parseHeadingTree(md);
    // Table is a content node on the virtual root
    const tableNode = tree.contentNodes.find((n) => n.type === "table");
    expect(tableNode).toBeDefined();

    const result = parseTable(tableNode);
    expect(result).not.toBeNull();
    expect(result.headers).toEqual(["name", "value"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(["alpha", "10"]);
    expect(result.rows[1]).toEqual(["beta", "20"]);
  });

  test("headers are lowercased and trimmed", () => {
    const md = "|  Key  |  Val  |\n|---|---|\n| a | 1 |";
    const tree = parseHeadingTree(md);
    const tableNode = tree.contentNodes.find((n) => n.type === "table");
    const result = parseTable(tableNode);
    expect(result.headers).toEqual(["key", "val"]);
  });

  test("row cells are trimmed", () => {
    const md = "| H |\n|---|\n|  spaced  |";
    const tree = parseHeadingTree(md);
    const tableNode = tree.contentNodes.find((n) => n.type === "table");
    const result = parseTable(tableNode);
    expect(result.rows[0][0]).toBe("spaced");
  });

  test("header-only table (no data rows) → empty rows array", () => {
    const md = "| H1 | H2 |\n|---|---|";
    const tree = parseHeadingTree(md);
    const tableNode = tree.contentNodes.find((n) => n.type === "table");
    const result = parseTable(tableNode);
    expect(result).not.toBeNull();
    expect(result.headers).toEqual(["h1", "h2"]);
    expect(result.rows).toHaveLength(0);
  });

  test("line number is present", () => {
    const md = "Some text.\n\n| H |\n|---|\n| v |";
    const tree = parseHeadingTree(md);
    const tableNode = tree.contentNodes.find((n) => n.type === "table");
    const result = parseTable(tableNode);
    expect(typeof result.line).toBe("number");
    expect(result.line).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// parseList
// ────────────────────────────────────────────────────────────────────────────

describe("parseList", () => {
  test("null input → null", () => {
    expect(parseList(null)).toBeNull();
  });

  test("non-list node → null", () => {
    expect(parseList({ type: "paragraph" })).toBeNull();
  });

  test("valid unordered list → items with text and line", () => {
    const md = "- Alpha\n- Beta\n- Gamma";
    const tree = parseHeadingTree(md);
    const listNode = tree.contentNodes.find((n) => n.type === "list");
    expect(listNode).toBeDefined();

    const result = parseList(listNode);
    expect(result).not.toBeNull();
    expect(result.items).toHaveLength(3);
    expect(result.items[0].text).toBe("Alpha");
    expect(result.items[1].text).toBe("Beta");
    expect(result.items[2].text).toBe("Gamma");
  });

  test("ordered list works", () => {
    const md = "1. First\n2. Second";
    const tree = parseHeadingTree(md);
    const listNode = tree.contentNodes.find((n) => n.type === "list");
    const result = parseList(listNode);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].text).toBe("First");
  });

  test("items have line numbers", () => {
    const md = "- A\n- B\n- C";
    const tree = parseHeadingTree(md);
    const listNode = tree.contentNodes.find((n) => n.type === "list");
    const result = parseList(listNode);
    for (const item of result.items) {
      expect(typeof item.line).toBe("number");
      expect(item.line).toBeGreaterThan(0);
    }
  });

  test("items are trimmed", () => {
    const md = "-   padded item  ";
    const tree = parseHeadingTree(md);
    const listNode = tree.contentNodes.find((n) => n.type === "list");
    const result = parseList(listNode);
    expect(result.items[0].text).toBe("padded item");
  });

  test("empty list node → empty items array", () => {
    const result = parseList({ type: "list", children: [] });
    expect(result).not.toBeNull();
    expect(result.items).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// findCodeFences
// ────────────────────────────────────────────────────────────────────────────

describe("findCodeFences", () => {
  test("null/undefined input → empty array", () => {
    expect(findCodeFences(null)).toEqual([]);
    expect(findCodeFences(undefined)).toEqual([]);
  });

  test("no code nodes → empty array", () => {
    const md = "Just a paragraph.";
    const tree = parseHeadingTree(md);
    expect(findCodeFences(tree.contentNodes)).toEqual([]);
  });

  test("single fenced code block with language", () => {
    const md = "```yaml\nkey: value\n```";
    const tree = parseHeadingTree(md);
    const fences = findCodeFences(tree.contentNodes);
    expect(fences).toHaveLength(1);
    expect(fences[0].lang).toBe("yaml");
    expect(fences[0].value).toBe("key: value");
    expect(typeof fences[0].line).toBe("number");
  });

  test("fenced code block without language → lang is null", () => {
    const md = "```\nsome code\n```";
    const tree = parseHeadingTree(md);
    const fences = findCodeFences(tree.contentNodes);
    expect(fences).toHaveLength(1);
    expect(fences[0].lang).toBeNull();
    expect(fences[0].value).toBe("some code");
  });

  test("multiple code fences", () => {
    const md = "```js\nconsole.log(1);\n```\n\n```python\nprint(1)\n```";
    const tree = parseHeadingTree(md);
    const fences = findCodeFences(tree.contentNodes);
    expect(fences).toHaveLength(2);
    expect(fences[0].lang).toBe("js");
    expect(fences[1].lang).toBe("python");
  });

  test("code fence under a heading", () => {
    const md = "## Section\n\n```yaml\ndata: true\n```";
    const tree = parseHeadingTree(md);
    expect(tree.children).toHaveLength(1);
    const fences = findCodeFences(tree.children[0].contentNodes);
    expect(fences).toHaveLength(1);
    expect(fences[0].lang).toBe("yaml");
  });

  test("mixed content — only code nodes are returned", () => {
    const md = "Paragraph.\n\n```js\ncode\n```\n\n- list item\n\nMore text.";
    const tree = parseHeadingTree(md);
    const fences = findCodeFences(tree.contentNodes);
    expect(fences).toHaveLength(1);
    expect(fences[0].lang).toBe("js");
  });

  test("empty code fence → empty value", () => {
    const md = "```yaml\n```";
    const tree = parseHeadingTree(md);
    const fences = findCodeFences(tree.contentNodes);
    expect(fences).toHaveLength(1);
    expect(fences[0].value).toBe("");
  });

  test("empty array input → empty array", () => {
    expect(findCodeFences([])).toEqual([]);
  });
});
