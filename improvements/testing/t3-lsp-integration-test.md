# T3 — LSP integration test end-to-end

**Effort:** L | **Impact:** MEDIUM | **Category:** Testing

## Vấn đề

Provider tests (`tests/providers/`) mock vault index và connection. `server/smoke.js` là end-to-end nhưng không phải automated test (cần manual inspect output).

Pipeline thực sự trong `server/main.js` chưa được test:
- `isVaultFile()` gating logic
- `uriToRepoPath()` conversion
- 250ms debounce mechanism
- `didOpen` → validate → diagnostics flow
- Multiple rapid `didChange` → debounce → single validation

## Giải pháp

### Approach A: Test với stdio harness (Recommended)

Spawn LSP process, communicate qua stdio JSON-RPC.

```js
// tests/lsp-integration.test.js

import { test, expect } from 'bun:test';
import { spawn } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

function createLspClient(serverPath) {
  const proc = spawn('node', [serverPath, '--stdio']);
  let msgId = 1;
  const pending = new Map();

  // JSON-RPC framing
  proc.stdout.on('data', (chunk) => {
    // Parse Content-Length header + JSON body
    const msg = parseJsonRpc(chunk);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg);
    }
  });

  return {
    request(method, params) {
      const id = msgId++;
      return new Promise(resolve => {
        pending.set(id, { resolve });
        const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
        const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
        proc.stdin.write(header + body);
      });
    },
    notify(method, params) {
      const body = JSON.stringify({ jsonrpc: '2.0', method, params });
      const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
      proc.stdin.write(header + body);
    },
    close() { proc.kill(); }
  };
}

test('LSP validates doc on didOpen', async () => {
  const tmpDir = await mkdtemp(join(os.tmpdir(), 'lsp-test-'));
  
  try {
    // Setup minimal vault
    await mkdir(join(tmpDir, 'templates'), { recursive: true });
    await writeFile(join(tmpDir, 'templates/note.md'), `---
template_id: note
validation_rules:
  required_fields: [title, status]
---`);
    await writeFile(join(tmpDir, 'notes/doc.md'), `---
template: templates/note.md
title: My Note
# missing: status
---`);

    const client = createLspClient('server/main.bundled.cjs');

    // Initialize
    await client.request('initialize', {
      rootUri: `file://${tmpDir}`,
      capabilities: {},
    });
    client.notify('initialized', {});

    // Collect diagnostics
    const diagnosticsPromise = new Promise(resolve => {
      client.onNotification('textDocument/publishDiagnostics', resolve);
    });

    // Open document
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri: `file://${tmpDir}/notes/doc.md`,
        languageId: 'markdown',
        version: 1,
        text: await readFile(join(tmpDir, 'notes/doc.md'), 'utf-8'),
      }
    });

    const { diagnostics } = await diagnosticsPromise;
    expect(diagnostics.some(d => d.message.includes('status'))).toBe(true);

  } finally {
    client.close();
    await rm(tmpDir, { recursive: true });
  }
}, { timeout: 10000 });
```

### Approach B: Upgrade smoke.js thành automated test

Refactor `server/smoke.js` để assert output instead of print, run via `bun test`.

**Approach B** là lower effort — smoke.js đã có logic, chỉ cần add assertions.

## Recommendation

Start với **Approach B** (refactor smoke.js) — ít effort hơn, coverage gần tương đương cho core flow. Approach A là v2.

## Files cần sửa/tạo

- `server/smoke.js` — thêm `assert`/`expect` calls, export `runSmoke()` function
- `tests/lsp-smoke.test.js` — wrap smoke.js thành Bun test
- `tests/lsp-integration.test.js` — optional: full stdio harness

## Trade-offs

- **Pro:** Catch debounce bugs, event-ordering bugs, `isVaultFile` regressions
- **Con:** Slow tests (spawn process, wait for debounce 250ms+)
- **Con:** Flaky nếu debounce timing không reliable trong CI
- **Con:** L effort cho full approach A

## Definition of Done (Approach B)

- [ ] `server/smoke.js` throw trên failure thay vì chỉ log
- [ ] `bun test tests/lsp-smoke.test.js` chạy trong CI
- [ ] Cover: `didOpen` → diagnostics, `didChange` → updated diagnostics, non-vault file → empty diagnostics
