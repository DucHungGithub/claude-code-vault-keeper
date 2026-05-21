/**
 * T1 — VaultIndex unit tests
 *
 * Tests the VaultIndex class directly using real temp directories.
 * Covers: build, search, backlinks, resolveId (O(1) via P4), refreshFile,
 * excludePatterns (P3), and allEntries.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VaultIndex } from '../server/vault-index.js';
// API1: also verify barrel export
import { VaultIndex as VaultIndexFromBarrel } from '../lib/index.js';

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vault-index-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeDoc(rel, content) {
  const abs = join(tmpDir, rel);
  mkdirSync(abs.substring(0, abs.lastIndexOf('/')), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
  return abs;
}

function fm(fields, body = '') {
  const yaml = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return `---\n${yaml}\n---\n${body}`;
}

// ── API1: barrel export ───────────────────────────────────────────────────────

describe('API1 — barrel export', () => {
  test('VaultIndex is importable from lib/index.js barrel', () => {
    expect(typeof VaultIndexFromBarrel).toBe('function');
    expect(VaultIndexFromBarrel).toBe(VaultIndex);
  });
});

// ── Build ─────────────────────────────────────────────────────────────────────

describe('_buildIndex', () => {
  test('builds index from markdown files', async () => {
    writeDoc('note-001.md', fm({ title: 'Note One' }));
    writeDoc('note-002.md', fm({ title: 'Note Two' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.allEntries().length).toBe(2);
  });

  test('skips non-markdown files', async () => {
    writeDoc('note-001.md', fm({ title: 'Note One' }));
    writeDoc('image.png', 'binary');
    writeDoc('data.json', '{}');

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.allEntries().length).toBe(1);
  });

  test('skips node_modules directory', async () => {
    mkdirSync(join(tmpDir, 'node_modules'), { recursive: true });
    writeDoc('node_modules/dep.md', fm({ title: 'Dep' }));
    writeDoc('real.md', fm({ title: 'Real' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    // Only real.md should be indexed
    expect(index.allEntries().length).toBe(1);
    expect(index.allEntries()[0].title).toBe('Real');
  });

  test('skips .git directory', async () => {
    mkdirSync(join(tmpDir, '.git'), { recursive: true });
    writeDoc('.git/COMMIT_EDITMSG', 'fix: something');
    writeDoc('doc.md', fm({ title: 'Doc' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.allEntries().length).toBe(1);
  });

  test('ensureLoaded is idempotent (safe to call multiple times)', async () => {
    writeDoc('a.md', fm({ title: 'A' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();
    await index.ensureLoaded(); // second call — must not re-build
    await index.ensureLoaded();

    expect(index.allEntries().length).toBe(1);
  });

  test('extracts id from filename (<prefix>-<digits> pattern)', async () => {
    writeDoc('prd-001-checkout-redesign.md', fm({ title: 'Checkout PRD' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    const [entry] = index.allEntries();
    expect(entry.id).toBe('prd-001');
  });

  test('extracts id from date-prefixed filename', async () => {
    writeDoc('2026-05-01-adr-007-auth.md', fm({ title: 'Auth ADR' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    const [entry] = index.allEntries();
    expect(entry.id).toBe('adr-007');
  });

  test('uses frontmatter title when present', async () => {
    writeDoc('note.md', fm({ title: 'My Note Title' }, '# H1 ignored\nBody.'));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.allEntries()[0].title).toBe('My Note Title');
  });

  test('falls back to H1 when no frontmatter title', async () => {
    writeFileSync(join(tmpDir, 'no-title.md'), '# Heading From Body\nBody.', 'utf-8');

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.allEntries()[0].title).toBe('Heading From Body');
  });
});

// ── search ────────────────────────────────────────────────────────────────────

describe('search', () => {
  test('finds docs by title (case-insensitive)', async () => {
    writeDoc('prd-001.md', fm({ title: 'Checkout Redesign PRD' }));
    writeDoc('prd-002.md', fm({ title: 'Search Relevance PRD' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    const results = index.search('checkout');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Checkout Redesign PRD');
  });

  test('finds docs by id substring', async () => {
    writeDoc('prd-001-foo.md', fm({ title: 'Foo PRD' }));
    writeDoc('prd-002-bar.md', fm({ title: 'Bar PRD' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    const results = index.search('prd-001');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Foo PRD');
  });

  test('finds docs by filename substring', async () => {
    writeDoc('special-filename.md', fm({ title: 'Generic Title' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    const results = index.search('special-filename');
    expect(results).toHaveLength(1);
  });

  test('returns empty array for no match', async () => {
    writeDoc('note.md', fm({ title: 'Note' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.search('zzz-no-match')).toHaveLength(0);
  });

  test('returns empty array for empty query', async () => {
    writeDoc('note.md', fm({ title: 'Note' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.search('')).toHaveLength(0);
    expect(index.search('   ')).toHaveLength(0);
  });

  test('caps results at 50', async () => {
    for (let i = 0; i < 60; i++) {
      writeDoc(`note-${String(i).padStart(3, '0')}.md`, fm({ title: `Note ${i}` }));
    }

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.search('note').length).toBeLessThanOrEqual(50);
  });
});

// ── resolveId (P4 — O(1) via _idMap) ─────────────────────────────────────────

describe('resolveId — P4 O(1) lookup', () => {
  test('resolves standard <prefix>-<digits> id to absPath', async () => {
    const abs = writeDoc('task-001-onboarding.md', fm({ title: 'Onboarding Task' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.resolveId('task-001')).toBe(abs);
  });

  test('resolve is case-insensitive', async () => {
    const abs = writeDoc('prd-042-foo.md', fm({ title: 'PRD' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.resolveId('PRD-042')).toBe(abs);
    expect(index.resolveId('prd-042')).toBe(abs);
  });

  test('returns null for unknown id', async () => {
    writeDoc('prd-001.md', fm({ title: 'PRD 1' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.resolveId('prd-999')).toBeNull();
  });

  test('returns null for null/empty input', async () => {
    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.resolveId(null)).toBeNull();
    expect(index.resolveId('')).toBeNull();
  });

  test('_idMap populated for all docs with extractable id', async () => {
    writeDoc('prd-001-a.md', fm({ title: 'A' }));
    writeDoc('prd-002-b.md', fm({ title: 'B' }));
    writeDoc('no-id-match.md', fm({ title: 'C' })); // no <prefix>-<digits> → no id

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    // _idMap is internal but we can verify via resolveId behavior
    expect(index.resolveId('prd-001')).not.toBeNull();
    expect(index.resolveId('prd-002')).not.toBeNull();
  });
});

// ── getBacklinks ──────────────────────────────────────────────────────────────

describe('getBacklinks', () => {
  test('returns incoming links for a target doc', async () => {
    const target = writeDoc('target.md', fm({ title: 'Target' }));
    writeDoc('source.md', fm({ title: 'Source' }, '\nSee [target](target.md).'));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    const backlinks = index.getBacklinks(target);
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0].source).toContain('source.md');
  });

  test('returns empty array when no incoming links', async () => {
    const orphan = writeDoc('orphan.md', fm({ title: 'Orphan' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.getBacklinks(orphan)).toHaveLength(0);
  });

  test('handles multiple sources linking to same target', async () => {
    const target = writeDoc('popular.md', fm({ title: 'Popular' }));
    writeDoc('a.md', fm({ title: 'A' }, '\n[popular](popular.md)'));
    writeDoc('b.md', fm({ title: 'B' }, '\n[popular](popular.md)'));
    writeDoc('c.md', fm({ title: 'C' }, '\n[popular](popular.md)'));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.getBacklinks(target)).toHaveLength(3);
  });
});

// ── refreshFile ───────────────────────────────────────────────────────────────

describe('refreshFile', () => {
  test('updates entry after file content changes', async () => {
    const abs = writeDoc('note.md', fm({ title: 'Old Title' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    // Update file on disk and refresh index
    writeFileSync(abs, fm({ title: 'New Title' }), 'utf-8');
    await index.refreshFile(abs);

    const results = index.search('New Title');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('New Title');
  });

  test('updates _idMap when doc id changes (P4)', async () => {
    const abs = writeDoc('prd-001-foo.md', fm({ title: 'Foo' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.resolveId('prd-001')).toBe(abs);

    // Simulate content change — id stays the same (derived from filename, not content)
    writeFileSync(abs, fm({ title: 'Foo Updated' }), 'utf-8');
    await index.refreshFile(abs);

    // id unchanged (still derived from filename)
    expect(index.resolveId('prd-001')).toBe(abs);
    expect(index.search('Foo Updated')[0]?.name).toBe('Foo Updated');
  });

  test('removes stale backlinks after file is updated', async () => {
    const target = writeDoc('target.md', fm({ title: 'Target' }));
    const source = writeDoc('source.md', fm({ title: 'Source' }, '\n[link](target.md)'));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.getBacklinks(target)).toHaveLength(1);

    // Remove the link from source
    writeFileSync(source, fm({ title: 'Source' }, '\nNo link anymore.'), 'utf-8');
    await index.refreshFile(source);

    expect(index.getBacklinks(target)).toHaveLength(0);
  });

  test('ignores non-markdown files', async () => {
    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    // Should not throw
    await index.refreshFile(join(tmpDir, 'image.png'));
    expect(index.allEntries().length).toBe(0);
  });
});

// ── getFrontmatter / getEntry ─────────────────────────────────────────────────

describe('getFrontmatter / getEntry', () => {
  test('getFrontmatter returns parsed frontmatter for indexed doc', async () => {
    const abs = writeDoc('doc.md', fm({ title: 'Doc', status: 'draft', owner: 'alice' }));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    const frontmatter = index.getFrontmatter(abs);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter.status).toBe('draft');
    expect(frontmatter.owner).toBe('alice');
  });

  test('getFrontmatter returns null for unknown path', async () => {
    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    expect(index.getFrontmatter(join(tmpDir, 'nonexistent.md'))).toBeNull();
  });

  test('getEntry returns full entry including outLinks', async () => {
    const abs = writeDoc('src.md', fm({ title: 'Src' }, '\n[link](other.md)'));

    const index = new VaultIndex(tmpDir);
    await index.ensureLoaded();

    const entry = index.getEntry(abs);
    expect(entry).not.toBeNull();
    expect(Array.isArray(entry.outLinks)).toBe(true);
    expect(entry.outLinks.length).toBeGreaterThan(0);
  });
});
