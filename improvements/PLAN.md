# Vault Keeper — Improvement Plan

## Feature A: Guided Tour + Demo Vault

### A1 — Guided Tour

**What it does**: On first open (no `tour-done` key in `localStorage`), an overlay walks the user through 5 UI steps with Next / Skip buttons and a step counter.

**Steps**:
1. Vault root selector (Start tab) — point to `#workspace-root`
2. Start tab overview — point to `[data-tab="start-panel"]`
3. Health tab — point to `[data-tab="health-panel"]`
4. Create tab — point to `[data-tab="templates-panel"]`
5. Keyboard shortcuts — point to `#shortcuts-overlay`

**New HTML elements** (in `ui/report-template.js`):
- `id="tour-overlay"` — full-viewport semi-transparent backdrop
- `id="tour-step-counter"` — e.g. "Step 1 / 5"
- `id="tour-next-btn"` — advances to next step; on last step saves `tour-done` and dismisses
- `id="tour-skip-btn"` — immediately saves `tour-done` and dismisses overlay

**New JS logic** (inline `<script>` in `report-template.js`):
```js
const TOUR_STEPS = [
  { target: '#workspace-root', title: 'Vault Root', text: '...' },
  // ...
];
function startTour() { /* show overlay, render step 0 */ }
function advanceTour() { /* increment step or finish */ }
function finishTour() { localStorage.setItem('tour-done', '1'); hideTourOverlay(); }
document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem('tour-done')) startTour();
});
```

**Files changed**:
- `ui/report-template.js` — add overlay HTML + tour JS

**Acceptance criteria**:
- `renderDashboardHtml()` output contains `id="tour-overlay"`, `id="tour-next-btn"`, `id="tour-skip-btn"`, `id="tour-step-counter"`
- Tour auto-starts only when `tour-done` is absent from `localStorage`
- Clicking Skip / finishing the last step persists `tour-done`

---

### A2 — Demo Vault

**What it does**: A "Load demo vault" button in the Start tab POSTs to `/api/demo/init`. The server creates a temporary directory with sample templates, some valid docs, and some intentionally invalid docs, then switches the vault root to it.

**New endpoint**:
```
POST /api/demo/init
Body: {} (empty)
Response 200: { root: string, filesCreated: number }
```

**Server logic** (in `ui/dashboard.js` `serveDashboard`):
```js
if (req.method === 'POST' && url.pathname === '/api/demo/init') {
  const demoRoot = mkdtempSync(join(tmpdir(), 'vk-demo-vault-'));
  // write sample templates + valid/invalid docs
  projectRoot = demoRoot;
  currentData = await scanVault(demoRoot);
  sendJson(res, 200, { root: demoRoot, filesCreated: N });
}
```

**New HTML elements** (in `ui/report-template.js` Start tab):
- A button with visible text "Load demo vault" that calls `POST /api/demo/init`

**Files changed**:
- `ui/dashboard.js` — new `/api/demo/init` route
- `ui/report-template.js` — "Load demo vault" button in Start tab

**Demo vault contents** (created at runtime, not committed):
- `templates/demo-template.md` — a simple template with required `title` and `status` fields
- `docs/valid-doc.md` — passes all template rules
- `docs/invalid-doc.md` — missing required `status` field
- `docs/invalid-type.md` — has wrong type for a numeric field

**Acceptance criteria**:
- `POST /api/demo/init` returns `{ root, filesCreated }` where `filesCreated > 0`
- Returned `root` is a different directory from the original vault root
- The demo directory is a real filesystem path containing at least one `.md` file

---

## Feature B: Health Badge + Share

### B1 — Health Badge

**What it does**: `GET /api/badge.svg` returns a shields.io-style SVG badge. Color thresholds: green (`#22c55e`) ≥ 95%, yellow (`#f59e0b`) ≥ 80%, red (`#ef4444`) < 80%.

**New endpoint**:
```
GET /api/badge.svg
Response 200, Content-Type: image/svg+xml
Body: shields.io-style SVG with label "vault" and value "XX.X%"
```

**SVG structure**:
```xml
<svg xmlns="http://www.w3.org/2000/svg" width="..." height="20">
  <!-- left label: "vault" -->
  <!-- right value: "XX.X%" in color -->
</svg>
```

**Color logic**:
```js
function badgeColor(pct) {
  if (pct >= 95) return '#22c55e'; // green
  if (pct >= 80) return '#f59e0b'; // yellow
  return '#ef4444';                // red
}
```

**New HTML element** (in header of `report-template.js`):
- `id="copy-badge-btn"` — copies the markdown embed `![Vault Health](http://localhost:PORT/api/badge.svg)` to clipboard

**Files changed**:
- `ui/dashboard.js` — new `/api/badge.svg` route
- `ui/report-template.js` — "Copy badge" button in header

**Acceptance criteria**:
- `GET /api/badge.svg` responds with status 200 and `content-type: image/svg+xml`
- SVG body starts with `<svg`
- SVG contains the health percentage formatted as `XX.X%`
- For 100% health, SVG contains a green color identifier (`22c55e` or `brightgreen` or similar)
- For 50% health (1 valid / 2 total), SVG contains `50.0%` and a red color
- `renderDashboardHtml()` output contains `id="copy-badge-btn"`

---

### B2 — Share / Read-Only Report

**What it does**: `GET /share` returns a complete HTML snapshot of vault health that omits all mutation controls (no "Save to vault", no "Init workspace", no template editor save buttons).

**New endpoint**:
```
GET /share
Response 200, Content-Type: text/html
Body: read-only HTML report (same health data, no mutation UI)
```

**Implementation approach**:
- Add a `renderShareHtml(data)` function (or pass a `{ readOnly: true }` flag to `generateReport`)
- In the share view, strip or hide: `id="workspace-init"`, `id="tpl-save"`, the Create tab, and all POST-triggering buttons

**Also**: A "Copy markdown summary" button that client-side generates a markdown table from `window.__vaultData` and copies it to clipboard.

**Files changed**:
- `ui/dashboard.js` — new `/share` route
- `ui/report-template.js` — `renderShareHtml()` or `generateReport(data, { readOnly: true })`

**Acceptance criteria**:
- `GET /share` returns status 200 and `Content-Type: text/html`
- Response body starts with `<!doctype html>`
- Response body does NOT contain `id="workspace-init"` or `id="tpl-save"`
- Response body contains "Vault Health" heading

---

## Feature C: Error Explainer

### C1 — `lib/error-explainer.js` module

**What it does**: Given a validation error object, returns a `{ title, description, fix }` plain-text explanation.

**API**:
```js
/**
 * @param {{ field: string, message: string, error_type?: string, allowed?: string[], pattern?: string }} err
 * @returns {{ title: string, description: string, fix: string }}
 */
export function explainError(err) { ... }
```

**Mapping table**:

| `error_type` | `title` | `description` | `fix` |
|---|---|---|---|
| `required` | "Missing required field" | "The field `{field}` must be present in the document frontmatter." | "Add `{field}:` to the frontmatter of this document." |
| `enum` | "Invalid value" | "The value for `{field}` is not one of the allowed options." | "Set `{field}` to one of: {allowed.join(', ')}." |
| `pattern` | "Path or value format mismatch" | "The value for `{field}` does not match the required pattern." | "Ensure the value matches the pattern: `{pattern}`." |
| `type` | "Wrong field type" | "The value for `{field}` has the wrong data type." | "Check the expected type in the template definition for `{field}`." |
| _(fallback)_ | "Validation error" | "{message}" | "Review the template definition for `{field}` and correct the value." |

**Rules**:
- All returned strings are plain text (no HTML tags)
- `fix` must always be a non-empty string

**Files changed**:
- `lib/error-explainer.js` — new file (stub → implementation)

### C2 — Dashboard integration

**What it does**: In the Health tab, each error row gets a small "?" button. Clicking it expands an inline explanation panel below the row showing `title`, `description`, and `fix` from `explainError()`.

**New HTML elements**:
- Error rows rendered with a button bearing class `error-explain-btn`
- A hidden `<div class="error-explain-panel">` per row that toggles on click

**Client-side JS** (inline in `report-template.js`):
```js
function explainError(err) { /* mirror of lib/error-explainer.js logic */ }
document.querySelectorAll('.error-explain-btn').forEach(btn => {
  btn.addEventListener('click', () => { /* toggle panel */ });
});
```

**Files changed**:
- `ui/report-template.js` — add `error-explain-btn` to error rows, add panel toggle JS

**Acceptance criteria**:
- `renderDashboardHtml()` output contains at least one element with class `error-explain-btn` when there are errors in the data
- `explainError({ field, message, error_type, allowed, pattern })` returns `{ title, description, fix }` — all truthy plain strings
- For `error_type: 'enum'` with `allowed: ['draft', 'review', 'approved']`, `fix` contains `draft`
- All strings returned are free of HTML tags

---

## Summary of all file changes

| File | Change |
|---|---|
| `lib/error-explainer.js` | **New** — plain-language error explanations |
| `ui/report-template.js` | Add tour overlay HTML+JS, "Load demo vault" button, "Copy badge" button in header, `error-explain-btn` on error rows, `renderShareHtml()` or read-only mode flag |
| `ui/dashboard.js` | Add `/api/demo/init`, `/api/badge.svg`, `/share` routes |
| `tests/error-explainer.test.js` | **New** — unit tests for `explainError()` |
| `tests/ui-dashboard.test.js` | Append integration tests for tour, demo init, badge, share, error explainer HTML |
