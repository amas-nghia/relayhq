# Phase 1 Release Checklist

Danh sách đầy đủ những việc cần làm, còn thiếu, và cần cải thiện để RelayHQ Phase 1 sẵn sàng release.

Trạng thái: `vault-first-rebuild` branch — đánh giá ngày 2026-04-15.

---

## Tổng quan nhanh

| Nhóm | Tổng | Xong | Còn lại |
|------|------|------|---------|
| 🔴 Blockers | 5 | 0 | 5 |
| 🟡 UX trước demo | 5 | 0 | 5 |
| 🟢 Phase 1 scope | 6 | 0 | 6 |
| 🔵 Hardening | 5 | 0 | 5 |
| ✅ Đã làm tốt | — | — | — |

---

## 🔴 Blockers — App không chạy được đúng

Những mục này phải xong trước khi bất kỳ thứ gì khác có thể được verify.

### B-1 · Tạo vault seed data

**Vấn đề**: `vault/` directory không tồn tại. API endpoint `GET /api/vault/read-model` đọc từ `../vault` (relative to `app/`) — trả về rỗng hoàn toàn. Toàn bộ UI hiển thị "unavailable".

**Cần làm**:
```
vault/
└─ shared/
   ├─ workspaces/
   │  └─ ws-demo.md
   ├─ projects/
   │  └─ project-demo.md
   ├─ boards/
   │  └─ board-demo.md
   ├─ columns/
   │  ├─ col-todo.md
   │  ├─ col-in-progress.md
   │  ├─ col-review.md
   │  └─ col-done.md
   ├─ tasks/
   │  ├─ task-001.md   ← status: todo
   │  ├─ task-002.md   ← status: in-progress
   │  └─ task-003.md   ← status: waiting-approval (để test approval flow)
   ├─ approvals/
   │  └─ approval-001.md   ← linked to task-003
   └─ agents/
      └─ agent-backend-dev.md
```

Dùng schema từ `docs/vault/schema.md` + `app/shared/vault/schema.ts` để tạo đúng format.

---

### B-2 · Write API endpoints còn thiếu

**Vấn đề**: Chỉ có `GET /api/vault/read-model`. Không có endpoint nào để update task, approve, heartbeat, hay tạo task mới. `app/server/services/vault/write.ts` đã có `syncTaskDocument()` hoàn chỉnh nhưng chưa được expose qua HTTP.

**Cần tạo**:

| Method | Route | Dùng cho |
|--------|-------|----------|
| `PATCH` | `/api/vault/tasks/[id]` | Update task (status, column, progress) |
| `POST` | `/api/vault/tasks/[id]/claim` | Agent claim task |
| `POST` | `/api/vault/tasks/[id]/heartbeat` | Agent heartbeat |
| `POST` | `/api/vault/tasks/[id]/request-approval` | Agent request approval |
| `POST` | `/api/vault/tasks/[id]/approve` | Human approve |
| `POST` | `/api/vault/tasks/[id]/reject` | Human reject |

Logic đã có đầy đủ trong:
- `app/server/services/vault/write.ts` — `syncTaskDocument()`
- `app/server/services/vault/validation.ts` — `validateTaskWrite()`
- `app/server/services/agents/commands.ts` — intent types đã định nghĩa

---

### B-3 · ApprovalPanel không có action buttons

**Vấn đề**: `app/components/approvals/ApprovalPanel.vue` hiển thị `actionItems` dưới dạng text thuần trong `<li>` tags. Không có `<button>` thực nào. Người dùng không thể thực hiện approve hay reject từ UI.

**File**: `app/components/approvals/ApprovalPanel.vue`

**Cần làm**: Thay `action-card` list bằng button group gọi write API (B-2):
- `[Approve]` → `POST /api/vault/tasks/[id]/approve`
- `[Reject]` → mở inline form nhập reason → `POST /api/vault/tasks/[id]/reject`
- `[Request Changes]` → `PATCH` status về `todo`

Chỉ hiển thị buttons khi `task.approvalState.status === "pending"`.

---

### B-4 · Task cards không clickable

**Vấn đề**: `app/components/boards/BoardColumnList.vue` render task cards nhưng mỗi `<li class="task-card">` không có `<NuxtLink>` hay click handler. Click vào task không navigate đến `/tasks/[id]`.

**File**: `app/components/boards/BoardColumnList.vue` — line 46, `<li v-for="task in column.tasks">`

**Cần làm**: Wrap nội dung `task-card` bằng `<NuxtLink :to="\`/tasks/${task.id}\`">`.

---

### B-5 · `.gitignore` thiếu rule cho vault/users

**Vấn đề**: `vault/users/**` chứa provider keys và private preferences — phải gitignored. `.gitignore` hiện tại không có rule này. Nếu ai commit `vault/users/`, có thể leak `api_key_ref` và user preferences vào shared history.

**File**: `.gitignore`

**Cần thêm**:
```
vault/users/
.env.local
app/.env.local
```

---

## 🟡 High — Cần trước khi demo

### H-1 · Empty state component

**Vấn đề**: Khi vault trống hoặc object không tìm thấy, UI hiển thị fallback strings kiểu "Workspace unavailable", "Task unavailable" rải rác. Không có guidance cho người dùng.

**Cần tạo**: `app/components/EmptyState.vue` với props:
- `title` — "No vault data found"
- `description` — hướng dẫn ngắn
- `action` (optional) — link hoặc button

Dùng ở: `WorkspaceNav`, `pages/index.vue` workspace section, `pages/boards/[board].vue`, `pages/tasks/[task].vue`.

---

### H-2 · Stale task badge trên board

**Vấn đề**: `app/server/services/vault/lock.ts` đã có `DEFAULT_STALE_AFTER_MS` và `getTaskLockState()` — logic phát hiện stale task đã có server-side. Nhưng read model không truyền `isStale` flag về UI. Board không có visual warning nào khi task bị stale.

**Cần làm**:
1. Thêm `isStale: boolean` vào `BoardTaskRecord` trong `app/data/relayhq-overview.ts`
2. Tính `isStale` trong `buildBoardTask()` dựa trên `heartbeat_at` + `DEFAULT_STALE_AFTER_MS`
3. Hiển thị badge đỏ trên task card khi `isStale === true`

---

### H-3 · Approval pending badge trên sidebar nav

**Vấn đề**: Sidebar có mục "Approvals" nhưng không có badge count. PM phải tự vào check — không biết có approval đang chờ không.

**File**: `app/components/navigation/WorkspaceNav.vue`

**Cần làm**: Đọc `model.approvals.filter(a => a.outcome === "pending").length` và hiển thị badge số lượng kế bên "Approvals" link.

---

### H-4 · Navigation anchor links cần refactor

**Vấn đề**: Sidebar nav dùng anchor links (`/#board`, `/#tasks`, `/#approvals`) dẫn về homepage section. Board thực sự ở `/boards/[id]`, không có `/approvals` page riêng. Người dùng không thể navigate trực tiếp đến board hay approvals.

**File**: `app/components/navigation/WorkspaceNav.vue`

**Cần làm**:
- Thay `/#board` → `/boards/[first-board-id]`
- Thay `/#tasks` → link đến task hiện tại hoặc board page
- Thêm `/approvals` page mới liệt kê tất cả pending approvals

---

### H-5 · Trang `/approvals` chuyên biệt

**Vấn đề**: Không có trang nào liệt kê tất cả pending approvals. PM phải duyệt qua từng task để tìm approval.

**Cần tạo**: `app/pages/approvals.vue`
- Hiển thị danh sách tất cả tasks có `approval_needed: true` và `approval_outcome: pending`
- Mỗi row: task title, assignee, reason, requested_at
- Click vào → `/tasks/[id]`
- Badge count cập nhật real-time (hoặc refresh on load)

---

## 🟢 Medium — Cần để đủ Phase 1 scope

### M-1 · Task creation từ UI

**Vấn đề**: Không có form tạo task. PM phải tự tạo file markdown trong vault bằng tay. Không thực tế cho người dùng thông thường.

**Cần tạo**: `POST /api/vault/tasks` endpoint + form UI minimal:
- Bắt buộc: `title`, `project_id`, `board_id`, `column`, `priority`, `assignee`
- Tùy chọn: `tags`, `depends_on`
- Khi submit: tạo file `vault/shared/tasks/task-{uuid}.md` với đúng frontmatter

---

### M-2 · Column move / task status update từ UI

**Vấn đề**: Không có cách move task giữa columns từ UI. `syncTaskDocument()` đã có và atomic write đã implement trong `write.ts` nhưng chưa có UI trigger.

**Cần làm**: Thêm vào task detail page:
- Dropdown hoặc buttons để chọn column mới → `PATCH /api/vault/tasks/[id]` với `{ column: "in-progress" }`
- Update tương ứng status khi column thay đổi (todo → in-progress)

---

### M-3 · Audit note display

**Vấn đề**: `AuditNoteFrontmatter` đã có schema và validator trong `app/shared/vault/schema.ts` nhưng:
1. `VaultReadModel` không có `auditNotes` collection
2. Không có component hiển thị audit history
3. `TaskDetailDrawer` không có section audit

**Cần làm**:
1. Thêm `auditNotes` collection vào read model + `readSharedVaultCollections()`
2. Hiển thị audit notes trong `TaskDetailDrawer` hoặc tab riêng trên task detail page

---

### M-4 · Agent registry page

**Vấn đề**: `AgentFrontmatter` đã có đầy đủ schema. `vault/shared/agents/` được đọc trong `readSharedVaultCollections()` nhưng không có trang nào cho người dùng xem agents.

**Cần tạo**: `app/pages/agents.vue`
- Danh sách agents: name, role, capabilities, status (available/busy)
- Link từ sidebar nav
- Khi assign task, có thể chọn từ danh sách này

---

### M-5 · CLI minimal cho agents

**Vấn đề**: `docs/agents/protocol.md` và `README.md` đều tham chiếu `relayhq-cli` nhưng không có implementation. Agents không thể tương tác với vault qua CLI. Command intents đã được định nghĩa đầy đủ trong `app/server/services/agents/commands.ts` nhưng chưa có HTTP routes tương ứng.

**Phụ thuộc**: B-2 (write API endpoints) phải xong trước.

**Scope tối thiểu**:
```bash
relayhq tasks --assignee=agent-backend-dev
relayhq claim task-001 --assignee=agent-backend-dev
relayhq heartbeat task-001 --assignee=agent-backend-dev
relayhq update task-001 --status=done --result="PR #42"
relayhq request-approval task-001 --reason="Need prod access"
```

Có thể implement dưới dạng Node.js script đọc `RELAYHQ_VAULT_ROOT` + gọi API.

---

### M-6 · `vault/shared/` directory phải có cấu trúc đúng

**Vấn đề**: Ngay cả khi tạo vault data (B-1), cần đảm bảo `vault/shared/` có đủ subdirectories. `readSharedVaultCollections()` đọc từ các paths cố định — nếu thiếu thư mục sẽ trả về rỗng thay vì error.

**Cần tạo**:
```
vault/shared/workspaces/
vault/shared/projects/
vault/shared/boards/
vault/shared/columns/
vault/shared/tasks/
vault/shared/approvals/
vault/shared/agents/
vault/shared/audit/
```

Có thể dùng `.gitkeep` files để giữ empty directories trong git.

---

## 🔵 Hardening — Cần trước khi ship

### HN-1 · Release verification checklist (từ build plan)

`docs/relayhq-build-plan.md` có checklist cụ thể — cần verify từng mục:

- [ ] Vault read model reconstructs workspace/project/board/task/approval state
- [ ] Task-manager flow stays inside caller/assignee boundary
- [ ] Single-user agent registry is canonical and visible in docs
- [ ] Kioku boundary là real service, không phải mock
- [ ] Secret-bearing và malformed writes bị rejected
- [ ] End-to-end ship path được cover bởi regression tests

---

### HN-2 · Kioku boundary verification

**Vấn đề**: `app/server/services/kioku/client.ts` và `indexer.ts` tồn tại. `docs/relayhq-build-plan.md` yêu cầu "real service boundary, not mock placeholder". Cần xác nhận:
- Nếu Kioku unavailable → `KiokuUnavailableError` được throw (theo `docs/architecture.md`)
- Không có fallback tự bịa kết quả
- Integration test cover cả happy path và unavailable path

---

### HN-3 · E2E tests cần vault data thực

**Vấn đề**: `app/test/relayhq.e2e.test.ts` tồn tại nhưng vault trống → test không verify được gì có ý nghĩa. Sau khi B-1 xong, cần cập nhật E2E test để cover:
- Load workspace dashboard → thấy data thực
- Navigate đến board → task cards hiển thị
- Click task card → navigate đến task detail
- Approval flow: pending → approve → done

---

### HN-4 · Race condition trên concurrent writes

**Vấn đề**: `write.ts` dùng file-based lock (`acquireTaskFileLock`). Lock logic đã có. Cần verify:
- Concurrent writes từ 2 agents vào cùng task file
- Lock expiry + stale detection hoạt động đúng
- `writeTaskDocumentAtomic()` rename pattern là atomic trên Linux

Test file: `app/server/services/vault/lock.test.ts` — xem đã cover concurrent case chưa.

---

### HN-5 · CLAUDE.md cần cập nhật

**Vấn đề**: CLAUDE.md hiện mô tả `backend/internal/vault/` như là nơi có canonical types nhưng thực tế:
- Logic chính nằm ở `app/server/` (TypeScript)
- `backend/` chỉ có Go schema types, không có HTTP server
- Server structure (`app/server/api/`, `app/server/services/`) không được đề cập

**Cần update**:
- Repository layout section
- Architecture section: mô tả đúng `app/server/` structure
- Commands: thêm cách chạy tests từng service
- Ghi chú về vault root (`RELAYHQ_VAULT_ROOT` env var)

---

## ✅ Đã làm tốt — Không cần thay đổi

| Thành phần | Trạng thái |
|-----------|-----------|
| TypeScript vault schema + validators | Hoàn chỉnh, đầy đủ |
| Vault read service (frontmatter parsing) | Robust, có error handling |
| Vault write service (atomic, immutable keys) | Tốt, có lock + stale detection |
| Write validation + secret detection | Tốt, ngăn raw secrets |
| Agent protocol service (task selection, priority sort) | Hoàn chỉnh |
| Agent command intents (claim, update, heartbeat, approval) | Types + factory functions đầy đủ |
| Access control service | Có |
| Go backend schema types + validators | Đồng bộ với TS |
| Nuxt 3 app shell + layout | Tốt |
| Board page layout (4 columns responsive) | Tốt |
| Task detail page structure | Tốt |
| TaskStatusTimeline (timeline từ vault data) | Hoạt động khi có data |
| ApprovalPanel display (trail, history) | Display tốt, chỉ thiếu buttons |
| Design system (colors, typography, spacing) | Nhất quán |
| PM2 config | Có |

---

## Thứ tự thực hiện đề xuất

```
Sprint 1 — App có thể chạy được
  B-5  Fix .gitignore
  B-1  Tạo vault seed data + directory structure (M-6)
  B-4  Task cards clickable
  H-1  Empty state component

Sprint 2 — Write flow hoạt động
  B-2  Write API endpoints (PATCH tasks, POST approve/reject/heartbeat)
  B-3  ApprovalPanel buttons
  H-3  Approval badge trên sidebar
  H-4  Nav refactor + H-5 /approvals page

Sprint 3 — Full Phase 1 scope
  M-1  Task creation UI
  M-2  Column move UI
  M-3  Audit note display
  M-4  Agent registry page
  H-2  Stale task badge

Sprint 4 — Hardening & CLI
  M-5  CLI minimal
  HN-1 Release verification checklist
  HN-2 Kioku boundary test
  HN-3 E2E tests với vault data
  HN-4 Concurrent write tests
  HN-5 CLAUDE.md update
```

---

## Dependencies quan trọng

```
B-1 (vault data) ──┬──► H-1 (empty state)
                   ├──► HN-3 (E2E tests)
                   └──► toàn bộ UI testing

B-2 (write APIs) ──┬──► B-3 (approval buttons)
                   ├──► M-1 (task creation)
                   ├──► M-2 (column move)
                   └──► M-5 (CLI)

B-4 (clickable cards) ──► HN-3 (E2E board flow)
```

---

*Tài liệu này phản ánh trạng thái branch `vault-first-rebuild` ngày 2026-04-15.*
*Cập nhật checklist này sau mỗi sprint khi items được hoàn thành.*
