/**
 * Tests for the self-contained HTML vault dashboard.
 */

import { describe, test, expect } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildDashboardData,
  createFolder,
  installPreset,
  initWorkspace,
  listFolders,
  renderDashboardHtml,
  resolveDashboardLaunchOptions,
  resolveDashboardPath,
  resolveDashboardRoot,
  scanVault,
  saveDocument,
  saveTemplate,
  serveDashboard,
  validateTemplateContent,
} from '../ui/dashboard.js';
import { generateReport } from '../ui/report-template.js';

const RESULTS = [
  {
    filepath: '/tmp/vault/notes/good.md',
    docType: 'note',
    valid: true,
    skipped: false,
    errors: [],
    warnings: [],
    frontmatter: { title: 'Good' },
  },
  {
    filepath: '/tmp/vault/prds/bad.md',
    docType: 'prd',
    valid: false,
    skipped: false,
    errors: [
      { field: 'status', message: 'Missing required field: status' },
      { field: 'priority', message: 'Invalid enum value: urgent' },
    ],
    warnings: [{ field: 'tags', message: 'Consider adding tags' }],
    frontmatter: { title: 'Bad' },
  },
];

describe('ui/dashboard.js', () => {
  test('buildDashboardData summarizes validation results', () => {
    const data = buildDashboardData(RESULTS, '/tmp/vault');

    expect(data.vaultRoot).toBe('/tmp/vault');
    expect(data.summary.total).toBe(2);
    expect(data.summary.valid).toBe(1);
    expect(data.summary.invalid).toBe(1);
    expect(data.summary.errorCount).toBe(2);
    expect(data.summary.warningCount).toBe(1);
    expect(data.summary.byFolder['notes/'].valid).toBe(1);
    expect(data.summary.byFolder['prds/'].invalid).toBe(1);
    expect(data.summary.commonIssues['status: Missing required field']).toBe(1);
  });

  test('renderDashboardHtml returns a complete HTML document', () => {
    const data = buildDashboardData(RESULTS, '/tmp/vault');
    const html = renderDashboardHtml(data);

    expect(html).toStartWith('<!doctype html>');
    expect(html).toContain('<title>Vault Health - 50.0%</title>');
    expect(html).toContain('id="vault-data"');
    expect(html).toContain('data-tab="start-panel"');
    expect(html).toContain('data-tab="health-panel"');
    expect(html).toContain('data-tab="templates-panel"');
    expect(html).toContain('Choose or create vault');
    expect(html).toContain('Install AI Workspace kit');
    expect(html).toContain('id="header-change-vault"');
    expect(html).toContain('id="workspace-root"');
    expect(html).toContain('id="workspace-new-folder-toggle"');
    expect(html).toContain('id="workspace-new-folder-name"');
    expect(html).toContain('id="workspace-create-cancel"');
    expect(html).toContain('id="workspace-init"');
    expect(html).toContain('id="workspace-scan-folder-btn"');
    expect(html).toContain('id="workspace-scan-all"');
    // Health panel rescan controls — modal picker
    expect(html).toContain('id="health-pick-folder-btn"');
    expect(html).toContain('id="health-scan-all-btn"');
    expect(html).toContain('id="health-scan-status"');
    expect(html).toContain('id="folder-picker-overlay"');
    expect(html).toContain('id="folder-picker-list"');
    expect(html).toContain('id="folder-picker-close"');
    expect(html).toContain('id="doc-search"');
    expect(html).toContain('id="doc-type-filter"');
    expect(html).toContain('id="folder-scope"');
    expect(html).toContain('id="doc-types"');
    expect(html).toContain('notes/good.md');
    expect(html).toContain('prds/bad.md');
  });

  test('renderDashboardHtml embeds syntactically valid interaction script', () => {
    const data = buildDashboardData(RESULTS, '/tmp/vault');
    const html = renderDashboardHtml(data);
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

    expect(script).toBeDefined();
    expect(() => new Function(script)).not.toThrow();
  });

  test('renderDashboardHtml includes the template builder UI', () => {
    const data = buildDashboardData(RESULTS, '/tmp/vault');
    const html = renderDashboardHtml(data);

    expect(html).toContain('Create');
    expect(html).toContain('id="template-builder"');
    expect(html).toContain('id="templates-panel"');
    expect(html).toContain('id="tpl-preset"');
    expect(html).toContain('<option value="context">Context</option>');
    expect(html).toContain('<option value="tool">Tool</option>');
    expect(html).toContain('<option value="ai-context">AI Context</option>');
    expect(html).toContain('id="tpl-output"');
    expect(html).toContain('id="tpl-validate"');
    expect(html).toContain('Validate template');
    expect(html).toContain('Create Document');
    expect(html).toContain('id="document-builder"');
    expect(html).toContain('id="doc-path"');
    expect(html).toContain('Save and validate');
    expect(html).toContain('id="tpl-save"');
    expect(html).toContain('Save to vault');
    expect(html).toContain('Copy template');
    expect(html).toContain('Download .md');
    expect(html).toContain('template_path: templates/');
  });

  test('saveTemplate writes a generated template into templates/', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-ui-template-'));
    try {
      const content = [
        '---',
        'template_path: templates/decision-template.md',
        'document_type: decision',
        'fields:',
        '  template:',
        '    required: true',
        '---',
        '',
        '# Decision template',
        '',
      ].join('\n');

      const result = await saveTemplate(root, { name: 'decision', content });
      expect(result.relativePath).toBe('templates/decision-template.md');
      expect(readFileSync(join(root, 'templates', 'decision-template.md'), 'utf-8')).toContain('document_type: decision');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('saveTemplate rejects unsafe names and mismatched content', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-ui-template-'));
    try {
      await expect(saveTemplate(root, {
        name: '../bad',
        content: 'template_path: templates/bad-template.md',
      })).rejects.toThrow('lowercase slug');

      await expect(saveTemplate(root, {
        name: 'decision',
        content: 'template_path: templates/other-template.md',
      })).rejects.toThrow('does not match');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('installPreset installs AI workspace kit and merges vault folders', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-ui-preset-'));
    try {
      require('node:fs').mkdirSync(join(root, '.claude'), { recursive: true });
      require('node:fs').writeFileSync(
        join(root, '.claude', 'vault-keeper.json'),
        JSON.stringify({ vaultRoot: '.', vaultFolders: ['notes'] }, null, 2) + '\n',
      );

      const result = await installPreset(root, { presetId: 'ai-workspace' });
      expect(result.presetId).toBe('ai-workspace');
      expect(result.created).toContain('templates/context-template.md');
      expect(result.created).toContain('templates/tool-template.md');
      expect(result.created).toContain('templates/ai-context-template.md');
      expect(readFileSync(join(root, 'templates', 'context-template.md'), 'utf-8')).toContain('document_type: context');

      const config = JSON.parse(readFileSync(join(root, '.claude', 'vault-keeper.json'), 'utf-8'));
      expect(config.vaultFolders).toContain('notes');
      expect(config.vaultFolders).toContain('contexts');
      expect(config.vaultFolders).toContain('tools');
      expect(config.vaultFolders).toContain('ai-context');

      const second = await installPreset(root, { presetId: 'ai-workspace' });
      expect(second.skipped).toContain('templates/context-template.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('initWorkspace creates documentation root and starter files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-ui-init-'));
    try {
      const result = await initWorkspace(root, { docsRoot: 'documentations' });
      expect(result.docsRoot).toBe('documentations');
      expect(result.created).toContain('templates/document-template.md');
      expect(result.created).toContain('documentations/welcome.md');
      expect(readFileSync(join(root, '.claude', 'vault-keeper.json'), 'utf-8')).toContain('"vaultFolders"');
      expect(readFileSync(join(root, 'documentations', 'welcome.md'), 'utf-8')).toContain('template: templates/document-template.md');

      const scan = await scanVault(root, join(root, 'documentations'));
      expect(scan.scopePath).toBe('documentations');
      expect(scan.workspace.docsRoot).toBe('documentations');
      expect(scan.summary.total).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('createFolder makes nested vault folders', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-ui-folder-'));
    try {
      const result = await createFolder(root, { path: 'documentations/context' });
      expect(result.relativePath).toBe('documentations/context');
      expect(existsSync(join(root, 'documentations', 'context'))).toBe(true);
      expect(statSync(join(root, 'documentations', 'context')).isDirectory()).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('validateTemplateContent validates template field and body rules', () => {
    const valid = validateTemplateContent([
      '---',
      'template_path: templates/decision-template.md',
      'document_type: decision',
      'fields:',
      '  title:',
      '    type: string',
      '    required: true',
      '---',
      '',
      '## Overview',
      '',
      '```yaml section-rules',
      'required: true',
      '```',
      '',
    ].join('\n'));

    expect(valid.valid).toBe(true);
    expect(valid.issues).toHaveLength(0);

    const invalid = validateTemplateContent([
      '---',
      'fields:',
      '  title:',
      '    type: madeup',
      '---',
      '',
      '## Overview',
      '',
      '```yaml section-rules',
      'unknown_rule: true',
      '```',
      '',
    ].join('\n'));

    expect(invalid.valid).toBe(false);
    expect(invalid.issues.length).toBeGreaterThanOrEqual(2);
    expect(invalid.issues.map((issue) => issue.message).join('\n')).toContain('Invalid type');
    expect(invalid.issues.map((issue) => issue.message).join('\n')).toContain('Unknown section-rules key');
  });

  test('saveDocument writes and validates a document under the vault root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-ui-doc-'));
    try {
      const template = [
        '---',
        'template_path: templates/note-template.md',
        'document_type: note',
        'fields:',
        '  template:',
        '    required: true',
        '  title:',
        '    type: string',
        '    required: true',
        '---',
        '',
        '# Note template',
        '',
      ].join('\n');
      await saveTemplate(root, { name: 'note', content: template });

      const content = [
        '---',
        'template: templates/note-template.md',
        'document_type: note',
        'title: Hello',
        '---',
        '',
        '# Hello',
        '',
      ].join('\n');
      const result = await saveDocument(root, { path: 'notes/hello.md', content });

      expect(result.relativePath).toBe('notes/hello.md');
      expect(result.validation.valid).toBe(true);
      expect(readFileSync(join(root, 'notes', 'hello.md'), 'utf-8')).toContain('title: Hello');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('saveDocument rejects escaping paths', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-ui-doc-'));
    try {
      await expect(saveDocument(root, {
        path: '../outside.md',
        content: '# Outside',
      })).rejects.toThrow('cannot escape');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('resolveDashboardRoot uses explicit --root without prompting', async () => {
    const root = await resolveDashboardRoot({
      rootArg: '/tmp/my-vault',
      resolveProjectRoot: ({ root }) => `/resolved${root}`,
    });

    expect(root).toBe('/resolved/tmp/my-vault');
  });

  test('resolveDashboardRoot falls back to detected root in non-interactive mode', async () => {
    const root = await resolveDashboardRoot({
      resolveProjectRoot: () => '/detected-vault',
    });

    expect(root).toBe('/detected-vault');
  });

  test('resolveDashboardPath uses explicit --path without prompting', async () => {
    const path = await resolveDashboardPath({
      root: '/vault',
      pathArg: 'notes/hello.md',
    });

    expect(path).toBe('notes/hello.md');
  });

  test('resolveDashboardPath validates whole vault by default in non-interactive mode', async () => {
    const path = await resolveDashboardPath({ root: '/vault' });

    expect(path).toBeUndefined();
  });

  test('resolveDashboardLaunchOptions returns root and validation path', async () => {
    const options = await resolveDashboardLaunchOptions({
      rootArg: '/vault',
      pathArg: 'notes',
      resolveProjectRoot: ({ root }) => root,
    });

    expect(options).toEqual({ root: '/vault', path: 'notes' });
  });

  test('listFolders returns immediate subdirectories excluding hidden and node_modules', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-list-folders-'));
    try {
      require('node:fs').mkdirSync(join(root, 'notes'));
      require('node:fs').mkdirSync(join(root, 'contexts'));
      require('node:fs').mkdirSync(join(root, '.hidden'));
      require('node:fs').mkdirSync(join(root, 'node_modules'));
      require('node:fs').writeFileSync(join(root, 'readme.md'), '# hi');

      const folders = await listFolders(root);
      expect(folders).toContain('notes');
      expect(folders).toContain('contexts');
      expect(folders).not.toContain('.hidden');
      expect(folders).not.toContain('node_modules');
      expect(folders).not.toContain('readme.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('serveDashboard exposes GET /api/fs/browse', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-browse-'));
    try {
      require('node:fs').mkdirSync(join(root, 'notes'));
      require('node:fs').mkdirSync(join(root, 'contexts'));
      require('node:fs').mkdirSync(join(root, '.hidden'));

      const data = buildDashboardData([], root);
      const server = await serveDashboard({ data, projectRoot: root, port: 0, open: false });
      const addr = server.address();
      const base = 'http://127.0.0.1:' + addr.port;

      const res = await fetch(base + '/api/fs/browse?path=' + encodeURIComponent(root));
      const payload = await res.json();

      expect(res.ok).toBe(true);
      expect(payload.path).toBe(root);
      expect(payload.dirs).toContain('notes');
      expect(payload.dirs).toContain('contexts');
      expect(payload.dirs).not.toContain('.hidden');

      server.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('serveDashboard exposes GET /api/documents to read file content', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-read-doc-'));
    try {
      const content = '---\ntitle: Test\n---\n\n# Test\n';
      require('node:fs').writeFileSync(join(root, 'test.md'), content);
      const data = buildDashboardData([], root);
      const server = await serveDashboard({ data, projectRoot: root, port: 0, open: false });
      const addr = server.address();
      const base = 'http://127.0.0.1:' + addr.port;
      const res = await fetch(base + '/api/documents?path=test.md');
      const payload = await res.json();
      expect(res.ok).toBe(true);
      expect(payload.content).toBe(content);
      expect(payload.path).toBe('test.md');
      server.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('serveDashboard exposes POST /api/vault/open and switches vault root', async () => {
    const root1 = mkdtempSync(join(tmpdir(), 'vk-open-1-'));
    const root2 = mkdtempSync(join(tmpdir(), 'vk-open-2-'));
    try {
      const data = buildDashboardData([], root1);
      const server = await serveDashboard({ data, projectRoot: root1, port: 0, open: false });
      const addr = server.address();
      const base = 'http://127.0.0.1:' + addr.port;

      const res = await fetch(base + '/api/vault/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: root2 }),
      });
      const payload = await res.json();

      expect(res.ok).toBe(true);
      expect(payload.vaultRoot).toBe(root2);
      expect(payload.switched).toBe(true);

      server.close();
    } finally {
      rmSync(root1, { recursive: true, force: true });
      rmSync(root2, { recursive: true, force: true });
    }
  });

  // ── Feature A: Guided tour ─────────────────────────────────────────────────
  test('renderDashboardHtml includes guided tour overlay HTML', () => {
    const data = buildDashboardData(RESULTS, '/tmp/vault');
    const html = renderDashboardHtml(data);
    expect(html).toContain('id="tour-overlay"');
    expect(html).toContain('id="tour-next-btn"');
    expect(html).toContain('id="tour-skip-btn"');
    expect(html).toContain('id="tour-step-counter"');
  });

  // ── Feature A: Demo vault API ──────────────────────────────────────────────
  test('serveDashboard POST /api/demo/init creates demo vault and returns root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-demo-'));
    try {
      const data = buildDashboardData([], root);
      const server = await serveDashboard({ data, projectRoot: root, port: 0, open: false });
      const addr = server.address();
      const base = 'http://127.0.0.1:' + addr.port;

      const res = await fetch(base + '/api/demo/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await res.json();

      expect(res.ok).toBe(true);
      expect(typeof payload.root).toBe('string');
      expect(payload.filesCreated).toBeGreaterThan(0);
      expect(payload.root).not.toBe(root); // demo root is different from vault root

      server.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── Feature B: Health badge ────────────────────────────────────────────────
  test('serveDashboard GET /api/badge.svg returns SVG', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-badge-'));
    try {
      const data = buildDashboardData(RESULTS, root);
      const server = await serveDashboard({ data, projectRoot: root, port: 0, open: false });
      const addr = server.address();

      const res = await fetch('http://127.0.0.1:' + addr.port + '/api/badge.svg');
      const svg = await res.text();

      expect(res.ok).toBe(true);
      expect(res.headers.get('content-type')).toContain('image/svg+xml');
      expect(svg.trim()).toStartWith('<svg');
      expect(svg).toContain('50.0%'); // RESULTS has 1 valid / 2 total = 50%

      server.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('badge SVG color is green when vault is 100% valid', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-badge-green-'));
    try {
      const allValid = [RESULTS[0]]; // only the valid doc
      const data = buildDashboardData(allValid, root);
      const server = await serveDashboard({ data, projectRoot: root, port: 0, open: false });
      const addr = server.address();

      const res = await fetch('http://127.0.0.1:' + addr.port + '/api/badge.svg');
      const svg = await res.text();

      // Green color for 100% — should contain a greenish fill
      expect(svg).toContain('100.0%');
      expect(svg).toMatch(/4c1|22c55e|brightgreen/);

      server.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('renderDashboardHtml includes badge copy button', () => {
    const data = buildDashboardData(RESULTS, '/tmp/vault');
    const html = renderDashboardHtml(data);
    expect(html).toContain('id="copy-badge-btn"');
  });

  // ── Feature B: Share / read-only report ───────────────────────────────────
  test('serveDashboard GET /share returns read-only HTML without mutation buttons', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vk-share-'));
    try {
      const data = buildDashboardData(RESULTS, root);
      const server = await serveDashboard({ data, projectRoot: root, port: 0, open: false });
      const addr = server.address();

      const res = await fetch('http://127.0.0.1:' + addr.port + '/share');
      const html = await res.text();

      expect(res.ok).toBe(true);
      expect(html).toStartWith('<!doctype html>');
      // Read-only: should not contain mutation buttons
      expect(html).not.toContain('id="workspace-init"');
      expect(html).not.toContain('id="tpl-save"');
      // But should contain health data
      expect(html).toContain('Vault Health');

      server.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── Feature C: Error explainer in HTML ────────────────────────────────────
  test('renderDashboardHtml includes error explanation trigger elements', () => {
    const data = buildDashboardData(RESULTS, '/tmp/vault');
    const html = renderDashboardHtml(data);
    expect(html).toContain('error-explain-btn');
  });
});

describe('ui/report-template.js', () => {
  test('generateReport escapes embedded JSON for script safety', () => {
    const data = buildDashboardData([
      {
        filepath: '/tmp/vault/notes/x.md',
        docType: 'note',
        valid: false,
        skipped: false,
        errors: [{ field: 'title', message: '</script><script>alert(1)</script>' }],
        warnings: [],
        frontmatter: {},
      },
    ], '/tmp/vault');

    const html = generateReport(data);
    const jsonBlock = html.match(/<script id="vault-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];

    expect(jsonBlock).toBeDefined();
    expect(jsonBlock).not.toContain('</script>');
    expect(jsonBlock).toContain('\\u003c/script');
  });
});
