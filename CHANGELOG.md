# Changelog

All notable changes to `claude-code-vault-keeper` are tracked here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project adheres to [Semantic Versioning](https://semver.org/).

## [0.5.0] — 2026-05-19

First version published to the npm registry. Aimed at making the tool
installable without cloning the repo, and at consolidating the example
vault as both authoring reference and test dataset.

### Added

- **Bundled example vault** at `examples/example/` doubles as the
  canonical test dataset (`tests/example-vault.test.js` +
  `tests/example-vault.expectations.json`). 25 fixtures (6 valid, 19
  invalid `-invalid.md`) cover 16 distinct validator diagnostic kinds.
  A coverage assertion in the test suite fails if a new diagnostic kind
  ships without a fixture.
- **`templates/decision-template.md`** — fourth template demonstrating
  advanced rule recipes the PRD template does not exercise: compound
  DSL with `and`, DSL `not in`, conditional `min_count`, conditional
  `severity: warning`.
- **`examples/example/README.md`** — fixture map: every fixture filename
  → diagnostic kind it demonstrates, plus add-a-fixture workflow.
- **`LICENSE`** — MIT (was `UNLICENSED`).
- **`CHANGELOG.md`** — this file.
- **`smoke:server` / `smoke:example`** npm scripts. Default `smoke` now
  runs both server LSP smoke and example LSP smoke sequentially.

### Changed

- **Distribution: npm-first.** Removed `"private": true`; added
  `repository`, `homepage`, `bugs`, `keywords`, `engines (>=18)`,
  `files` allowlist. Recommended install path is now `bunx` / `npx` /
  `bun add` / `npm i` — `git clone` is reserved for contributors.
- **CLI shebang** of `cli/validate-documents.js` changed from
  `#!/usr/bin/env bun` to `#!/usr/bin/env node`. `bunx` still works
  (bun is node-compatible) and `npx` now works without a bun runtime
  on `$PATH`. The CLI itself uses no bun-specific APIs.
- **`validate*` npm scripts** now invoke `node` directly instead of
  `bun`, so contributors without bun can still drive them from a
  cloned checkout. (`test` still uses `bun test` since it depends on
  bun's test runner.)
- **`server/smoke.js`** now targets `examples/example/` instead of the
  removed `tests/fixtures/vault-mini/`. Hover-line offset bumped from
  4 → 5 to track the new broken-PRD's added `title:` line.
- **`docs/getting-started.md`** rewritten around the new install paths
  (bunx / global / project dev-dep / Claude Code marketplace). Drops
  the previous "clone then run from plugin directory" instructions.
- **`README.md`** Quick start rewritten to mirror getting-started.

### Removed

- **`examples/minimal-vault/`** — superseded by `examples/example/`.
- **`tests/fixtures/vault-mini/`** — superseded by `examples/example/`.
  No backwards-compatibility shim (greenfield project).

### Internal

- LSP bundle (`server/main.bundled.cjs`) rebuilt from `server/main.js`
  via `esbuild` (no source changes; the bundle just gets re-emitted on
  every release via the `prepublishOnly` script).
- `prepublishOnly` runs `npm run build && bun test ./tests` so the
  bundle published to npm is always fresh and the test suite is green.

## [0.4.0] — pre-npm

Last version distributed solely as a Claude Code plugin source tree.
Collapsed the legacy `namingPatterns` config into per-template
`path_regex`.

## [0.1.0–0.3.0] — pre-npm

Initial LSP server, CLI validator, and template-rules engine. Not
distributed via npm.
