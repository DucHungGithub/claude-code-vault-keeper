# F1 — Orphan document detection

**Effort:** M | **Impact:** HIGH | **Category:** Feature

## Vấn đề

Vault index đã build backlink graph (`_incoming` tại `server/vault-index.js:43-44`) nhưng không có tính năng nào dùng nó để tìm docs không có incoming link (orphans).

Docs không được link đến thường là:
- Notes cũ đã bị forget
- Drafts chưa được integrate vào vault
- Duplicate của note khác

Đây là tính năng cốt lõi của vault hygiene mà Obsidian graph view, Logseq unlinked references đều có.

## Giải pháp

### Phần 1: CLI flag `--orphans`

```bash
vault-keeper validate --orphans
# hoặc lệnh riêng
vault-keeper orphans
```

Output:
```
🔗 ORPHAN DOCS (no incoming links)
📄 notes/draft-idea.md
📄 library/books/old-book-2019.md

Total orphans: 2 of 487 docs
```

### Pseudocode (CLI)

```js
// cli/validate-documents.js

async function findOrphans(projectRoot, vaultConfig) {
  const allDocs = await findDocuments(projectRoot, vaultConfig);
  const index = new VaultIndex(projectRoot);
  await index.ensureLoaded();

  const orphans = [];
  for (const docPath of allDocs) {
    const relPath = relative(projectRoot, docPath);
    const backlinks = index.getBacklinks(docPath);
    // Bỏ qua: template files, index files, root README
    if (!isTemplateFile(relPath) && backlinks.length === 0) {
      orphans.push(relPath);
    }
  }
  return orphans;
}
```

### Phần 2: LSP — inlay hint hoặc diagnostic (optional)

Thêm vào `server/providers/inlay-hint.js`: khi vault index loaded, hiện ghost text `(no incoming links)` bên cạnh title frontmatter field của orphan docs.

### Opt-out mechanism

Docs có thể opt-out bằng frontmatter field:

```yaml
no_orphan_check: true  # intentionally standalone
```

Hoặc cấu hình toàn bộ folder trong `vault-keeper.json`:

```json
{ "orphanExcludeFolders": ["glossary/", "indexes/"] }
```

## Files cần sửa

- `cli/validate-documents.js` — thêm `findOrphans()`, wire vào `--orphans` flag hoặc subcommand
- `cli/main.js` — thêm flag/subcommand vào help text
- `server/providers/inlay-hint.js` — optional: ghost text cho orphan docs
- `lib/vault-config.js` — thêm `orphanExcludeFolders` vào config schema
- `tests/` — thêm fixtures và test cho orphan detection

## Trade-offs

- **Pro:** VaultIndex đã có `_incoming` graph — phần lớn work đã xong
- **Con:** False positives: entry points, glossary, template indexes là orphans hợp lệ — cần opt-out
- **Con:** Cross-vault links (note link đến file ngoài vault) không được detect → sẽ report false orphan

## Definition of Done

- [ ] `vault-keeper validate --orphans` (hoặc `vault-keeper orphans`) liệt kê đúng orphan docs
- [ ] Opt-out bằng `no_orphan_check: true` hoạt động
- [ ] Template files không bị report là orphan
- [ ] Tests: vault 10 docs, 3 orphans → report đúng 3
