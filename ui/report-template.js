/**
 * report-template.js — Generate self-contained HTML from DashboardData.
 *
 * All CSS and JS is inlined — the output is a single .html file with
 * no external dependencies. Data is embedded as a <script> JSON block.
 *
 * DashboardData shape:
 * {
 *   generatedAt: string (ISO),
 *   vaultRoot: string,
 *   summary: { total, valid, invalid, skipped, errorCount, warningCount, byFolder, byDocType, commonIssues },
 *   results: Array<{ filepath, docType, valid, skipped, errors, warnings, frontmatter }>
 * }
 */

/**
 * Generate a complete self-contained HTML report.
 *
 * @param {object} data
 * @returns {string}
 */
export function generateReport(data) {
  const safeData = serializeForScript(data);
  const title = `Vault Health - ${formatPercent(data.summary)}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7f4;
      --panel: #ffffff;
      --ink: #1f2933;
      --muted: #64707d;
      --line: #d9ded8;
      --good: #138a5b;
      --warn: #a86605;
      --bad: #ba2d2d;
      --accent: #2563eb;
      --shadow: 0 1px 2px rgba(20, 28, 38, 0.08);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f1117; --panel: #1a1d27; --ink: #e8eaf0; --muted: #8b90a0;
        --line: #2a2d3a; --good: #22c55e; --warn: #f59e0b; --bad: #ef4444; --accent: #3b82f6;
      }
    }
    html.dark {
      --bg: #0f1117; --panel: #1a1d27; --ink: #e8eaf0; --muted: #8b90a0;
      --line: #2a2d3a; --good: #22c55e; --warn: #f59e0b; --bad: #ef4444; --accent: #3b82f6;
    }
    #theme-toggle {
      background: transparent;
      border: 1px solid var(--line);
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      min-height: 32px;
      padding: 4px 8px;
    }
    @keyframes confetti-fall {
      0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
      100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
    }
    #shortcuts-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; align-items: center; justify-content: center; }
    #shortcuts-overlay.open { display: flex; }
    #shortcuts-overlay kbd {
      display: inline-block;
      background: var(--line);
      border: 1px solid var(--muted);
      border-radius: 4px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      padding: 1px 6px;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    header {
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    .wrap {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
    }
    .top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: end;
      padding: 28px 0 22px;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 28px; font-weight: 750; letter-spacing: 0; }
    h2 { font-size: 18px; margin-bottom: 12px; }
    h3 { font-size: 15px; }
    .meta { color: var(--muted); font-size: 13px; margin-top: 6px; overflow-wrap: anywhere; }
    .score {
      text-align: right;
      min-width: 180px;
    }
    .score strong { display: block; font-size: 34px; line-height: 1; }
    .score span { color: var(--muted); font-size: 13px; }
    main { padding: 24px 0 36px; }
    .tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    .tab {
      border: 0;
      border-bottom: 3px solid transparent;
      border-radius: 0;
      background: transparent;
      min-height: 46px;
      padding: 10px 14px 8px;
      color: var(--muted);
    }
    .tab.active {
      border-bottom-color: var(--accent);
      color: var(--ink);
    }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .intro {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      margin-bottom: 16px;
      padding: 16px;
    }
    .intro p {
      color: var(--muted);
      font-size: 14px;
      margin-top: 6px;
      max-width: 780px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .metric, .section, .doc {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .metric { padding: 14px 16px; }
    .metric .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .metric .value { font-size: 26px; font-weight: 750; margin-top: 4px; }
    .start-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .start-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 16px;
    }
    .start-card .step {
      color: var(--accent);
      font-size: 12px;
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: .04em;
      margin-bottom: 8px;
    }
    .start-card p {
      color: var(--muted);
      font-size: 14px;
      margin-top: 8px;
    }
    .workspace-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .workspace-grid input {
      min-width: 0;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
      gap: 16px;
      align-items: start;
    }
    .section { padding: 16px; margin-bottom: 16px; }
    .bar {
      height: 10px;
      background: #e6e9e5;
      border-radius: 999px;
      overflow: hidden;
    }
    .fill { height: 100%; background: var(--good); }
    .fill.warn { background: var(--warn); }
    .fill.bad { background: var(--bad); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: left; font-size: 14px; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    tr:last-child td { border-bottom: 0; }
    .path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 650;
      background: #eef2ff;
      color: #2449a8;
      white-space: nowrap;
    }
    .pill.good { background: #e8f6ef; color: var(--good); }
    .pill.warn { background: #fff4dc; color: var(--warn); }
    .pill.bad { background: #fde8e8; color: var(--bad); }
    .issue-list { display: grid; gap: 8px; }
    .issue-row { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 8px; align-items: start; }
    .count { color: var(--bad); font-weight: 750; }
    .doc { padding: 14px; margin-bottom: 10px; }
    .doc-head { display: flex; gap: 10px; justify-content: space-between; align-items: flex-start; }
    .messages { margin-top: 10px; display: grid; gap: 6px; }
    .message { color: var(--muted); font-size: 13px; }
    .message strong { color: var(--ink); }
    .empty { color: var(--muted); font-size: 14px; padding: 4px 0; }
    .builder-grid {
      display: grid;
      grid-template-columns: minmax(280px, 420px) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .form-grid { display: grid; gap: 10px; }
    label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; font-weight: 650; }
    input, select, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      font: inherit;
      font-size: 14px;
      padding: 9px 10px;
    }
    textarea {
      min-height: 430px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.45;
    }
    .field-row {
      display: grid;
      grid-template-columns: minmax(120px, 1fr) 110px 82px 32px;
      gap: 8px;
      align-items: end;
    }
    .check-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      color: var(--ink);
      font-size: 13px;
    }
    .check-row input { width: auto; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    button {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 650;
      min-height: 36px;
      padding: 7px 11px;
    }
    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    button.icon {
      width: 32px;
      min-height: 32px;
      padding: 0;
    }
    .builder-note {
      color: var(--muted);
      font-size: 13px;
      margin-top: 8px;
    }
    .filter-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 12px;
    }
    .toast {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 20;
      max-width: min(420px, calc(100vw - 32px));
      border: 1px solid var(--line);
      border-left: 4px solid var(--accent);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 12px 28px rgba(20, 28, 38, 0.18);
      color: var(--ink);
      font-size: 14px;
      padding: 12px 14px;
      transform: translateY(16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease, transform 120ms ease;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    .toast.good { border-left-color: var(--good); }
    .toast.warn { border-left-color: var(--warn); }
    .toast.bad { border-left-color: var(--bad); }

    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(20, 28, 38, .48);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.open { display: flex; }
    .modal-dialog {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: 0 20px 48px rgba(20, 28, 38, .22);
      width: min(440px, calc(100vw - 32px));
      max-height: min(560px, 80vh);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: modal-in 120ms ease;
    }
    @keyframes modal-in { from { opacity:0; transform:scale(.96) translateY(6px); } to { opacity:1; transform:none; } }
    .modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px 14px;
      border-bottom: 1px solid var(--line);
      flex-shrink: 0;
    }
    .modal-body { overflow-y: auto; padding: 8px; }
    .folder-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      text-align: left;
      border: 0;
      background: transparent;
      font: inherit;
      font-size: 14px;
      color: var(--ink);
    }
    .folder-item:hover, .folder-item:focus { background: var(--bg); outline: 0; }
    .folder-name { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .folder-meta { color: var(--muted); font-size: 12px; flex-shrink: 0; }
    @media (max-width: 860px) {
      .top, .layout, .grid, .start-grid, .builder-grid { grid-template-columns: 1fr; }
      .score { text-align: left; min-width: 0; }
      .wrap { width: min(100% - 24px, 1180px); }
      .field-row { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap top">
      <div>
        <h1>Vault Keeper</h1>
        <p class="meta" id="vault-root"></p>
        <p class="meta" id="generated-at"></p>
        <p class="meta" style="display:flex;align-items:center;gap:6px;margin-top:4px">
          <span id="sse-indicator" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--muted)" title="Live: connecting..."></span>
          <span style="font-size:12px">Live updates</span>
        </p>
      </div>
      <div class="score">
        <button type="button" id="theme-toggle" title="Toggle dark mode">🌙</button>
        <strong id="score"></strong>
        <span>valid documents</span>
        <div id="motivational-msg" style="font-size:13px;margin-top:6px;color:var(--muted)"></div>
        <button type="button" id="header-change-vault" style="display:block;margin-top:8px;font-size:12px;padding:5px 10px;">📂 Change vault</button>
      </div>
    </div>
    <nav class="wrap tabs" aria-label="Dashboard sections">
      <button type="button" class="tab active" data-tab="start-panel">Start</button>
      <button type="button" class="tab" data-tab="health-panel">Health</button>
      <button type="button" class="tab" data-tab="templates-panel">Create</button>
    </nav>
  </header>
  <main class="wrap">
    <section id="start-panel" class="tab-panel active">
      <div class="intro">
        <h2>Start</h2>
        <p>A vault is just the folder that stores your Markdown knowledge base, templates, and generated documents. Start the dashboard in server mode, choose an existing folder or create a new one, then validate either the whole vault or one file/folder.</p>
      </div>
      <section class="start-grid">
        <article class="start-card">
          <div class="step">Step 1</div>
          <h3>Choose or create vault</h3>
          <p>Run the dashboard without --root in an interactive terminal. The prompt lets you use the detected folder, choose another path, or scaffold a new vault.</p>
        </article>
        <article class="start-card">
          <div class="step">Step 2</div>
          <h3>Pick validation scope</h3>
          <p>Validate the whole vault when you want a health check, or choose one file/folder when you are editing a smaller area.</p>
        </article>
        <article class="start-card">
          <div class="step">Step 3</div>
          <h3>Create and validate</h3>
          <p>Use the Create tab to build templates, validate template rules, then write documents that save back into the selected vault.</p>
        </article>
      </section>
      <section class="section">
        <h2>Current Session</h2>
        <table>
          <tbody>
            <tr><th>Vault root</th><td class="path" id="start-root"></td></tr>
            <tr><th>Documentation root</th><td class="path" id="start-doc-root"></td></tr>
            <tr><th>Validation scope</th><td class="path" id="start-scope"></td></tr>
            <tr><th>Documents scanned</th><td id="start-scanned"></td></tr>
            <tr><th>Next action</th><td id="start-action"></td></tr>
          </tbody>
        </table>
      </section>
      <section class="section">
        <h2>Workspace Actions</h2>
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">
          <label style="flex:1;min-width:200px">
            Active folder
            <div style="display:flex;gap:6px;margin-top:5px">
              <select id="workspace-root" style="flex:1"></select>
              <button type="button" id="workspace-browse-btn" title="Browse any folder on this machine">📂</button>
              <button type="button" id="workspace-new-folder-toggle" title="Create a new subfolder">+ New</button>
            </div>
          </label>
        </div>
        <div id="new-folder-inline" style="display:none;margin-bottom:10px">
          <div style="display:flex;gap:8px;align-items:flex-end">
            <label style="flex:1">
              New folder name
              <input id="workspace-new-folder-name" value="" placeholder="my-subfolder" autocomplete="off">
            </label>
            <button type="button" class="primary" id="workspace-create-folder">Create</button>
            <button type="button" id="workspace-create-cancel">Cancel</button>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="primary" id="workspace-init">Init workspace</button>
          <button type="button" id="workspace-scan-folder-btn">Validate folder</button>
          <button type="button" id="workspace-scan-all">Validate whole vault</button>
          <button type="button" id="install-ai-kit">Install AI Workspace kit</button>
        </div>
        <p class="builder-note" id="workspace-status">Use these controls to create a documentation root, add subfolders, or rescan one folder.</p>
        <p class="builder-note" id="install-ai-kit-status">Adds context, tool, and AI context templates to the selected vault.</p>
      </section>
    </section>
    <section id="health-panel" class="tab-panel">
      <div class="intro">
        <h2>Health</h2>
        <p>Use this screen to see whether your Markdown vault follows its templates. Start with invalid documents and top issues.</p>
      </div>
      <section class="section">
        <h2>Rescan</h2>
        <div class="actions">
          <button type="button" class="primary" id="health-pick-folder-btn">📁 Choose folder to scan…</button>
          <button type="button" id="health-scan-all-btn">Scan whole vault</button>
        </div>
        <p class="builder-note" id="health-scan-status">Select a folder to validate it, or scan the whole vault to refresh all data.</p>
      </section>
      <section class="grid" id="metrics"></section>
      <section class="section">
        <h2>Compliance</h2>
        <div class="bar"><div class="fill" id="compliance-fill"></div></div>
      </section>
      <div class="layout">
        <div>
          <section class="section">
            <h2>Invalid Documents</h2>
            <div style="margin-bottom:10px">
              <input id="doc-search" placeholder="Search by filename or error…" autocomplete="off" style="width:100%">
            </div>
            <div class="filter-row">
              <label>
                Filter by type
                <select id="doc-type-filter"></select>
              </label>
              <label>
                Filter by folder
                <select id="folder-scope"></select>
              </label>
            </div>
            <div id="invalid-docs"></div>
          </section>
          <section class="section">
            <h2>By Folder</h2>
            <div id="folders"></div>
          </section>
        </div>
        <aside>
          <section class="section">
            <h2>Top Issues</h2>
            <div id="issues"></div>
          </section>
          <section class="section">
            <h2>By Type</h2>
            <div id="doc-types"></div>
          </section>
        </aside>
      </div>
    </section>
    <section id="templates-panel" class="tab-panel">
      <div class="intro">
        <h2>Create</h2>
        <p>Create a template, then write a document that uses it. In server mode, Save writes directly into your vault.</p>
      </div>
      <div class="builder-grid">
        <form class="form-grid" id="template-builder">
          <h3>Template Builder</h3>
          <label>
            Template type
            <select id="tpl-preset">
              <option value="decision">Decision</option>
              <option value="context">Context</option>
              <option value="tool">Tool</option>
              <option value="ai-context">AI Context</option>
            </select>
          </label>
          <label>
            Template name
            <input id="tpl-name" value="decision" pattern="[a-z][a-z0-9-]*" autocomplete="off">
          </label>
          <label>
            Document folder
            <input id="tpl-folder" value="decisions" autocomplete="off">
          </label>
          <label>
            Default sections
            <input id="tpl-sections" value="Overview, Details, References" autocomplete="off">
          </label>
          <div id="tpl-fields"></div>
          <div class="actions">
            <button type="button" id="tpl-add-field">Add field</button>
            <button type="button" id="tpl-validate">Validate template</button>
            <button type="button" class="primary" id="tpl-save">Save to vault</button>
            <button type="button" class="primary" id="tpl-copy">Copy template</button>
            <button type="button" id="tpl-download">Download .md</button>
          </div>
          <p class="builder-note" id="tpl-status">Create a template here, then save it under templates/&lt;name&gt;-template.md.</p>
        </form>
        <label>
          Generated template
          <textarea id="tpl-output" spellcheck="false"></textarea>
        </label>
      </div>
      <section class="section">
        <h2>Create Document</h2>
        <div class="builder-grid">
          <form class="form-grid" id="document-builder">
            <label>
              Document path
              <input id="doc-path" value="decisions/choose-database.md" autocomplete="off">
            </label>
            <label>
              Template path
              <input id="doc-template" value="templates/decision-template.md" autocomplete="off">
            </label>
            <label>
              Title
              <input id="doc-title" value="Choose database" autocomplete="off">
            </label>
            <label>
              Status
              <input id="doc-status" value="draft" autocomplete="off">
            </label>
            <label>
              Owner
              <input id="doc-owner" value="@me" autocomplete="off">
            </label>
            <label>
              Body
              <textarea id="doc-body" spellcheck="true">## Overview

Write the decision summary here.

## Details

Add options and tradeoffs here.

## References

Add links here.</textarea>
            </label>
            <div class="actions">
              <button type="button" class="primary" id="doc-save">Save and validate</button>
              <button type="button" id="doc-copy">Copy document</button>
            </div>
            <p class="builder-note" id="doc-status-text">Choose a path, write the document, then save it into the vault.</p>
          </form>
          <label>
            Generated document
            <textarea id="doc-output" spellcheck="false"></textarea>
          </label>
        </div>
      </section>
    </section>
  </main>
  <script id="vault-data" type="application/json">${safeData}</script>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <div id="confetti-container" style="position:fixed;top:0;left:0;width:100%;height:0;pointer-events:none;z-index:999;overflow:visible"></div>
  <div id="shortcuts-overlay" role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
    <div style="background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:24px;min-width:320px">
      <h3 style="margin:0 0 16px">Keyboard Shortcuts</h3>
      <table style="width:100%;font-size:14px">
        <tbody>
          <tr><td style="padding:6px 8px"><kbd>h</kbd></td><td style="padding:6px 8px">Switch to Health tab</td></tr>
          <tr><td style="padding:6px 8px"><kbd>s</kbd></td><td style="padding:6px 8px">Switch to Start tab</td></tr>
          <tr><td style="padding:6px 8px"><kbd>c</kbd></td><td style="padding:6px 8px">Switch to Create tab</td></tr>
          <tr><td style="padding:6px 8px"><kbd>r</kbd></td><td style="padding:6px 8px">Scan whole vault</td></tr>
          <tr><td style="padding:6px 8px"><kbd>Esc</kbd></td><td style="padding:6px 8px">Close any open modal</td></tr>
          <tr><td style="padding:6px 8px"><kbd>?</kbd></td><td style="padding:6px 8px">Toggle this shortcuts panel</td></tr>
        </tbody>
      </table>
      <p style="margin:12px 0 0;color:var(--muted);font-size:12px">Press ? or Escape to close</p>
    </div>
  </div>
  <div class="modal-overlay" id="folder-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="folder-picker-title">
    <div class="modal-dialog">
      <div class="modal-head">
        <h3 id="folder-picker-title" style="font-size:16px;margin:0">Choose a folder to scan</h3>
        <button type="button" class="icon" id="folder-picker-close" aria-label="Close">&#x2715;</button>
      </div>
      <div style="padding:10px 14px;border-bottom:1px solid var(--line);display:flex;gap:8px">
        <input id="folder-picker-path-input" style="flex:1;font-size:13px" placeholder="Type any path or browse the filesystem…" autocomplete="off">
        <button type="button" id="folder-picker-browse-btn" title="Browse filesystem">📂</button>
        <button type="button" id="folder-picker-scan-typed">Scan</button>
      </div>
      <div class="modal-body" id="folder-picker-list"></div>
    </div>
  </div>
  <script>
    const data = JSON.parse(document.getElementById('vault-data').textContent);
    const summary = data.summary || {};
    const validated = Math.max(0, (summary.total || 0) - (summary.skipped || 0));
    const rate = validated > 0 ? (summary.valid || 0) / validated : 1;
    const pct = (rate * 100).toFixed(1) + '%';
    const statusClass = rate >= 0.95 ? 'good' : rate >= 0.8 ? 'warn' : 'bad';

    const text = (value) => String(value ?? '');
    const relPath = (path) => {
      const root = data.vaultRoot || '';
      return root && path && path.startsWith(root) ? path.slice(root.length).replace(/^\\//, '') : path;
    };
    const el = (tag, attrs = {}, children = []) => {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = text(value);
        else node.setAttribute(key, value);
      }
      for (const child of children) node.append(child);
      return node;
    };
    const toast = document.getElementById('toast');
    let toastTimer = null;
    const notify = (message, tone = '') => {
      toast.textContent = message;
      toast.className = 'toast show' + (tone ? ' ' + tone : '');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.classList.remove('show');
      }, 5200);
    };

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'health-panel') {
          const ds = document.getElementById('doc-search');
          if (ds) ds.focus();
        }
      });
    });

    document.getElementById('vault-root').textContent = data.vaultRoot ? 'root: ' + data.vaultRoot : '';
    document.getElementById('generated-at').textContent = data.generatedAt ? 'generated: ' + new Date(data.generatedAt).toLocaleString() : '';
    document.getElementById('start-root').textContent = data.vaultRoot || '';
    document.getElementById('start-doc-root').textContent = (data.workspace && data.workspace.docsRoot) || 'documentations';
    document.getElementById('start-scope').textContent = data.scopePath || 'all configured folders';
    document.getElementById('start-scanned').textContent = String(summary.total || 0);
    document.getElementById('start-action').textContent = (summary.invalid || 0) > 0
      ? 'Open Health to fix invalid documents, or Create to make a valid template/document pair.'
      : 'Open Create to add templates and documents to this vault. Use setup to choose the init folder.';
    const workspace = {
      root: document.getElementById('workspace-root'),
      newFolderToggle: document.getElementById('workspace-new-folder-toggle'),
      newFolderInline: document.getElementById('new-folder-inline'),
      newFolderName: document.getElementById('workspace-new-folder-name'),
      createCancel: document.getElementById('workspace-create-cancel'),
      scanAll: document.getElementById('workspace-scan-all'),
      init: document.getElementById('workspace-init'),
      createFolder: document.getElementById('workspace-create-folder'),
      scanFolderButton: document.getElementById('workspace-scan-folder-btn'),
      status: document.getElementById('workspace-status'),
    };

    // Seed the select immediately from embedded scan data (sync), then enrich from server API (async)
    const defaultFolder = (data.workspace && data.workspace.docsRoot) || 'documentations';
    const seedFolders = new Set([
      defaultFolder,
      ...((data.workspace && data.workspace.vaultFolders) || []),
      ...Object.keys(summary.byFolder || {}).map((f) => f.endsWith('/') ? f.slice(0, -1) : f).filter((f) => f && f !== '.'),
    ]);
    for (const f of [...seedFolders].sort()) {
      workspace.root.append(el('option', { value: f, text: f }));
    }
    if (!workspace.root.options.length) {
      workspace.root.append(el('option', { value: defaultFolder, text: defaultFolder }));
    }
    workspace.root.value = defaultFolder;

    // Async refresh: fetch actual folders from server and merge into select
    const refreshFolderSelect = async (selectValue) => {
      try {
        const apiRes = await fetch('/api/vault/folders');
        if (!apiRes.ok) return;
        const apiData = await apiRes.json();
        const current = selectValue || workspace.root.value || defaultFolder;
        const merged = new Set([...seedFolders, ...(apiData.folders || [])]);
        workspace.root.textContent = '';
        for (const f of [...merged].filter(Boolean).sort()) {
          const opt = el('option', { value: f, text: f });
          if (f === current) opt.selected = true;
          workspace.root.append(opt);
        }
        if (!workspace.root.options.length) {
          workspace.root.append(el('option', { value: defaultFolder, text: defaultFolder }));
        }
        workspace.root.value = current;
      } catch { /* static mode — keep seed folders */ }
    };
    refreshFolderSelect();

    const docsRootValue = () => normalizePath(workspace.root.value) || 'documentations';

    // Inline new-folder form toggle
    workspace.newFolderToggle.addEventListener('click', () => {
      const isHidden = workspace.newFolderInline.style.display === 'none';
      workspace.newFolderInline.style.display = isHidden ? 'block' : 'none';
      if (isHidden) workspace.newFolderName.focus();
    });
    workspace.createCancel.addEventListener('click', () => {
      workspace.newFolderInline.style.display = 'none';
      workspace.newFolderName.value = '';
    });
    const normalizePath = (value) => String(value || '')
      .trim()
      .replaceAll('\\\\', '/')
      .split('/')
      .filter(Boolean)
      .join('/');
    const joinPath = (...parts) => parts
      .map((part) => normalizePath(part))
      .filter(Boolean)
      .join('/');
    const installAiKit = document.getElementById('install-ai-kit');
    const installAiKitStatus = document.getElementById('install-ai-kit-status');
    document.getElementById('score').textContent = pct;
    const fill = document.getElementById('compliance-fill');
    fill.style.width = pct;
    fill.classList.add(statusClass);

    const metrics = [
      ['Valid', summary.valid || 0, 'good'],
      ['Invalid', summary.invalid || 0, (summary.invalid || 0) > 0 ? 'bad' : 'good'],
      ['Warnings', summary.warningCount || 0, (summary.warningCount || 0) > 0 ? 'warn' : 'good'],
      ['Scanned', summary.total || 0, ''],
    ];
    document.getElementById('metrics').append(...metrics.map(([label, value, tone]) =>
      el('article', { class: 'metric' }, [
        el('div', { class: 'label', text: label }),
        el('div', { class: 'value ' + tone, text: value }),
      ]),
    ));

    const folderEntries = Object.entries(summary.byFolder || {});
    const folders = document.getElementById('folders');
    if (folderEntries.length === 0) {
      folders.append(el('p', { class: 'empty', text: 'No folder data.' }));
    } else {
      const table = el('table');
      table.append(el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Folder' }),
        el('th', { text: 'Valid' }),
        el('th', { text: 'Rate' }),
      ])]));
      const body = el('tbody');
      for (const [folder, stats] of folderEntries) {
        const folderRate = stats.total > 0 ? stats.valid / stats.total : 1;
        body.append(el('tr', {}, [
          el('td', { class: 'path', text: folder }),
          el('td', { text: String(stats.valid) + '/' + String(stats.total) }),
          el('td', {}, [el('span', { class: 'pill ' + (folderRate >= 0.95 ? 'good' : folderRate >= 0.8 ? 'warn' : 'bad'), text: (folderRate * 100).toFixed(0) + '%' })]),
        ]));
      }
      table.append(body);
      folders.append(table);
    }

    const docTypeEntries = Object.entries(summary.byDocType || {});
    const docTypes = document.getElementById('doc-types');
    if (docTypeEntries.length === 0) {
      docTypes.append(el('p', { class: 'empty', text: 'No document type data.' }));
    } else {
      const table = el('table');
      table.append(el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Type' }),
        el('th', { text: 'Valid' }),
        el('th', { text: 'Rate' }),
      ])]));
      const body = el('tbody');
      for (const [docType, stats] of docTypeEntries) {
        const typeRate = stats.total > 0 ? stats.valid / stats.total : 1;
        body.append(el('tr', {}, [
          el('td', { class: 'path', text: docType }),
          el('td', { text: String(stats.valid) + '/' + String(stats.total) }),
          el('td', {}, [el('span', { class: 'pill ' + (typeRate >= 0.95 ? 'good' : typeRate >= 0.8 ? 'warn' : 'bad'), text: (typeRate * 100).toFixed(0) + '%' })]),
        ]));
      }
      table.append(body);
      docTypes.append(table);
    }

    const issues = Object.entries(summary.commonIssues || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const issueRoot = document.getElementById('issues');
    if (issues.length === 0) {
      issueRoot.append(el('p', { class: 'empty', text: 'No issues found.' }));
    } else {
      const list = el('div', { class: 'issue-list' });
      for (const [issue, count] of issues) {
        list.append(el('div', { class: 'issue-row' }, [
          el('span', { class: 'count', text: count + 'x' }),
          el('span', { text: issue }),
        ]));
      }
      issueRoot.append(list);
    }

    const docTypeFilter = document.getElementById('doc-type-filter');
    const folderScopeFilter = document.getElementById('folder-scope');
    const docSearch = document.getElementById('doc-search');
    const allTypeOption = el('option', { value: 'all', text: 'All types' });
    docTypeFilter.append(allTypeOption);
    for (const docType of Object.keys(summary.byDocType || {}).sort()) {
      docTypeFilter.append(el('option', { value: docType, text: docType }));
    }
    const allFolderOption = el('option', { value: 'all', text: 'All folders' });
    folderScopeFilter.append(allFolderOption);
    for (const folder of Object.keys(summary.byFolder || {}).sort()) {
      folderScopeFilter.append(el('option', { value: folder, text: folder }));
    }
    const folderOfPath = (path) => {
      const rel = relPath(path || '');
      if (!rel || !rel.includes('/')) return './';
      return rel.slice(0, rel.lastIndexOf('/') + 1);
    };

    const attachInlineEditor = (article, docRelPath) => {
      const textarea = el('textarea', { style: 'width:100%;min-height:200px;font-family:monospace;font-size:12px;line-height:1.5;border:1px solid var(--line);border-radius:6px;padding:8px;background:var(--bg);color:var(--ink);resize:vertical' });
      const saveBtn = el('button', { class: 'primary save-btn', type: 'button', text: 'Save & validate' });
      const cancelBtn = el('button', { class: 'cancel-btn', type: 'button', text: 'Cancel' });
      const editorStatus = el('span', { class: 'editor-status', style: 'flex:1;font-size:12px;color:var(--muted)' });
      const editorActions = el('div', { style: 'display:flex;gap:8px;margin-top:8px;align-items:center' }, [saveBtn, cancelBtn, editorStatus]);
      const inlineEditor = el('div', { class: 'inline-editor', style: 'display:none;margin-top:12px' }, [textarea, editorActions]);

      const messagesEl = article.querySelector('.messages');
      if (messagesEl) messagesEl.after(inlineEditor);
      else article.append(inlineEditor);

      const editBtn = el('button', { class: 'edit-btn', type: 'button', style: 'font-size:12px;padding:4px 10px', text: 'Edit' });
      const docHead = article.querySelector('.doc-head');
      if (docHead) docHead.append(editBtn);

      editBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/documents?path=' + encodeURIComponent(docRelPath));
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) { notify('Failed to load file: ' + (payload.error || 'unknown'), 'bad'); return; }
          textarea.value = payload.content || '';
          inlineEditor.style.display = 'block';
          editBtn.style.display = 'none';
          textarea.focus();
        } catch (err) {
          notify('Failed to load file: ' + err.message, 'bad');
        }
      });

      cancelBtn.addEventListener('click', () => {
        inlineEditor.style.display = 'none';
        editBtn.style.display = '';
        editorStatus.textContent = '';
      });

      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        editorStatus.textContent = 'Saving...';
        try {
          const res = await fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: docRelPath, content: textarea.value, force: true }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) { editorStatus.textContent = 'Error: ' + (payload.error || 'save failed'); saveBtn.disabled = false; return; }
          const errs = payload.validation && payload.validation.errors ? payload.validation.errors : [];
          const warns = payload.validation && payload.validation.warnings ? payload.validation.warnings : [];
          if (errs.length === 0) {
            editorStatus.textContent = 'All errors fixed!';
            if (messagesEl) messagesEl.textContent = '';
            const successMsg = el('div', { class: 'message' }, [el('strong', { text: 'All errors fixed!' })]);
            if (messagesEl) messagesEl.append(successMsg);
          } else {
            editorStatus.textContent = errs.length + ' error(s) remain';
            if (messagesEl) {
              messagesEl.textContent = '';
              const combined = [...errs, ...warns].slice(0, 4);
              for (const msg of combined) {
                messagesEl.append(el('div', { class: 'message' }, [
                  el('strong', { text: (msg.field || 'document') + ': ' }),
                  document.createTextNode(msg.message || ''),
                ]));
              }
            }
          }
        } catch (err) {
          editorStatus.textContent = 'Save failed: ' + err.message;
        } finally {
          saveBtn.disabled = false;
        }
      });
    };

    const attachAutoFix = (article, docRelPath) => {
      const fixBtn = el('button', { class: 'autofix-btn', type: 'button', style: 'font-size:12px;padding:4px 10px', text: 'Auto-fix' });
      const docHead = article.querySelector('.doc-head');
      if (docHead) docHead.append(fixBtn);

      fixBtn.addEventListener('click', async () => {
        fixBtn.disabled = true;
        fixBtn.textContent = 'Fixing...';
        try {
          const res = await fetch('/api/documents/fix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: docRelPath }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) { notify('Auto-fix failed: ' + (payload.error || 'unknown'), 'bad'); fixBtn.disabled = false; fixBtn.textContent = 'Auto-fix'; return; }
          const fixed = payload.fixed || 0;
          const errs = payload.validation && payload.validation.errors ? payload.validation.errors : [];
          const warns = payload.validation && payload.validation.warnings ? payload.validation.warnings : [];
          if (fixed > 0) {
            const changes = Array.isArray(payload.changes) ? payload.changes : [];
            notify('Auto-fixed ' + fixed + ' field(s): ' + (changes.length ? changes.join(', ') : 'done'), 'good');
          } else {
            notify('Auto-fix: nothing automatable in ' + docRelPath, 'warn');
          }
          const messagesEl = article.querySelector('.messages');
          if (messagesEl) {
            messagesEl.textContent = '';
            if (errs.length === 0 && warns.length === 0) {
              messagesEl.append(el('div', { class: 'message' }, [el('strong', { text: 'All errors fixed!' })]));
            } else {
              const combined = [...errs, ...warns].slice(0, 4);
              for (const msg of combined) {
                messagesEl.append(el('div', { class: 'message' }, [
                  el('strong', { text: (msg.field || 'document') + ': ' }),
                  document.createTextNode(msg.message || ''),
                ]));
              }
            }
          }
        } catch (err) {
          notify('Auto-fix error: ' + err.message, 'bad');
        } finally {
          fixBtn.disabled = false;
          fixBtn.textContent = 'Auto-fix';
        }
      });
    };

    const docsRoot = document.getElementById('invalid-docs');
    const renderInvalidDocs = () => {
      docsRoot.textContent = '';
      const selectedType = docTypeFilter.value;
      const selectedFolder = folderScopeFilter.value;
      const query = String(docSearch ? docSearch.value || '' : '').trim().toLowerCase();
      const invalidDocs = (data.results || [])
        .filter((result) => !result.valid && !result.skipped)
        .filter((result) => selectedType === 'all' || (result.docType || 'unknown') === selectedType)
        .filter((result) => selectedFolder === 'all' || folderOfPath(result.filepath) === selectedFolder)
        .filter((result) => {
          if (!query) return true;
          const fp = String(result.filepath || '').toLowerCase();
          if (fp.includes(query)) return true;
          const allMessages = [...(result.errors || []), ...(result.warnings || [])];
          return allMessages.some((m) => String(m.message || '').toLowerCase().includes(query) || String(m.field || '').toLowerCase().includes(query));
        });
      if (invalidDocs.length === 0) {
        docsRoot.append(el('p', { class: 'empty', text: 'No invalid documents for the selected filters.' }));
      } else {
        for (const doc of invalidDocs.slice(0, 20)) {
          const messages = [...(doc.errors || []), ...(doc.warnings || [])].slice(0, 4);
          const docRelPathVal = relPath(doc.filepath);
          const article = el('article', { class: 'doc' }, [
            el('div', { class: 'doc-head' }, [
              el('h3', { class: 'path', text: docRelPathVal }),
              el('span', { class: 'pill bad', text: (doc.errors || []).length + ' errors' }),
            ]),
            el('div', { class: 'messages' }, messages.map((message) =>
              el('div', { class: 'message' }, [
                el('strong', { text: (message.field || 'document') + ': ' }),
                document.createTextNode(message.message || ''),
              ]),
            )),
          ]);
          attachAutoFix(article, docRelPathVal);
          attachInlineEditor(article, docRelPathVal);
          docsRoot.append(article);
        }
      }
    };
    docTypeFilter.addEventListener('change', renderInvalidDocs);
    folderScopeFilter.addEventListener('change', renderInvalidDocs);
    if (docSearch) docSearch.addEventListener('input', renderInvalidDocs);
    renderInvalidDocs();

    const builder = {
      preset: document.getElementById('tpl-preset'),
      name: document.getElementById('tpl-name'),
      folder: document.getElementById('tpl-folder'),
      sections: document.getElementById('tpl-sections'),
      fields: document.getElementById('tpl-fields'),
      output: document.getElementById('tpl-output'),
      status: document.getElementById('tpl-status'),
      add: document.getElementById('tpl-add-field'),
      save: document.getElementById('tpl-save'),
      copy: document.getElementById('tpl-copy'),
      download: document.getElementById('tpl-download'),
      validate: document.getElementById('tpl-validate'),
    };
    const documentBuilder = {
      path: document.getElementById('doc-path'),
      template: document.getElementById('doc-template'),
      title: document.getElementById('doc-title'),
      status: document.getElementById('doc-status'),
      owner: document.getElementById('doc-owner'),
      body: document.getElementById('doc-body'),
      output: document.getElementById('doc-output'),
      save: document.getElementById('doc-save'),
      copy: document.getElementById('doc-copy'),
      statusText: document.getElementById('doc-status-text'),
    };
    const fieldTypes = ['string', 'array', 'date', 'integer', 'number', 'boolean'];
    const templatePresets = {
      decision: {
        name: 'decision',
        folder: 'decisions',
        sections: 'Overview, Details, References',
        docSlug: 'choose-database.md',
        title: 'Choose database',
        body: '## Overview\\n\\nWrite the decision summary here.\\n\\n## Details\\n\\nAdd options and tradeoffs here.\\n\\n## References\\n\\nAdd links here.',
        fields: [
          { name: 'title', type: 'string', required: true },
          { name: 'status', type: 'string', required: true },
          { name: 'owner', type: 'string', required: false },
          { name: 'tags', type: 'array', required: false },
        ],
      },
      context: {
        name: 'context',
        folder: 'contexts',
        sections: 'Purpose, Facts, Constraints, References',
        docSlug: 'project-overview.md',
        title: 'Project overview',
        body: '## Purpose\\n\\nWhat this context helps the AI understand.\\n\\n## Facts\\n\\nStable facts the assistant should preserve.\\n\\n## Constraints\\n\\nBoundaries, assumptions, and rules.\\n\\n## References',
        fields: [
          { name: 'title', type: 'string', required: true },
          { name: 'scope', type: 'string', required: true },
          { name: 'status', type: 'string', required: true },
          { name: 'owner', type: 'string', required: true },
          { name: 'updated_at', type: 'date', required: true },
          { name: 'tags', type: 'array', required: false },
        ],
      },
      tool: {
        name: 'tool',
        folder: 'tools',
        sections: 'Capability, Inputs, Outputs, Safety Notes',
        docSlug: 'vault-keeper-dashboard.md',
        title: 'Vault Keeper dashboard',
        body: '## Capability\\n\\nWhat the tool can do.\\n\\n## Inputs\\n\\nExpected arguments, files, env vars, or UI state.\\n\\n## Outputs\\n\\nFiles, responses, side effects, or reports produced.\\n\\n## Safety Notes\\n\\nRisks, permissions, and when not to use it.',
        fields: [
          { name: 'title', type: 'string', required: true },
          { name: 'tool_type', type: 'string', required: true },
          { name: 'command', type: 'string', required: false },
          { name: 'status', type: 'string', required: true },
          { name: 'owner', type: 'string', required: true },
        ],
      },
      'ai-context': {
        name: 'ai-context',
        folder: 'ai-context',
        sections: 'Operating Instructions, Relevant Context, Do Not',
        docSlug: 'codex-project-rules.md',
        title: 'Codex project rules',
        body: '## Operating Instructions\\n\\nInstructions the AI should follow.\\n\\n## Relevant Context\\n\\nProject facts, glossary, and assumptions.\\n\\n## Do Not\\n\\nBehaviors, tools, or changes the AI should avoid.',
        fields: [
          { name: 'title', type: 'string', required: true },
          { name: 'audience', type: 'string', required: true },
          { name: 'context_type', type: 'string', required: true },
          { name: 'priority', type: 'integer', required: false },
          { name: 'status', type: 'string', required: true },
        ],
      },
    };

    const slug = (value, fallback) => {
      const clean = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return /^[a-z]/.test(clean) ? clean : fallback;
    };
    const titleCase = (value) => value
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    const createFieldRow = (field = {}) => {
      const row = el('div', { class: 'field-row' });
      const name = el('input', { value: field.name || '', placeholder: 'field_name' });
      const type = el('select');
      for (const item of fieldTypes) {
        const option = el('option', { value: item, text: item });
        if ((field.type || 'string') === item) option.selected = true;
        type.append(option);
      }
      const required = el('label', { class: 'check-row' }, [
        el('input', { type: 'checkbox' }),
        document.createTextNode('Required'),
      ]);
      required.querySelector('input').checked = Boolean(field.required);
      const remove = el('button', { type: 'button', class: 'icon', title: 'Remove field', text: 'x' });
      remove.addEventListener('click', () => {
        row.remove();
        renderTemplate();
      });
      for (const input of [name, type, required.querySelector('input')]) {
        input.addEventListener('input', renderTemplate);
        input.addEventListener('change', renderTemplate);
      }
      row.append(name, type, required, remove);
      builder.fields.append(row);
    };

    const resetFields = (fields) => {
      builder.fields.textContent = '';
      for (const field of fields) createFieldRow(field);
    };

    const readFields = () => Array.from(builder.fields.querySelectorAll('.field-row'))
      .map((row) => {
        const inputs = row.querySelectorAll('input');
        return {
          name: slug(inputs[0].value, ''),
          type: row.querySelector('select').value,
          required: inputs[1].checked,
        };
      })
      .filter((field) => field.name && !['template', '$path'].includes(field.name));

    const renderTemplate = () => {
      const docsRoot = docsRootValue();
      const name = slug(builder.name.value, 'document');
      const folder = slug(builder.folder.value, name + 's');
      const sections = builder.sections.value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const displayName = titleCase(name);
      const fields = readFields();
      const scopedFolder = joinPath(docsRoot, folder);
      const fieldLines = fields.map((field) => [
        '  ' + field.name + ':',
        '    type: ' + field.type,
        field.required ? '    required: true' : '',
        field.name === 'status' ? '    enum: [draft, review, approved, archived]' : '',
        field.type === 'array' ? '    uniqueItems: true' : '',
      ].filter(Boolean).join('\\n')).join('\\n\\n');
      const sectionList = sections.map((section) => '  - ' + section).join('\\n');
      const bodySections = sections.map((section, index) => [
        '## ' + section,
        '',
        index === 0 ? '\\\`\\\`\\\`yaml section-rules\\nrequired: true\\n\\\`\\\`\\\`\\n' : '',
        index === 0 ? 'Write the required ' + section.toLowerCase() + ' content here.' : 'Add ' + section.toLowerCase() + ' content here.',
      ].filter(Boolean).join('\\n')).join('\\n\\n');

      builder.output.value = [
        '---',
        'template_path: templates/' + name + '-template.md',
        'document_type: ' + name,
        'sections:',
        sectionList || '  - Overview',
        'fields:',
        '  $path:',
        "    pattern: '^" + scopedFolder + "/[a-z0-9-]+\\\\.md$'",
        '',
        '  template:',
        '    required: true',
        '',
        fieldLines || '  title:\\n    type: string\\n    required: true',
        '---',
        '',
        '# ' + displayName + ' template',
        '',
        bodySections || '## Overview\\n\\n\\\`\\\`\\\`yaml section-rules\\nrequired: true\\n\\\`\\\`\\\`\\n\\nWrite the required overview content here.',
        '',
      ].join('\\n');
      documentBuilder.template.value = 'templates/' + name + '-template.md';
      const docBase = documentBuilder.path.value.split('/').pop() || 'new-document.md';
      if (!documentBuilder.path.dataset.touched) {
        documentBuilder.path.value = joinPath(scopedFolder, docBase);
      }
      renderDocument();
    };

    const renderDocument = () => {
      const templatePath = documentBuilder.template.value.trim() || 'templates/document-template.md';
      const documentType = templatePath
        .split('/')
        .pop()
        .replace(/-template\\.md$/, '')
        .replace(/\\.md$/, '') || 'document';
      const title = documentBuilder.title.value.trim() || 'Untitled';
      const status = documentBuilder.status.value.trim() || 'draft';
      const owner = documentBuilder.owner.value.trim() || '@me';
      const body = documentBuilder.body.value.trim();
      documentBuilder.output.value = [
        '---',
        'template: ' + templatePath,
        'document_type: ' + documentType,
        'title: ' + title,
        'status: ' + status,
        "owner: '" + owner.replaceAll("'", "''") + "'",
        '---',
        '',
        '# ' + title,
        '',
        body,
        '',
      ].join('\\n');
    };

    builder.add.addEventListener('click', () => {
      createFieldRow({ name: 'new_field', type: 'string', required: false });
      renderTemplate();
    });
    workspace.root.addEventListener('change', () => {
      document.getElementById('start-doc-root').textContent = docsRootValue();
      renderTemplate();
      renderDocument();
    });
    builder.preset.addEventListener('change', () => {
      const preset = templatePresets[builder.preset.value] || templatePresets.decision;
      builder.name.value = preset.name;
      builder.folder.value = preset.folder;
      builder.sections.value = preset.sections;
      documentBuilder.path.value = joinPath(docsRootValue(), preset.folder, preset.docSlug);
      delete documentBuilder.path.dataset.touched;
      documentBuilder.title.value = preset.title;
      documentBuilder.status.value = 'draft';
      documentBuilder.owner.value = '@me';
      documentBuilder.body.value = preset.body;
      resetFields(preset.fields);
      renderTemplate();
    });
    for (const input of [builder.name, builder.folder, builder.sections]) {
      input.addEventListener('input', renderTemplate);
    }
    documentBuilder.path.addEventListener('input', () => {
      documentBuilder.path.dataset.touched = 'true';
    });
    for (const input of [
      documentBuilder.template,
      documentBuilder.title,
      documentBuilder.status,
      documentBuilder.owner,
      documentBuilder.body,
    ]) {
      input.addEventListener('input', renderDocument);
    }
    builder.copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(builder.output.value);
        builder.status.textContent = 'Template copied. Save it under templates/' + slug(builder.name.value, 'document') + '-template.md.';
        notify('Template copied.', 'good');
      } catch {
        builder.output.select();
        builder.status.textContent = 'Clipboard unavailable. Select the generated template and copy it manually.';
        notify('Clipboard unavailable. Select the generated template and copy it manually.', 'warn');
      }
    });
    builder.save.addEventListener('click', async () => {
      const name = slug(builder.name.value, 'document');
      builder.status.textContent = 'Saving template...';
      notify('Saving template...', 'warn');
      try {
        const response = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, content: builder.output.value }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to save template');
        }
        builder.status.textContent = 'Saved ' + payload.relativePath + '. Run vault-keeper lint-templates to validate it.';
        notify('Saved ' + payload.relativePath + '.', 'good');
      } catch (error) {
        builder.status.textContent = 'Save requires server mode: vault-keeper dashboard --serve. ' + error.message;
        notify('Template save failed: ' + error.message, 'bad');
      }
    });
    builder.validate.addEventListener('click', async () => {
      builder.status.textContent = 'Validating template...';
      notify('Validating template...', 'warn');
      try {
        const response = await fetch('/api/templates/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: builder.output.value }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to validate template');
        }
        if (payload.valid) {
          builder.status.textContent = 'Template rules look valid.';
          notify('Template rules look valid.', 'good');
          return;
        }
        const issues = Array.isArray(payload.issues) ? payload.issues : [];
        const firstIssue = issues[0]?.message ? ' First issue: ' + issues[0].message : '';
        builder.status.textContent = 'Template has ' + issues.length + ' issue(s).' + firstIssue;
        notify('Template has ' + issues.length + ' issue(s).', 'bad');
      } catch (error) {
        builder.status.textContent = 'Validate requires server mode: vault-keeper dashboard --serve. ' + error.message;
        notify('Template validate failed: ' + error.message, 'bad');
      }
    });
    builder.download.addEventListener('click', () => {
      const name = slug(builder.name.value, 'document');
      const blob = new Blob([builder.output.value], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const link = el('a', { href: url, download: name + '-template.md' });
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      builder.status.textContent = 'Downloaded ' + name + '-template.md. Move it into your vault templates/ folder.';
      notify('Downloaded ' + name + '-template.md.', 'good');
    });
    documentBuilder.copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(documentBuilder.output.value);
        documentBuilder.statusText.textContent = 'Document copied. Save it at ' + documentBuilder.path.value + '.';
        notify('Document copied.', 'good');
      } catch {
        documentBuilder.output.select();
        documentBuilder.statusText.textContent = 'Clipboard unavailable. Select the generated document and copy it manually.';
        notify('Clipboard unavailable. Select the generated document and copy it manually.', 'warn');
      }
    });
    documentBuilder.save.addEventListener('click', async () => {
      documentBuilder.statusText.textContent = 'Saving and validating document...';
      notify('Saving and validating document...', 'warn');
      try {
        const response = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: documentBuilder.path.value,
            content: documentBuilder.output.value,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to save document');
        }
        const errors = payload.validation?.errors?.length || 0;
        const warnings = payload.validation?.warnings?.length || 0;
        documentBuilder.statusText.textContent = 'Saved ' + payload.relativePath + '. Validation: ' + errors + ' errors, ' + warnings + ' warnings.';
        notify('Saved ' + payload.relativePath + ': ' + errors + ' errors, ' + warnings + ' warnings.', errors > 0 ? 'bad' : 'good');
      } catch (error) {
        documentBuilder.statusText.textContent = 'Save requires server mode: vault-keeper dashboard --serve. ' + error.message;
        notify('Document save failed: ' + error.message, 'bad');
      }
    });
    workspace.init.addEventListener('click', async () => {
      workspace.init.disabled = true;
      workspace.status.textContent = 'Initializing workspace...';
      notify('Initializing workspace...', 'warn');
      try {
        const response = await fetch('/api/workspace/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docsRoot: docsRootValue() }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to initialize workspace');
        }
        const created = Array.isArray(payload.created) ? payload.created.length : 0;
        const skipped = Array.isArray(payload.skipped) ? payload.skipped.length : 0;
        const message = 'Initialized ' + payload.docsRoot + ': ' + created + ' created, ' + skipped + ' skipped. Reloading...';
        workspace.status.textContent = message;
        notify(message, 'good');
        window.setTimeout(() => window.location.reload(), 350);
      } catch (error) {
        workspace.status.textContent = 'Init failed: ' + error.message;
        notify('Workspace init failed: ' + error.message, 'bad');
      } finally {
        workspace.init.disabled = false;
      }
    });
    workspace.createFolder.addEventListener('click', async () => {
      workspace.createFolder.disabled = true;
      const folderName = normalizePath(workspace.newFolderName.value);
      const path = folderName ? normalizePath(docsRootValue() + '/' + folderName) : docsRootValue();
      workspace.status.textContent = 'Creating folder...';
      notify('Creating folder...', 'warn');
      try {
        const response = await fetch('/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to create folder');
        }
        workspace.newFolderInline.style.display = 'none';
        workspace.newFolderName.value = '';
        await refreshFolderSelect(path);
        const message = 'Created folder ' + payload.relativePath + '.';
        workspace.status.textContent = message;
        notify(message, 'good');
      } catch (error) {
        workspace.status.textContent = 'Create folder failed: ' + error.message;
        notify('Create folder failed: ' + error.message, 'bad');
      } finally {
        workspace.createFolder.disabled = false;
      }
    });
    workspace.scanFolderButton.addEventListener('click', async () => {
      workspace.scanFolderButton.disabled = true;
      const path = normalizePath(workspace.root.value);
      workspace.status.textContent = 'Checking folder...';
      notify('Checking folder...', 'warn');
      try {
        const response = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(path ? { path } : {}),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to scan folder');
        }
        const scope = payload.scopePath || 'all configured folders';
        const message = 'Checked ' + scope + '. Reloading...';
        workspace.status.textContent = message;
        notify(message, 'good');
        window.setTimeout(() => window.location.reload(), 250);
      } catch (error) {
        workspace.status.textContent = 'Check failed: ' + error.message;
        notify('Check failed: ' + error.message, 'bad');
      } finally {
        workspace.scanFolderButton.disabled = false;
      }
    });
    workspace.scanAll.addEventListener('click', async () => {
      workspace.scanAll.disabled = true;
      workspace.status.textContent = 'Checking whole vault...';
      notify('Checking whole vault...', 'warn');
      try {
        const response = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to scan vault');
        }
        const message = 'Checked whole vault. Reloading...';
        workspace.status.textContent = message;
        notify(message, 'good');
        window.setTimeout(() => window.location.reload(), 250);
      } catch (error) {
        workspace.status.textContent = 'Check failed: ' + error.message;
        notify('Check failed: ' + error.message, 'bad');
      } finally {
        workspace.scanAll.disabled = false;
      }
    });
    // ── Native OS folder picker (macOS: osascript, Linux: zenity) ────────────────
    const pickFolderNative = async (callback) => {
      try {
        const response = await fetch('/api/fs/pick-folder');
        const payload = await response.json().catch(() => ({}));
        if (payload.cancelled || !payload.path) return; // user cancelled — do nothing
        if (!response.ok) { notify('Folder picker error: ' + (payload.error || 'unknown'), 'bad'); return; }
        callback(payload.path);
      } catch {
        notify('Folder picker requires server mode (vault-keeper dashboard --serve)', 'warn');
      }
    };

    // Header "📂 Change vault" — pick any folder and reload with it as new vault root
    document.getElementById('header-change-vault').addEventListener('click', async () => {
      await pickFolderNative(async (path) => {
        try {
          const res = await fetch('/api/vault/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ root: path }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(payload.error || 'Failed');
          notify('Opened vault: ' + path + '. Reloading...', 'good');
          window.setTimeout(() => window.location.reload(), 300);
        } catch (error) {
          notify('Open vault failed: ' + error.message, 'bad');
        }
      });
    });

    // Workspace "📂" button — pick any folder and set as active folder
    document.getElementById('workspace-browse-btn').addEventListener('click', () => {
      pickFolderNative((path) => {
        workspace.root.value = path;
        document.getElementById('start-doc-root').textContent = docsRootValue();
        renderTemplate();
        renderDocument();
        notify('Active folder set to ' + path, 'good');
      });
    });

    const healthScan = {
      pickBtn: document.getElementById('health-pick-folder-btn'),
      allBtn: document.getElementById('health-scan-all-btn'),
      status: document.getElementById('health-scan-status'),
    };
    const folderPicker = {
      overlay: document.getElementById('folder-picker-overlay'),
      list: document.getElementById('folder-picker-list'),
      close: document.getElementById('folder-picker-close'),
      pathInput: document.getElementById('folder-picker-path-input'),
      browseBtn: document.getElementById('folder-picker-browse-btn'),
      scanTyped: document.getElementById('folder-picker-scan-typed'),
    };

    const openFolderPicker = () => { folderPicker.overlay.classList.add('open'); folderPicker.close.focus(); };
    const closeFolderPicker = () => { folderPicker.overlay.classList.remove('open'); };
    folderPicker.close.addEventListener('click', closeFolderPicker);
    folderPicker.overlay.addEventListener('click', (e) => { if (e.target === folderPicker.overlay) closeFolderPicker(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFolderPicker(); });

    // Health modal: native OS picker to browse any filesystem path
    folderPicker.browseBtn.addEventListener('click', () => {
      pickFolderNative((path) => {
        folderPicker.pathInput.value = path;
        runHealthScan(path);
      });
    });
    folderPicker.scanTyped.addEventListener('click', () => {
      const path = String(folderPicker.pathInput.value || '').trim();
      if (path) runHealthScan(path);
    });
    folderPicker.pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const path = String(folderPicker.pathInput.value || '').trim();
        if (path) runHealthScan(path);
      }
    });

    const runHealthScan = async (path) => {
      closeFolderPicker();
      const label = path || 'whole vault';
      healthScan.status.textContent = 'Scanning ' + label + '...';
      notify('Scanning ' + label + '...', 'warn');
      healthScan.pickBtn.disabled = true;
      healthScan.allBtn.disabled = true;
      try {
        const response = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(path ? { path } : {}),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to scan');
        }
        const scope = payload.scopePath || 'whole vault';
        healthScan.status.textContent = 'Scanned ' + scope + '. Reloading...';
        notify('Scanned ' + scope + '.', 'good');
        window.setTimeout(() => window.location.reload(), 250);
      } catch (error) {
        healthScan.status.textContent = 'Scan failed: ' + error.message;
        notify('Scan failed: ' + error.message, 'bad');
        healthScan.pickBtn.disabled = false;
        healthScan.allBtn.disabled = false;
      }
    };

    // Build folder list for the picker modal
    // Note: avoid regex literals in this template literal to prevent backslash escaping issues
    const knownFolders = Object.keys(summary.byFolder || {})
      .map((f) => f.endsWith('/') ? f.slice(0, -1) : f)
      .filter((f) => f && f !== '.');
    const configuredFolders = (data.workspace && data.workspace.vaultFolders) || [];
    const healthFolders = [...new Set([...configuredFolders, ...knownFolders])].sort();

    if (healthFolders.length === 0) {
      folderPicker.list.append(
        el('p', { class: 'empty', text: 'No folders found. Click "Scan whole vault" to discover them.' }),
      );
    } else {
      for (const folder of healthFolders) {
        const stats = summary.byFolder[folder + '/'] || summary.byFolder[folder] || null;
        const rate = stats && stats.total > 0 ? stats.valid / stats.total : null;
        const tone = rate === null ? '' : rate >= 0.95 ? 'good' : rate >= 0.8 ? 'warn' : 'bad';
        const pctText = rate !== null ? (rate * 100).toFixed(0) + '%' : '—';
        const countText = stats ? String(stats.total) + ' docs' : '';
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'folder-item';
        item.append(
          el('span', { text: '📁 ' }),
          el('span', { class: 'folder-name', text: folder }),
          el('span', { class: 'folder-meta', text: countText }),
          el('span', { class: tone ? 'pill ' + tone : 'pill', text: pctText }),
        );
        item.addEventListener('click', () => runHealthScan(folder));
        folderPicker.list.append(item);
      }
    }

    healthScan.pickBtn.addEventListener('click', openFolderPicker);
    healthScan.allBtn.addEventListener('click', () => runHealthScan(null));
    installAiKit.addEventListener('click', async () => {
      installAiKit.disabled = true;
      installAiKitStatus.textContent = 'Installing AI Workspace kit...';
      notify('Installing AI Workspace kit...', 'warn');
      try {
        const response = await fetch('/api/presets/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presetId: 'ai-workspace' }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to install AI Workspace kit');
        }
        const message = 'Installed AI Workspace kit: ' + payload.created.length + ' file(s) created, ' + payload.skipped.length + ' already existed. Restart dashboard to rescan.';
        installAiKitStatus.textContent = message;
        notify(message, 'good');
        window.setTimeout(() => window.location.reload(), 350);
      } catch (error) {
        installAiKitStatus.textContent = 'Install requires server mode: vault-keeper dashboard --serve. ' + error.message;
        notify('AI Workspace install failed: ' + error.message, 'bad');
      } finally {
        installAiKit.disabled = false;
      }
    });
    // ── Dark mode toggle ─────────────────────────────────────────────────────────
    const themeToggle = document.getElementById('theme-toggle');
    const applyTheme = (t) => {
      document.documentElement.classList.toggle('dark', t === 'dark');
      themeToggle.textContent = t === 'dark' ? '☀️' : '🌙';
    };
    applyTheme(localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    themeToggle.addEventListener('click', () => {
      const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      applyTheme(next);
    });

    // ── Motivational message ──────────────────────────────────────────────────────
    const motivationalMsg = document.getElementById('motivational-msg');
    const invalid = summary.invalid || 0;
    if (rate >= 1.0) {
      motivationalMsg.textContent = '🎉 Perfect vault!';
    } else if (rate >= 0.95) {
      motivationalMsg.textContent = '🚀 Almost perfect! Fix ' + String(invalid) + ' more.';
    } else if (rate >= 0.8) {
      motivationalMsg.textContent = '💪 Good shape! ' + String(invalid) + ' docs to fix.';
    } else {
      motivationalMsg.textContent = '🔧 ' + String(invalid) + ' docs need attention.';
    }

    // ── Confetti burst (100% score, once per session) ────────────────────────────
    if (rate >= 1.0 && !sessionStorage.getItem('confetti-fired')) {
      sessionStorage.setItem('confetti-fired', '1');
      const container = document.getElementById('confetti-container');
      const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];
      for (let i = 0; i < 40; i++) {
        const piece = document.createElement('div');
        const size = Math.floor(Math.random() * 8) + 6;
        piece.style.cssText = [
          'position:absolute',
          'width:' + String(size) + 'px',
          'height:' + String(size) + 'px',
          'background:' + colors[Math.floor(Math.random() * colors.length)],
          'border-radius:' + (Math.random() > 0.5 ? '50%' : '2px'),
          'left:' + String(Math.random() * 100) + '%',
          'top:0',
          'animation:confetti-fall ' + String((Math.random() * 2 + 1.5).toFixed(2)) + 's ease-in ' + String((Math.random() * 0.8).toFixed(2)) + 's forwards',
        ].join(';');
        container.appendChild(piece);
      }
    }

    // ── Keyboard shortcuts ────────────────────────────────────────────────────────
    const shortcutsOverlay = document.getElementById('shortcuts-overlay');
    const toggleShortcuts = () => shortcutsOverlay.classList.toggle('open');
    const closeShortcuts = () => shortcutsOverlay.classList.remove('open');
    shortcutsOverlay.addEventListener('click', (e) => { if (e.target === shortcutsOverlay) closeShortcuts(); });

    const switchTab = (tabId) => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      const btn = document.querySelector('.tab[data-tab="' + tabId + '"]');
      if (btn) { btn.classList.add('active'); document.getElementById(tabId).classList.add('active'); }
    };

    document.addEventListener('keydown', (e) => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '?') { e.preventDefault(); toggleShortcuts(); return; }
      if (e.key === 'Escape') { closeShortcuts(); closeFolderPicker(); return; }
      if (shortcutsOverlay.classList.contains('open')) return;
      if (e.key === 'h') switchTab('health-panel');
      else if (e.key === 's') switchTab('start-panel');
      else if (e.key === 'c') switchTab('templates-panel');
      else if (e.key === 'r') document.getElementById('health-scan-all-btn').click();
    });

    resetFields(templatePresets.decision.fields);
    renderTemplate();
    renderDocument();

    // ── Real-time updates via SSE ───────────────────────────────────────────────
    if (typeof EventSource !== 'undefined') {
      const evtSource = new EventSource('/api/events');
      const sseIndicator = document.getElementById('sse-indicator');
      evtSource.onopen = () => { if (sseIndicator) { sseIndicator.title = 'Live: connected'; sseIndicator.style.background = 'var(--good)'; } };
      evtSource.onerror = () => { if (sseIndicator) { sseIndicator.title = 'Live: disconnected'; sseIndicator.style.background = 'var(--muted)'; } };
      evtSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'scan-complete') {
            notify('Vault updated (' + (payload.file || 'file changed') + '). Reloading...', 'good');
            window.setTimeout(() => window.location.reload(), 800);
          }
        } catch {}
      };
    }
  </script>
</body>
</html>
`;
}

function formatPercent(summary = {}) {
  const validated = Math.max(0, (summary.total || 0) - (summary.skipped || 0));
  const rate = validated > 0 ? (summary.valid || 0) / validated : 1;
  return `${(rate * 100).toFixed(1)}%`;
}

function serializeForScript(data) {
  return JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
