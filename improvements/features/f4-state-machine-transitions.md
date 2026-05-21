# F4 — State machine transition validation

**Effort:** L | **Impact:** MEDIUM | **Category:** Feature

## Vấn đề

`lib/validators.js:351-362` chỉ check xem `frontmatter.status` có phải là **node hợp lệ** trong state machine không. Nó **không check transition** — tức là không biết doc đã đi từ `draft` → `published` mà bỏ qua `review`.

Comment trong code: `"informational only (no history)"` — acknowledge đây là limitation.

State machine data đã có transition graph, ví dụ:
```yaml
state_machine:
  draft: [review, abandoned]
  review: [approved, draft]
  approved: []
  abandoned: [draft]
```

Nhưng không có cơ chế lưu lịch sử transition → không thể validate.

## Giải pháp (2 approach)

### Approach A: Git history-based (complex, accurate)

Dùng `git log` để lấy lịch sử thay đổi của `status` field:

```js
async function getStatusHistory(docPath, projectRoot) {
  const result = await exec(
    `git log --follow --format="%H %ai" -- ${docPath}`,
    { cwd: projectRoot }
  );
  // Parse each commit, extract status from frontmatter at that commit
  // Build transition chain: [draft, review, approved]
  // Check each transition is allowed by state_machine
}
```

**Pros:** Accurate, uses existing git history  
**Cons:** Slow (git log per doc), requires git repo, complex

### Approach B: Transition log in frontmatter (simple, explicit)

Require docs to log transitions explicitly:

```yaml
# In document frontmatter
status: approved
status_history:
  - { from: draft, to: review, at: "2024-01-15" }
  - { from: review, to: approved, at: "2024-01-20" }
```

Validate `status_history` transitions against `state_machine`.

**Pros:** Simple, no git dependency, self-documenting  
**Cons:** Manual, can be wrong/missing

### Approach C: Last-transition field (pragmatic)

Only track the previous status, not full history:

```yaml
status: approved
previous_status: review  # optional, set by vault-keeper or manually
```

Validate: `state_machine[previous_status]` must include `status`.

**Pros:** Minimal overhead, easy to implement  
**Cons:** Only validates one step back

## Recommendation

Start với **Approach C** (pragmatic) — easiest to implement, delivers value without git dependency. **Approach A** có thể là v2.

## Files cần sửa (Approach C)

- `lib/validators.js` — trong state_machine check, nếu `previous_status` present, validate transition
- `tests/validate-documents.test.js` — test: valid transition, invalid transition
- `docs/templates/frontmatter-rules.md` — document `previous_status` convention

## Trade-offs

- **Pro:** Enforce workflow — không thể skip `review` step
- **Con:** `previous_status` phải được set thủ công hoặc bởi automation
- **Con:** Không backward compatible: vault cũ không có `previous_status` → no validation (opt-in)

## Definition of Done (Approach C)

- [ ] Nếu `previous_status` present, validate transition against `state_machine`
- [ ] Nếu `previous_status` absent, skip check (backward compat)
- [ ] Error message: `"Invalid transition: previous_status 'draft' cannot move to 'approved'"` 
- [ ] Tests: valid transition, invalid transition, missing previous_status (no error)

## Notes

Effort L vì cần design decision về approach trước khi code. Recommend discuss với team trước khi start.
