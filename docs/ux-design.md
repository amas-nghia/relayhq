# RelayHQ — UX & UI Design Document

Tài liệu này mô tả information architecture, user flows, design system, và UX recommendations cho RelayHQ web interface — vault-first Kanban control plane cho phối hợp human-agent.

---

## 1. Người dùng (User Personas)

### Persona A — Human Project Manager (PM)
- Tạo và quản lý projects, boards, tasks
- Giao task cho agents hoặc team members
- Review tiến độ, phê duyệt quyết định quan trọng
- Cần visibility: "Đang làm gì, ở đâu trong flow, có gì bị block?"

### Persona B — Human Team Member / Reviewer
- Theo dõi board để nắm tiến độ
- Phê duyệt hoặc từ chối khi agent yêu cầu
- Xem audit trail để hiểu lịch sử quyết định

### Persona C — Agent (Machine Actor)
- Nhận task được giao qua CLI / vault protocol
- Update heartbeat, progress, execution notes
- Request approval khi gặp hành động rủi ro
- Ghi audit note khi hoàn thành
- **Không tương tác trực tiếp qua UI** — dùng CLI hoặc API

---

## 2. Information Architecture

```
RelayHQ (Web UI)
│
├── / — Workspace Dashboard
│   ├── Workspace overview (name, status, metrics)
│   ├── Live views nav (projects, boards, tasks)
│   ├── Projects section
│   ├── Board flow visualization
│   ├── Tasks summary
│   ├── Approvals status
│   └── Audit references
│
├── /projects/[project] — Project Detail
│   ├── Project metadata (workspace, boards, tasks, approvals)
│   ├── Board summary card
│   └── Workflow steps
│
├── /boards/[board] — Kanban Board
│   ├── Board header (name, metrics)
│   ├── Project summary card
│   ├── Column grid (4 columns: todo → in-progress → review → done)
│   │   └── Task cards (title, status, assignee, priority, progress, approval)
│   └── Board notes (workflow boundary, vault mapping)
│
└── /tasks/[task] — Task Detail
    ├── Page intro (title, status pill, metrics)
    ├── Task detail drawer (vault record, coordination state)
    ├── Approval panel (decision trail, actions, history)
    ├── Task status timeline
    └── Boundary reminder
```

### Navigation (sidebar)
```
WorkspaceNav
├── [Current workspace name + status]
├── Views (live links)
│   ├── Project overview
│   ├── Board overview
│   └── Task workflow
├── Workspace
│   ├── Overview → /#workspace
│   └── Projects → /#projects
├── Coordination
│   ├── Board → /#board
│   └── Tasks → /#tasks
└── Governance
    ├── Approvals → /#approvals
    └── Audit → /#audit
```

---

## 3. User Flows

### Flow 1 — PM xem trạng thái tổng quan hàng ngày

```
[Mở RelayHQ]
      │
      ▼
[Workspace Dashboard /]
  - Thấy metrics: Projects / Boards / Tasks / Approvals
  - Thấy "X pending approvals" → CTA nổi bật
      │
      ├── Không có approval pending
      │     ▼
      │   [Nhìn vào Board section ở sidebar]
      │     ▼
      │   [Click "Board overview" → /boards/[board]]
      │     ▼
      │   [Scan columns: todo | in-progress | review | done]
      │     ▼
      │   [Click task card bất kỳ → /tasks/[task]]
      │     ▼
      │   [Review task detail, timeline, audit]
      │     ▼
      │   [Xong — không cần action]
      │
      └── Có approval pending
            ▼
          [Click "Approvals" → /#approvals hoặc task link]
            ▼
          [Mở task /tasks/[task]]
            ▼
          → Flow 3: Approval Flow
```

---

### Flow 2 — PM tạo và giao task (future scope)

```
[Mở Project /projects/[project]]
      │
      ▼
[Click "+ New Task"]   ← (chưa có, cần thêm)
      │
      ▼
[Task creation form]
  - Title
  - Description
  - Priority: critical | high | medium | low
  - Column: todo
  - Assignee (human hoặc agent từ registry)
  - Approval required? (yes/no)
      │
      ▼
[Submit → Vault write]
  - Tạo vault/shared/tasks/task-{id}.md
  - Frontmatter được điền tự động
      │
      ▼
[Redirect → /tasks/[task-id]]
      │
      ▼
[Task hiển thị ở column "todo" trên board]
```

---

### Flow 3 — Human phê duyệt agent request

```
[Agent set approval_needed: true]
[Agent set status: waiting-approval]
      │
      ▼ (notification hoặc user tự check)
[PM thấy badge "1 pending" trên sidebar]
      │
      ▼
[Click → /tasks/[task]]
      │
      ▼
[Task Detail Page]
  - Status pill: "waiting-approval" (amber)
  - Approval panel hiển thị:
    - Requested by: agent-xxx
    - Reason: "Cần prod access để deploy"
      │
      ├── [Approve]
      │     ▼
      │   Vault write:
      │   - approval_outcome: approved
      │   - approved_by: "@alice"
      │   - approved_at: now
      │   - status: in-progress
      │     ▼
      │   Agent tiếp tục work
      │     ▼
      │   Audit note được ghi
      │
      ├── [Reject]
      │     ▼
      │   Vault write:
      │   - approval_outcome: rejected
      │   - status: blocked
      │   - blocked_reason: "..."
      │     ▼
      │   Agent dừng, báo cáo
      │
      └── [Request Changes]
            ▼
          Vault write:
          - status: todo (return to queue)
          - execution_notes: "..."
            ▼
          Task quay về để revise
```

---

### Flow 4 — Agent nhận và thực thi task (CLI/API)

```
[Agent startup]
      │
      ▼
[relayhq-cli tasks --assignee=agent-backend-dev]
  → Trả về danh sách tasks status: todo
      │
      ▼
[Agent chọn task phù hợp capabilities]
      │
      ▼
[relayhq-cli update task-001 --status=in-progress]
  Vault write:
  - status: in-progress
  - execution_started_at: now
  - heartbeat_at: now
      │
      ▼
[Agent làm việc ...]
      │
      ├── Mỗi 5 phút:
      │   [relayhq-cli heartbeat task-001]
      │   Vault write: heartbeat_at: now
      │
      ├── Khi cần approval:
      │   [relayhq-cli request-approval task-001 --reason="..."]
      │   Vault write: approval_needed: true, status: waiting-approval
      │   → Agent dừng, chờ
      │   → (Flow 3 diễn ra phía human)
      │   → Agent poll cho đến khi approval_outcome != pending
      │
      └── Khi xong:
          [relayhq-cli update task-001 --status=done --result="PR #42"]
          Vault write: status: done, result, completed_at
          Ghi audit note
```

---

### Flow 5 — PM theo dõi board, phát hiện task bị stale

```
[Mở /boards/[board]]
      │
      ▼
[Thấy task trong "in-progress" column]
  - heartbeat_at quá cũ (> 10 phút)
  - Progress không thay đổi
      │
      ▼
[Badge "Stale" nổi bật trên task card]  ← (cần implement)
      │
      ▼
[Click task → /tasks/[task]]
      │
      ▼
[Task detail cho thấy:]
  - Last heartbeat: 2 tiếng trước
  - Status: in-progress nhưng stale
      │
      ├── [Reassign] → Giao lại cho agent khác
      │
      ├── [Mark Blocked] → status: blocked + blocked_reason
      │
      └── [Ping Agent] → Trigger notification (future scope)
```

---

## 4. Design System (Phân tích hiện tại)

### 4.1 Màu sắc

| Token | Giá trị | Dùng cho |
|-------|---------|----------|
| Primary | `#7c3aed` (violet-600) | Accent, interactive |
| Primary deep | `#4c1d95` (violet-900) | Text on light pill |
| Text primary | `#0f172a` (slate-950) | Headings, labels |
| Text secondary | `#475569` (slate-600) | Body text |
| Text tertiary | `#64748b` (slate-500) | Eyebrow, captions |
| Surface | `rgba(255,255,255,0.88–0.95)` | Card backgrounds |
| Border | `rgba(226,232,240,0.95)` (slate-200) | Card borders |
| Pending (amber) | `rgba(245,158,11,0.12)` | Approval pending |
| Approved (green) | `rgba(16,185,129,0.12)` | Approved, done |
| Blocked (red) | `rgba(239,68,68,0.12)` | Blocked, rejected |
| Background | `#f7f8fc → #eef1f8` gradient | Page background |

**Status pill color system:**
```
todo          → slate (neutral)
in-progress   → blue (#1d4ed8)
waiting-approval → amber (#92400e)
done / approved  → green (#065f46)
blocked / rejected → red (#991b1b)
cancelled        → slate (muted)
```

### 4.2 Typography

| Element | Size | Weight | Letter-spacing |
|---------|------|--------|----------------|
| Eyebrow / kicker | 0.75rem | 700 | 0.12–0.14em |
| Hero heading | clamp(2rem → 3.5rem) | bold | -0.04em |
| Section heading | clamp(1.25rem → 1.75rem) | bold | -0.04em |
| Body | 1rem | 400 | 0 |
| Small / caption | 0.875rem | 400 | 0 |
| Chip / badge | 0.75–0.875rem | 700 | 0 |

Font: **Inter**, ui-sans-serif fallback stack.

### 4.3 Layout & Spacing

```
App shell: max-width 96rem, padding 1–1.5rem
Sidebar: sticky, 18–22rem width @ 1024px+
Card border-radius: 1rem (inner), 1.25rem (outer)
Card gap: 0.75–1rem
Section gap: 1–1.25rem
Card shadow: 0 20px 48px rgba(15,23,42,0.08)
```

### 4.4 Animation

```
Hover transition: 160ms ease
Transform: translateY(-1px) on hover
Border color shift: to rgba(124,58,237,0.24)
Box shadow lift: 0 12px 30px rgba(15,23,42,0.08)
```

---

## 5. Component Inventory

### Hiện có

| Component | File | Chức năng |
|-----------|------|-----------|
| `WorkspaceNav` | `navigation/WorkspaceNav.vue` | Sticky sidebar nav theo sections |
| `BoardColumnList` | `boards/BoardColumnList.vue` | 4-column Kanban grid với task cards |
| `ProjectSummaryCard` | `projects/ProjectSummaryCard.vue` | Project metadata + metrics |
| `TaskDetailDrawer` | `tasks/TaskDetailDrawer.vue` | Task vault record + coordination state |
| `ApprovalPanel` | `approvals/ApprovalPanel.vue` | Approval trail + actions |
| `TaskStatusTimeline` | `tasks/TaskStatusTimeline.vue` | Status history timeline |

### Chưa có (gaps)

| Component cần thêm | Ưu tiên | Lý do |
|--------------------|---------|-------|
| `TaskCard` (standalone) | High | Reusable, clickable, có hover state |
| `StaleIndicator` | High | Hiển thị task stale (heartbeat cũ) |
| `ApprovalBadge` | High | Notification count, visible ở nav |
| `EmptyState` | High | Trạng thái vault trống, guidance |
| `TaskCreateForm` | Medium | Tạo task mới (Phase 1 scope) |
| `ColumnMoveButton` | Medium | Di chuyển task giữa columns |
| `AuditNoteList` | Medium | Hiển thị audit trail trong task detail |
| `AgentStatusChip` | Low | Trạng thái agent (available/busy) |
| `FilterBar` | Low | Filter tasks by status/assignee/priority |

---

## 6. UX Recommendations

### 6.1 Navigation — vấn đề hiện tại

**Vấn đề**: Sidebar nav dẫn đến anchor links (`/#board`) trên homepage thay vì trang riêng. Board thực sự ở `/boards/[id]`.

**Đề xuất**:
```
Workspace
  ├── Overview (/)
  └── All Projects (/projects)

Boards
  └── [Board name] (/boards/[id])      ← active board

Tasks
  └── Current board tasks (inline trên board page)

Governance
  ├── Approvals (/approvals)            ← dedicated page
  └── Audit log (/audit)               ← dedicated page
```

### 6.2 Board view — Kanban cần interactive

**Hiện tại**: Read-only, không thể move task, không có interactivity.

**Ưu tiên**:
1. Task cards phải clickable → navigate đến `/tasks/[id]`
2. Stale task detection — badge đỏ khi heartbeat quá cũ
3. Approval pending — badge amber trên task card
4. Quick actions trên task card (approve, reassign)

### 6.3 Empty states

**Vấn đề**: Khi vault trống, UI hiển thị "unavailable" strings khắp nơi.

**Đề xuất**: Dedicated empty state component với:
- Minh họa trực quan
- Giải thích ngắn gọn ("No vault data loaded yet")
- Action rõ ràng ("Add your first project" hoặc link đến docs)

### 6.4 Approval flow — thiếu action

**Hiện tại**: `ApprovalPanel` hiển thị action items nhưng không có button thực sự. Chỉ là text.

**Cần thêm**: 
- `[Approve]` button → POST đến API → Vault write
- `[Reject]` button với reason input
- `[Request Changes]` với comment

### 6.5 Visual hierarchy trên board

**Vấn đề**: Tất cả task cards trông như nhau, không phân biệt priority.

**Đề xuất**:
```
Critical → Left border 3px solid red
High     → Left border 3px solid amber
Medium   → Default (no accent)
Low      → Opacity 0.8
```

### 6.6 Responsive breakpoints

```
Mobile  (< 768px):   1 column, collapsible sidebar
Tablet  (768-1024px): 2 columns, overlay sidebar
Desktop (1024-1200px): 2-col sidebar+main, 2 Kanban columns
Wide    (≥ 1200px):   2-col sidebar+main, 4 Kanban columns
```

---

## 7. Screen Layouts (Wireframe Text)

### 7.1 Workspace Dashboard (/)

```
┌─────────────────────────────────────────────────────────┐
│  RELAYHQ                     [Control plane only] [Vault]│
│  Control plane for agent-assisted work                   │
└─────────────────────────────────────────────────────────┘
┌────────────────┐ ┌─────────────────────────────────────┐
│ CURRENT WORKSPACE│ │ WORKSPACE OVERVIEW                  │
│ Acme Workspace  │ │ ┌──────────┐ ┌──────────┐          │
│ Vault-backed    │ │ │ Projects │ │  Boards  │          │
│ [phase-1]       │ │ │    3     │ │    2     │          │
│                 │ │ └──────────┘ └──────────┘          │
│ VIEWS           │ │ ┌──────────┐ ┌──────────┐          │
│ > Project       │ │ │  Tasks   │ │Approvals │          │
│ > Board         │ │ │   12     │ │ 2 pending│ ← amber  │
│ > Task workflow │ │ └──────────┘ └──────────┘          │
│                 │ ├─────────────────────────────────────┤
│ WORKSPACE       │ │ BOARD FLOW                          │
│ > Overview      │ │ 01 TODO  02 IN-PROGRESS             │
│ > Projects      │ │ 03 REVIEW  04 DONE                  │
│                 │ ├─────────────────────────────────────┤
│ COORDINATION    │ │ PENDING APPROVALS          ← alert  │
│ > Board         │ │ ⚠ task-007 — deploy request        │
│ > Tasks         │ │ ⚠ task-012 — delete data           │
│                 │ └─────────────────────────────────────┘
│ GOVERNANCE      │
│ > Approvals ⚠2  │ ← badge
│ > Audit         │
└────────────────┘
```

### 7.2 Board View (/boards/[board])

```
┌────────────────┐ ┌─────────────────────────────────────┐
│ [Sidebar]       │ │ BOARD OVERVIEW                      │
│                 │ │ Auth Board     [12 tasks] [2 gates] │
│                 │ ├─────────────────────────────────────┤
│                 │ │  TODO (3)  IN-PROG(4)  REVIEW(3) DONE(2)│
│                 │ │ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐│
│                 │ │ │task-001│ │task-005│ │task-009│ │done  ││
│                 │ │ │Impl API│ │Deploy  │ │PR Rview│ │      ││
│                 │ │ │@agent  │ │@agent  │ │@alice  │ │      ││
│                 │ │ │HIGH    │ │HIGH ⚠ │ │MED     │ │      ││
│                 │ │ │  0%    │ │ 60%   │ │ 90%    │ │100%  ││
│                 │ │ ├────────┤ ├────────┤ └────────┘ └──────┘│
│                 │ │ │task-002│ │task-006│                    │
│                 │ │ │… STALE │ │…      │ ← red border       │
│                 │ │ └────────┘ └────────┘                    │
└────────────────┘ └─────────────────────────────────────┘
```

### 7.3 Task Detail (/tasks/[task])

```
┌────────────────┐ ┌─────────────────────────────────────┐
│ [Sidebar]       │ │ TASK WORKFLOW                       │
│                 │ │ Implement Password Reset API         │
│                 │ │ [waiting-approval] [in-progress]    │
│                 │ │ Priority: HIGH  Assignee: agent-dev │
│                 │ ├───────────────────┬─────────────────┤
│                 │ │ TASK DETAIL       │ APPROVAL PANEL  │
│                 │ │ (sticky drawer)   │                 │
│                 │ │ Task id: task-001 │ ⚠ PENDING       │
│                 │ │ Source: vault/... │ Requested by:   │
│                 │ │ Workspace: Acme   │ agent-backend   │
│                 │ │ Project: Auth     │ Reason: needs   │
│                 │ │ Board/Column:...  │ prod access     │
│                 │ │ Priority: HIGH    │                 │
│                 │ │ Progress: 60%     │ [✓ Approve]     │
│                 │ │                   │ [✗ Reject]      │
│                 │ │ Tags: [auth][api] │ [↩ Changes]    │
│                 │ │ Lock: Unlocked    │                 │
│                 │ │                   │ STATUS TIMELINE │
│                 │ │                   │ ○ todo          │
│                 │ │                   │ ● in-progress   │
│                 │ │                   │ ◑ waiting-appr. │
└────────────────┘ └───────────────────┴─────────────────┘
```

---

## 8. Interaction States

### Task Card States

```
Default:
┌──────────────────────────┐
│ Implement Auth API        │
│ @agent-backend  HIGH      │
│ Progress: ████░░ 60%      │
└──────────────────────────┘

Hover:
┌──────────────────────────┐  ← transform: translateY(-1px)
│ Implement Auth API        │  ← border: rgba(124,58,237,0.24)
│ @agent-backend  HIGH      │  ← shadow lifts
│ Progress: ████░░ 60%      │
└──────────────────────────┘

Stale (heartbeat > threshold):
┌──────────────────────────┐
│ 🔴 Implement Auth API    │  ← red left border
│ ⚠ Stale — 3hrs no update │
│ @agent-backend  HIGH      │
└──────────────────────────┘

Waiting Approval:
┌──────────────────────────┐
│ 🟡 Implement Auth API    │  ← amber left border
│ ⏳ Waiting for approval  │
│ @agent-backend  HIGH      │
└──────────────────────────┘

Critical Priority:
┌──────────────────────────┐
│ ‼ Implement Auth API     │  ← red-600 left border 3px
│ @agent-backend  CRITICAL  │
│ Progress: ░░░░░░ 0%       │
└──────────────────────────┘
```

### Approval Button States

```
[✓ Approve]           → green, hover darker
[✗ Reject]            → red, hover darker, requires reason input
[↩ Request Changes]  → slate, hover shows text area
[Approved ✓]          → green disabled, read-only after decision
```

---

## 9. Design Principles đặc thù RelayHQ

### 1. Control plane visibility over execution detail
UI phải phân biệt rõ ràng: **coordination state** (visible) vs **execution detail** (hidden). Không bao giờ hiển thị heartbeat timestamps, tool output, inference logs trong UI chính.

### 2. Vault path transparency
Mỗi object hiển thị `source path` của vault file. Người dùng luôn biết dữ liệu đến từ đâu. Đây là trust anchor.

### 3. Approval gates là first-class citizen
Approval badges, counters, và panels phải **nổi bật hơn** mọi thứ khác. Đây là gating mechanism quan trọng nhất của system.

### 4. Traceability over freshness
Không realtime streaming. Vault-backed reads. Trang phải rõ ràng rằng data phản ánh vault state, không phải live execution state.

### 5. Empty state should teach, not confuse
Khi vault trống, UI phải guide người dùng, không chỉ hiển thị "unavailable". Mỗi empty state là onboarding opportunity.

---

## 10. Missing Flows (Future Scope)

| Flow | Phase | Mô tả |
|------|-------|-------|
| Onboarding / Workspace Setup | 1 | Tạo workspace → project → board → columns |
| Task Creation | 1 | Form tạo task mới, giao cho agent/human |
| Column Move | 1 | Drag hoặc button để move task giữa columns |
| Stale Recovery | 1 | Phát hiện và xử lý task stale |
| Agent Registry View | 1 | Xem danh sách agents, capabilities, status |
| Audit Log Page | 1 | Timeline tất cả audit notes của project/board |
| Multi-board Navigation | 2 | Switch giữa nhiều boards trong cùng workspace |
| Plan View | 2 | Hierarchical task tree (parent/child) |
| Notification Center | 4 | Inbox cho approvals, mentions, stale alerts |
| Progress Dashboard | 5 | Charts, column distribution, velocity |
| Customer Report | 6 | Exportable summary cho stakeholders |

---

*Document này phản ánh trạng thái thiết kế hiện tại của `vault-first-rebuild` branch và định hướng Phase 1.*
