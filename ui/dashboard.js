#!/usr/bin/env node
/**
 * ui/dashboard.js — Web dashboard for vault health reporting.
 *
 * Generates a self-contained HTML report from vault validation results.
 * The report opens in any browser — no server needed, no external deps.
 *
 * Usage (via vault-keeper dashboard):
 *   vault-keeper dashboard                    # generate + open in browser
 *   vault-keeper dashboard --out report.html  # write to file only
 *   vault-keeper dashboard --root ./notes     # specific vault root
 *   vault-keeper dashboard --json             # print data as JSON instead
 *
 * Architecture:
 *   1. Run validateDocument() on all vault docs (same engine as CLI)
 *   2. Build a DashboardData object (summary + per-doc results)
 *   3. Inject into report-template.js to produce self-contained HTML
 *   4. Write to file / open in browser
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import matter from 'gray-matter';
import { generateReport } from './report-template.js';
import { validateBodyTemplateSchema, validateTemplateSchema } from '../lib/schema-engine.js';
import { parseBodySchema } from '../lib/template-section-rules.js';
import { PRESETS } from '../cli/init-presets.js';
import { loadVaultConfig } from '../lib/vault-config.js';

/**
 * Build a DashboardData object from validation results.
 *
 * @param {object[]} results
 * @param {string} vaultRoot
 * @returns {object}
 */
export function buildDashboardData(results, vaultRoot) {
  return {
    generatedAt: new Date().toISOString(),
    vaultRoot,
    summary: buildSummary(results, vaultRoot),
    results,
  };
}

/**
 * Scan and validate a vault or a specific path inside it.
 *
 * @param {string} projectRoot
 * @param {string|undefined} targetPath
 * @returns {Promise<object>}
 */
export async function scanVault(projectRoot, targetPath) {
  const { findDocuments, validateDocument } = await import('../cli/validate-documents.js');
  const resolvedScope = resolveScopePath(projectRoot, targetPath);
  const docs = await findDocuments(resolvedScope);
  const results = await Promise.all(docs.map((doc) => validateDocument(doc, { projectRoot })));
  const data = buildDashboardData(results, projectRoot);
  data.scopePath = resolvedScope ? relative(projectRoot, resolvedScope).split(/[\\/]/).join('/') : '';
  const config = loadVaultConfig(projectRoot);
  data.workspace = {
    docsRoot: config.vaultFolders?.[0] || 'documentations',
    vaultFolders: config.vaultFolders || [],
  };
  return data;
}

/**
 * Render validation data as a self-contained HTML report.
 *
 * @param {object} data
 * @returns {string}
 */
export function renderDashboardHtml(data) {
  return generateReport(data);
}

/**
 * Persist a generated template into the vault templates/ folder.
 *
 * @param {string} projectRoot
 * @param {{ name: string, content: string, force?: boolean }} input
 * @returns {Promise<{ relativePath: string, filepath: string }>}
 */
export async function saveTemplate(projectRoot, input) {
  const name = String(input?.name || '').trim();
  const content = String(input?.content || '');
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error('Template name must be a lowercase slug.');
  }
  if (!content.includes(`template_path: templates/${name}-template.md`)) {
    throw new Error('Template content does not match the requested template name.');
  }

  const templatesDir = resolve(projectRoot, 'templates');
  const filepath = resolve(templatesDir, `${name}-template.md`);
  if (!filepath.startsWith(`${templatesDir}/`)) {
    throw new Error('Refusing to write outside templates/.');
  }

  await mkdir(dirname(filepath), { recursive: true });
  await writeFile(filepath, content.endsWith('\n') ? content : `${content}\n`, {
    encoding: 'utf-8',
    flag: input.force ? 'w' : 'wx',
  });
  return {
    relativePath: `templates/${name}-template.md`,
    filepath,
  };
}

/**
 * Persist a markdown document under the vault root and validate it.
 *
 * @param {string} projectRoot
 * @param {{ path: string, content: string, force?: boolean }} input
 * @returns {Promise<{ relativePath: string, filepath: string, validation: object }>}
 */
export async function saveDocument(projectRoot, input) {
  const relativePath = normalizeVaultRelativePath(input?.path);
  const content = String(input?.content || '');
  if (!relativePath.endsWith('.md')) {
    throw new Error('Document path must end with .md.');
  }
  if (!content.trim()) {
    throw new Error('Document content cannot be empty.');
  }

  const filepath = resolve(projectRoot, relativePath);
  const rootWithSlash = `${resolve(projectRoot)}/`;
  if (!filepath.startsWith(rootWithSlash)) {
    throw new Error('Refusing to write outside the vault.');
  }

  await mkdir(dirname(filepath), { recursive: true });
  await writeFile(filepath, content.endsWith('\n') ? content : `${content}\n`, {
    encoding: 'utf-8',
    flag: input.force ? 'w' : 'wx',
  });

  const { validateDocument } = await import('../cli/validate-documents.js');
  const validation = await validateDocument(filepath, { projectRoot });
  return { relativePath, filepath, validation };
}

/**
 * Create a folder inside the vault.
 *
 * @param {string} projectRoot
 * @param {{ path: string }} input
 * @returns {Promise<{ relativePath: string, filepath: string }>}
 */
export async function createFolder(projectRoot, input) {
  const relativePath = normalizeVaultRelativePath(input?.path);
  const filepath = resolve(projectRoot, relativePath);
  assertInsideRoot(projectRoot, filepath);
  await mkdir(filepath, { recursive: true });
  return { relativePath, filepath };
}

/**
 * Initialize a docs workspace inside the vault.
 *
 * Creates the selected docs root, `templates/`, a starter template and a
 * starter document, then merges the docs root into vault-keeper.json so scans
 * include it.
 *
 * @param {string} projectRoot
 * @param {{ docsRoot?: string, force?: boolean }} input
 * @returns {Promise<{ docsRoot: string, created: string[], skipped: string[], updatedConfig: boolean }>}
 */
export async function initWorkspace(projectRoot, input = {}) {
  const docsRoot = normalizeVaultRelativePath(input?.docsRoot || 'documentations');
  const created = [];
  const skipped = [];

  await mkdir(resolve(projectRoot, docsRoot), { recursive: true });
  await mkdir(resolve(projectRoot, 'templates'), { recursive: true });

  const templatePath = `templates/document-template.md`;
  const templateContent = [
    '---',
    `template_path: ${templatePath}`,
    'document_type: document',
    'fields:',
    '  template:',
    '    required: true',
    '  title:',
    '    type: string',
    '    required: true',
    '  $path:',
    `    pattern: '^${docsRoot}/[a-z0-9-]+\\.md$'`,
    '---',
    '',
    '# Document template',
    '',
    '## Overview',
    '',
    '```yaml section-rules',
    'required: true',
    '```',
    '',
    'Write your document here.',
    '',
  ].join('\n');
  const documentPath = `${docsRoot}/welcome.md`;
  const documentContent = [
    '---',
    `template: ${templatePath}`,
    'document_type: document',
    'title: Welcome',
    '---',
    '',
    '# Welcome',
    '',
    '## Overview',
    '',
    'Welcome to your document workspace.',
    '',
  ].join('\n');

  await writeGeneratedFile(projectRoot, templatePath, templateContent, input.force, created, skipped);
  await writeGeneratedFile(projectRoot, documentPath, documentContent, input.force, created, skipped);

  const updatedConfig = await mergeVaultConfig(projectRoot, { vaultFolders: [docsRoot] });
  return { docsRoot, created, skipped, updatedConfig };
}

/**
 * Install an opinionated preset into an existing vault.
 *
 * Existing files are skipped unless force=true. vault-keeper.json is merged so
 * preset folders are included in validation scans without dropping user config.
 *
 * @param {string} projectRoot
 * @param {{ presetId?: string, force?: boolean }} input
 * @returns {Promise<{ presetId: string, created: string[], skipped: string[], updatedConfig: boolean }>}
 */
export async function installPreset(projectRoot, input = {}) {
  const presetId = String(input.presetId || 'ai-workspace');
  const preset = PRESETS[presetId];
  if (!preset) {
    throw new Error(`Unknown preset '${presetId}'.`);
  }

  const created = [];
  const skipped = [];
  let updatedConfig = false;

  for (const file of preset.files) {
    if (file.path === '.claude/vault-keeper.json') {
      updatedConfig = await mergePresetConfig(projectRoot, file.content);
      continue;
    }

    const filepath = resolve(projectRoot, file.path);
    assertInsideRoot(projectRoot, filepath);
    await mkdir(dirname(filepath), { recursive: true });
    try {
      await writeFile(filepath, file.content, {
        encoding: 'utf-8',
        flag: input.force ? 'w' : 'wx',
      });
      created.push(file.path);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      skipped.push(file.path);
    }
  }

  return { presetId, created, skipped, updatedConfig };
}

/**
 * Validate generated template markdown before saving it into a vault.
 *
 * @param {string} content
 * @returns {{ valid: boolean, issues: object[] }}
 */
export function validateTemplateContent(content) {
  let parsed;
  try {
    parsed = matter(String(content || ''));
  } catch (error) {
    return {
      valid: false,
      issues: [{
        level: 'error',
        field: 'frontmatter',
        message: `Cannot parse template frontmatter: ${error.message}`,
        error_type: 'template-schema-invalid',
      }],
    };
  }

  const fields = parsed.data?.fields && typeof parsed.data.fields === 'object'
    ? parsed.data.fields
    : undefined;
  const fieldIssues = validateTemplateSchema(fields);
  const bodyIssues = validateBodyTemplateSchema(parseBodySchema(parsed.content || ''));
  const issues = [...fieldIssues, ...bodyIssues];
  return {
    valid: !issues.some((issue) => issue.level === 'error'),
    issues,
  };
}

/**
 * List immediate subdirectories of the vault root.
 * Excludes hidden dirs (starting with '.') and node_modules.
 *
 * @param {string} projectRoot
 * @returns {Promise<string[]>}
 */
export async function listFolders(projectRoot) {
  try {
    const entries = await readdir(projectRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function main(argv = []) {
  const { resolveProjectRoot } = await import('../lib/vault-config.js');
  const { findDocuments, validateDocument } = await import('../cli/validate-documents.js');

  const rootArg = readOption(argv, '--root');
  const pathArg = readOption(argv, '--path');
  const outArg = readOption(argv, '--out');
  const serve = argv.includes('--serve');
  const port = Number.parseInt(readOption(argv, '--port') || '0', 10);
  const wantJson = argv.includes('--json');
  const shouldOpen = !argv.includes('--no-open') && !wantJson && !outArg && !process.env.CI;

  const launchOptions = await resolveDashboardLaunchOptions({ rootArg, pathArg, resolveProjectRoot });
  const resolvedRoot = launchOptions.root;
  const effectivePath = launchOptions.path;
  process.chdir(resolvedRoot);
  const projectRoot = process.cwd();
  process.env.CLAUDE_PROJECT_DIR = projectRoot;

  const data = await scanVault(projectRoot, effectivePath);

  if (serve) {
    await serveDashboard({ data, projectRoot, port, open: !argv.includes('--no-open') });
    await new Promise(() => {});
  }

  if (wantJson) {
    console.log(JSON.stringify(data, null, 2));
    return data.summary.invalid > 0 ? 1 : 0;
  }

  const outPath = resolve(projectRoot, outArg || 'vault-keeper-report.html');
  const html = renderDashboardHtml(data);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf-8');

  console.log(`vault-keeper dashboard written to ${outPath}`);
  if (shouldOpen) {
    openInBrowser(outPath);
  }

  return 0;
}

export async function resolveDashboardRoot({ rootArg, resolveProjectRoot: resolveRoot = (opts) => resolve(opts?.root || process.cwd()) } = {}) {
  if (rootArg) return resolveRoot({ root: rootArg });
  if (!process.stdin.isTTY || process.env.CI) return resolveRoot();

  const { select, input } = await import('../tui/components/prompt.js');
  const detected = resolveRoot();
  const choice = await select('Which vault should dashboard open?', [
    {
      value: 'detected',
      label: `Use current vault: ${detected}`,
      description: 'Detected from current directory, CLAUDE_PROJECT_DIR, or markers',
    },
    {
      value: 'custom',
      label: 'Choose another path',
      description: 'Enter a vault root manually',
    },
    {
      value: 'create',
      label: 'Create a new vault',
      description: 'Pick a path and scaffold a starter vault',
    },
  ]);

  if (choice === 'custom') {
    const customRoot = await input('Vault root path', detected);
    return resolveRoot({ root: customRoot });
  }
  if (choice === 'create') {
    const targetRoot = await input('New vault path', './my-vault');
    const { runWizardWithAnswers } = await import('../tui/wizard.js');
    const resolved = resolveRoot({ root: targetRoot });
    await runWizardWithAnswers({ preset: 'custom' }, resolved);
    return resolved;
  }
  return detected;
}

export async function resolveDashboardLaunchOptions({
  rootArg,
  pathArg,
  resolveProjectRoot: resolveRoot = (opts) => resolve(opts?.root || process.cwd()),
} = {}) {
  const root = await resolveDashboardRoot({ rootArg, resolveProjectRoot: resolveRoot });
  const path = await resolveDashboardPath({ root, pathArg });
  return { root, path };
}

export async function resolveDashboardPath({ root, pathArg } = {}) {
  if (pathArg) return pathArg;
  if (!process.stdin.isTTY || process.env.CI) return undefined;

  const { select, input } = await import('../tui/components/prompt.js');
  const choice = await select('What should I validate?', [
    {
      value: 'all',
      label: 'Whole vault',
      description: 'Scan every configured Markdown document',
    },
    {
      value: 'path',
      label: 'One file or folder',
      description: 'Validate a specific document or sub-folder',
    },
  ]);

  if (choice === 'path') {
    return input('File or folder path', root || '.');
  }
  return undefined;
}

export function serveDashboard({ data, projectRoot: initialRoot, port = 0, open = true }) {
  let currentData = data;
  let projectRoot = initialRoot;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/') {
      send(res, 200, renderDashboardHtml(currentData), 'text/html; charset=utf-8');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/fs/pick-folder') {
      try {
        const { execSync } = await import('node:child_process');
        let picked = '';
        if (process.platform === 'darwin') {
          picked = execSync(
            "osascript -e 'POSIX path of (choose folder with prompt \"Select a folder\")'",
            { encoding: 'utf-8', timeout: 60000 },
          ).trim().replace(/\/$/, '');
        } else {
          picked = execSync('zenity --file-selection --directory', {
            encoding: 'utf-8', timeout: 60000,
          }).trim();
        }
        sendJson(res, 200, { path: picked || null, cancelled: !picked });
      } catch (error) {
        // exit code 1 = user cancelled (not an error)
        const cancelled = (error.status === 1 || (error.message || '').includes('User canceled'));
        if (cancelled) sendJson(res, 200, { path: null, cancelled: true });
        else sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/fs/browse') {
      try {
        const browsePath = resolve(url.searchParams.get('path') || projectRoot);
        const entries = await readdir(browsePath, { withFileTypes: true });
        const dirs = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
          .map((e) => e.name)
          .sort();
        const parent = dirname(browsePath) !== browsePath ? dirname(browsePath) : null;
        sendJson(res, 200, { path: browsePath, parent, dirs });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/vault/open') {
      try {
        const payload = await readJson(req);
        const newRoot = resolve(String(payload.root || '').trim());
        const { stat } = await import('node:fs/promises');
        const stats = await stat(newRoot);
        if (!stats.isDirectory()) {
          throw new Error('Not a directory: ' + newRoot);
        }
        projectRoot = newRoot;
        process.env.CLAUDE_PROJECT_DIR = projectRoot;
        currentData = await scanVault(projectRoot);
        sendJson(res, 200, { ...currentData, switched: true });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/data') {
      sendJson(res, 200, currentData);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/vault/folders') {
      const folders = await listFolders(projectRoot);
      sendJson(res, 200, { folders });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/scan') {
      try {
        const payload = await readJson(req);
        const scopePath = normalizeOptionalVaultRelativePath(payload.path);
        currentData = await scanVault(projectRoot, scopePath);
        sendJson(res, 200, currentData);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/init') {
      try {
        const payload = await readJson(req);
        const result = await initWorkspace(projectRoot, payload);
        currentData = await scanVault(projectRoot);
        sendJson(res, 201, { ...result, data: currentData });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/folders') {
      try {
        const payload = await readJson(req);
        const result = await createFolder(projectRoot, payload);
        sendJson(res, 201, result);
      } catch (error) {
        const status = error.code === 'EEXIST' ? 409 : 400;
        sendJson(res, status, { error: error.message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/templates/validate') {
      try {
        const payload = await readJson(req);
        sendJson(res, 200, validateTemplateContent(payload.content));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/templates') {
      try {
        const payload = await readJson(req);
        const result = await saveTemplate(projectRoot, payload);
        sendJson(res, 201, result);
      } catch (error) {
        const status = error.code === 'EEXIST' ? 409 : 400;
        const message = error.code === 'EEXIST'
          ? 'Template already exists. Choose another name or delete the existing file first.'
          : error.message;
        sendJson(res, status, { error: message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/presets/install') {
      try {
        const payload = await readJson(req);
        const result = await installPreset(projectRoot, payload);
        sendJson(res, 201, result);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/documents') {
      try {
        const payload = await readJson(req);
        const result = await saveDocument(projectRoot, payload);
        sendJson(res, 201, result);
      } catch (error) {
        const status = error.code === 'EEXIST' ? 409 : 400;
        const message = error.code === 'EEXIST'
          ? 'Document already exists. Choose another path or delete the existing file first.'
          : error.message;
        sendJson(res, status, { error: message });
      }
      return;
    }

    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  });

  return new Promise((resolvePromise, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const url = `http://127.0.0.1:${address.port}/`;
      console.log(`vault-keeper dashboard serving ${url}`);
      console.log('Press Ctrl-C to stop.');
      if (open) openInBrowser(url);
      resolvePromise(server);
    });
  });
}

function readOption(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function buildSummary(results, projectRoot) {
  const summary = {
    total: results.length,
    skipped: results.filter((r) => r.skipped).length,
    valid: results.filter((r) => r.valid && !r.skipped).length,
    invalid: results.filter((r) => !r.valid).length,
    errorCount: results.reduce((sum, r) => sum + (r.errors?.length || 0), 0),
    warningCount: results.reduce((sum, r) => sum + (r.warnings?.length || 0), 0),
    byDocType: {},
    byFolder: {},
    commonIssues: {},
  };

  for (const result of results) {
    const docType = result.docType || 'unknown';
    summary.byDocType[docType] ||= { total: 0, valid: 0, invalid: 0 };
    summary.byDocType[docType].total++;
    if (result.valid) summary.byDocType[docType].valid++;
    else summary.byDocType[docType].invalid++;

    const rel = result.filepath ? relative(projectRoot, result.filepath).split(/[\\/]/).join('/') : '';
    const folder = folderFromRelativePath(rel);
    summary.byFolder[folder] ||= { total: 0, valid: 0, invalid: 0 };
    summary.byFolder[folder].total++;
    if (result.valid) summary.byFolder[folder].valid++;
    else summary.byFolder[folder].invalid++;

    for (const issue of [...(result.errors || []), ...(result.warnings || [])]) {
      const field = issue.field || 'document';
      const message = String(issue.message || '').split(':')[0];
      const key = `${field}: ${message}`;
      summary.commonIssues[key] = (summary.commonIssues[key] || 0) + 1;
    }
  }

  return summary;
}

function folderFromRelativePath(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/');
  if (!normalized || !normalized.includes('/')) return './';
  return `${normalized.slice(0, normalized.lastIndexOf('/') + 1)}`;
}

function resolveScopePath(projectRoot, targetPath) {
  const raw = String(targetPath || '')
    .trim()
    .replaceAll('\\', '/');
  if (!raw || raw === '.') return undefined;
  if (raw.includes('\0')) {
    throw new Error('Path contains invalid characters.');
  }
  if (raw.split('/').some((part) => part === '..')) {
    throw new Error('Path cannot escape the vault.');
  }
  return isAbsolute(raw) ? resolve(raw) : resolve(projectRoot, raw);
}

function openInBrowser(target) {
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32'
    ? ['/c', 'start', '', target]
    : [target];

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // Report generation succeeded; opening is a convenience only.
  }
}

function send(res, status, body, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8');
}

function readJson(req) {
  return new Promise((resolvePromise, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error('Request body too large.'));
      }
    });
    req.on('end', () => {
      try {
        resolvePromise(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeVaultRelativePath(value) {
  const cleaned = String(value || '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('\0')) {
    throw new Error('Document path is required.');
  }
  if (cleaned.split('/').some((part) => part === '..')) {
    throw new Error('Document path cannot escape the vault.');
  }
  return cleaned;
}

function normalizeOptionalVaultRelativePath(value) {
  const cleaned = String(value || '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\/+/, '');
  if (!cleaned || cleaned === '.') return undefined;
  if (cleaned.includes('\0')) {
    throw new Error('Path contains invalid characters.');
  }
  if (cleaned.split('/').some((part) => part === '..')) {
    throw new Error('Path cannot escape the vault.');
  }
  return cleaned.replace(/\/+$/, '');
}

function assertInsideRoot(projectRoot, filepath) {
  const rootWithSlash = `${resolve(projectRoot)}/`;
  if (!filepath.startsWith(rootWithSlash)) {
    throw new Error('Refusing to write outside the vault.');
  }
}

async function writeGeneratedFile(projectRoot, relativePath, content, force, created, skipped) {
  const filepath = resolve(projectRoot, relativePath);
  assertInsideRoot(projectRoot, filepath);
  await mkdir(dirname(filepath), { recursive: true });
  try {
    await writeFile(filepath, content.endsWith('\n') ? content : `${content}\n`, {
      encoding: 'utf-8',
      flag: force ? 'w' : 'wx',
    });
    created.push(relativePath);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    skipped.push(relativePath);
  }
}

async function mergeVaultConfig(projectRoot, patch = {}) {
  const configPath = resolve(projectRoot, '.claude', 'vault-keeper.json');
  assertInsideRoot(projectRoot, configPath);

  let existing = {};
  let existed = true;
  try {
    existing = JSON.parse(await readFile(configPath, 'utf-8'));
  } catch {
    existed = false;
  }

  const merged = {
    ...patch,
    ...existing,
    vaultRoot: typeof existing.vaultRoot === 'string'
      ? existing.vaultRoot
      : (typeof patch.vaultRoot === 'string' ? patch.vaultRoot : '.'),
    vaultFolders: uniqueStrings([
      ...asStringArray(existing.vaultFolders),
      ...asStringArray(patch.vaultFolders),
    ]),
    excludePatterns: uniqueStrings([
      ...asStringArray(existing.excludePatterns),
      ...asStringArray(patch.excludePatterns),
    ]),
    templateOnlyFields: uniqueStrings([
      ...asStringArray(existing.templateOnlyFields),
      ...asStringArray(patch.templateOnlyFields),
    ]),
  };

  const nextContent = `${JSON.stringify(merged, null, 2)}\n`;
  if (existed) {
    const current = await readFile(configPath, 'utf-8').catch(() => '');
    if (current === nextContent) return false;
  }
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, nextContent, 'utf-8');
  return true;
}

async function mergePresetConfig(projectRoot, presetConfigContent) {
  const presetConfig = JSON.parse(presetConfigContent);
  return mergeVaultConfig(projectRoot, presetConfig);
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}

function __isDirectEntry() {
  const arg1 = process.argv[1];
  if (!arg1) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(arg1)).href;
  } catch {
    return false;
  }
}

if (__isDirectEntry()) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.stack || err.message || err);
      process.exit(1);
    },
  );
}

export { generateReport };
