# RelayHQ — UI/UX Redesign Spec

**Version:** 2.0  
**Date:** 2026-04-24  
**Status:** Handoff-ready  
**Replaces:** `ux-design.md`

---

## 1. Overview

RelayHQ là vault-first coordination control plane cho phối hợp human-agent.  
Tài liệu này mô tả toàn bộ information architecture, userflow, layout, component spec, và interaction rules cho lần redesign UI.

### Vấn đề với UI cũ

- Quá nhiều text, thiếu visual hierarchy
- Khu vực thông tin không phân chia rõ ràng
- Đơn điệu, không có cảm giác "live operation"
- Navigation phân tán qua nhiều page riêng biệt

### Mục tiêu thiết kế mới

- **High-density**: nhiều tasks và agents hiển thị cùng lúc
- **Command Center feel**: PM nhìn vào và hiểu ngay toàn bộ trạng thái
- **Live presence**: agents có "hiện diện" trực quan trên board (subtle, không phức tạp)
- **Single shell**: mọi thứ trong một layout, drill-down bằng panel — không phải page load
- **Responsive**: desktop-first, mobile-ready

---

## 2. Live World — Game Canvas Metaphor

### Vision

Board không phải là bảng tĩnh. Board là một **live world** — PM nhìn vào như nhìn vào một công trường đang hoạt động: agents đang di chuyển, tasks đang được xây dựng, tiến trình hiện ra từng bước.

Metaphor: **city builder meets mission control.** Mỗi agent là một nhân vật có presence trên board. PM là commander quan sát và can thiệp khi cần.

---

### Agent Presence trên Board

Mỗi agent đang active được hiển thị như một **avatar nhỏ** gắn lên task card mà họ đang làm.

**Avatar anatomy:**
```
┌──────────────────────────┐
│ ● Deploy API to Prod      │
│ [🤖] agent-b  ████░░ 80% │  ← avatar 20px, tên truncate
└──────────────────────────┘
    │
    └── Subtle pulse ring khi agent đang active
        (scale 1 → 1.15 → 1, opacity 1 → 0.4 → 1, 2.5s infinite)
```

**Avatar states:**
```
🟢 Active (heartbeat recent)     → avatar full color + pulse ring
🟡 Waiting (approval / blocked)  → avatar desaturated + slow blink
🔴 Stale (heartbeat expired)     → avatar greyscale + no animation
⚪ Idle (no task)                → không hiện trên board
```

---

### Task Card Live States

Task card phản ánh trạng thái thực đang xảy ra bên trong agent runtime:

```
Agent vừa claim task:
  → Card "born" vào IN PROGRESS column
  → Animation: fadeIn + slideDown từ top của column (300ms)
  → Avatar gắn lên card với pulse ring

Agent đang làm việc, progress update:
  → Progress bar fill tăng dần (transition 600ms ease)
  → Không re-render toàn bộ card — chỉ bar animate

Agent request approval:
  → Card đổi left border sang amber (200ms transition)
  → Label "WAITING APPROVAL" fade in
  → Alert Strip xuất hiện ở topbar (slide down 250ms)
  → Agent avatar chuyển sang slow blink

Approval được duyệt:
  → Border quay về bình thường
  → Label "APPROVED ✓" flash xanh 500ms rồi biến mất
  → Agent avatar quay lại full color + pulse

Task hoàn thành:
  → Card "travel" animation: trượt sang DONE column (400ms ease-in-out)
  → Tại DONE: card fade về muted state (opacity 0.6)
  → Brief sparkle/checkmark flash (200ms) — subtle, không to quá

Task stale (heartbeat timeout):
  → Left border đổi sang đỏ (200ms)
  → Avatar chuyển greyscale
  → Label "STALE · Xh ago" fade in
```

---

### Column Flow Animation

Khi task di chuyển giữa columns (qua API update):

```
Source column: card fades out + slides right (200ms)
Target column: card fades in + slides down vào đúng vị trí (300ms)

Không dùng drag & drop (Phase 1) — movement xảy ra do agent/API update,
không phải do user kéo. Đây là điểm khác biệt với Kanban thông thường.
```

---

### "Nhiều agents cùng làm" — High Density Mode

Khi có nhiều agents active đồng thời, board phải readable ở mật độ cao:

```
IN PROGRESS column với 6 tasks, mỗi task có agent khác nhau:
┌──────────────────┐
│ [🤖a] Deploy API  │  agent-backend (pulse)
│ ████████░ 80%    │
├──────────────────┤
│ [🤖b] Write Tests │  agent-test (pulse)
│ ████░░░░░ 40%    │
├──────────────────┤
│ [🤖c] DB Migrate  │  agent-infra (pulse)
│ ██████░░░ 60%    │
├──────────────────┤
│ [🤖d] Auth Refact │  agent-backend-2 (pulse)
│ ██░░░░░░░ 20%    │
├──────────────────┤
│ [⏳] Login UI     │  agent-frontend (waiting, blink)
│ ██████░░░ 55%    │
├──────────────────┤
│ [🔴] Cleanup Job  │  agent-cleanup (stale, grey)
│ ████░░░░░ 40%    │
└──────────────────┘
```

Rules:
- Tối đa 1 avatar hiện trên mỗi card (assignee chính)
- Nếu column có > 8 tasks: scroll trong column, không collapse
- Columns có thể khác chiều cao nhau — không force equal height
- Pulse rings không overlap nhau (chỉ on-card, không floating)

---

### Activity Feed (Live Ticker)

Phần dưới sidebar hoặc bottom strip (optional, có thể toggle):

```
LIVE ACTIVITY
━━━━━━━━━━━━━━━━━━
🤖 agent-backend claimed task-005          2s ago
✓  @amas approved task-007               1m ago
🤖 agent-test heartbeat on task-009       3m ago
🤖 agent-frontend went stale (task-003)  10m ago
━━━━━━━━━━━━━━━━━━
```

- Max 5 dòng gần nhất
- New item: slide in từ top với fade (200ms)
- Cũ nhất: fade out khi bị đẩy ra
- Click item → Detail Panel của task liên quan

---

### Animation Principles

**Subtle, không distract:**
- Animation phục vụ thông tin, không phải decoration
- Không có hiệu ứng to hay flashy (không confetti, không bounce lớn)
- Duration max 400ms cho bất kỳ animation nào
- Respect `prefers-reduced-motion`: tất cả animation tắt hoàn toàn nếu user bật reduced motion

**Continuity:**
- Khi board refresh (polling vault state), chỉ update những card có thay đổi
- Không re-render toàn bộ board — prevents flash
- Transitions mượt giữa states, không jump

**Hierarchy:**
- Approval alerts animate mạnh nhất (cần sự chú ý ngay)
- Agent activity animate nhẹ nhất (background context)
- Task completion animate ở giữa (satisfying nhưng không overwhelm)

---

## 3. Target Users

### Primary — Human PM / PO

Người dùng chính. Vào app hàng ngày để:
- Xem tiến độ dự án và trạng thái tasks
- Theo dõi các agents đang làm gì
- Phê duyệt hoặc từ chối các approval requests
- Tạo và giao task mới
- Phát hiện sự cố (stale tasks, blocked agents)

**Nhu cầu ưu tiên:**
1. Thấy ngay "có gì cần tôi làm không?" khi mở app
2. Scan được toàn bộ trạng thái board trong vài giây
3. Approve/reject nhanh mà không cần navigate nhiều
4. Biết agent nào đang làm gì, agent nào đang stuck

### Secondary — Human Team Member / Reviewer

- Theo dõi board để nắm tiến độ
- Review và comment task được giao
- Dùng ít tính năng hơn PM

### Agent (Machine Actor) — không dùng UI

- Tương tác qua CLI và API
- Claim task, heartbeat, request approval, mark done
- UI chỉ hiển thị trạng thái của agent, không cho agent điều khiển

---

## 3. Information Architecture

### Navigation structure

```
Shell (TopBar + Sidebar — luôn visible trên desktop)
│
├── Board              ← màn hình mặc định khi mở app
│   └── click task → Detail Panel slide-in từ phải
│       └── [Open full page] → /tasks/[id] (nếu cần)
│
├── Tasks              ← list view, search, filter
│   └── click row → Detail Panel slide-in
│
├── Approvals          ← inbox-style, chỉ pending items
│   └── Approve / Reject trực tiếp tại đây
│
├── Agents             ← live status của tất cả agents
│   └── click agent → activity log + task hiện tại
│
└── Audit              ← timeline read-only
```

### URL structure

```
/                   → redirect → /boards/[default-board]
/boards/[id]        → Board view (main)
/tasks              → Task list
/tasks/[id]         → Task full page (fallback, ít dùng)
/approvals          → Approval queue
/agents             → Agent registry + live status
/audit              → Audit trail
/projects/[id]      → Project detail (secondary)
```

---

## 4. Shell Layout

### Desktop (≥ 1024px)

```
┌─────────────────────────────────────────────────────────────┐
│  TOPBAR (56px fixed)                                        │
│  [Logo] [Project picker ▼]  ──────────  [⚠ 2] [@user ▼]   │
├──────────────┬──────────────────────────────┬───────────────┤
│              │                              │               │
│   SIDEBAR    │        MAIN CANVAS           │  DETAIL PANEL │
│   (220px)    │     (flex, fills space)      │  (320px)      │
│   fixed      │     scrollable               │  slide-in     │
│              │                              │  hidden by    │
│              │                              │  default      │
│              │                              │               │
└──────────────┴──────────────────────────────┴───────────────┘
```

- Detail Panel mặc định **ẩn**
- Khi user click task → panel slide in từ phải (300ms ease-out)
- Main canvas thu hẹp lại khi panel mở (không bị che)
- Panel có thể đóng bằng `✕` hoặc click outside

### Tablet (768px – 1023px)

```
┌─────────────────────────────────────────────┐
│  TOPBAR (compact)                           │
├──────────────┬──────────────────────────────┤
│  SIDEBAR     │     MAIN CANVAS              │
│  (collapsible│                              │
│  icon-only   │                              │
│  hoặc overlay│                              │
│  khi mở)     │                              │
└──────────────┴──────────────────────────────┘
Detail Panel → full-width overlay
```

### Mobile (< 768px)

```
┌─────────────────────┐
│  TOPBAR (compact)   │
├─────────────────────┤
│                     │
│    MAIN CANVAS      │
│    (full width)     │
│                     │
├─────────────────────┤
│  BOTTOM NAV (5 tabs)│
│ Board Tasks ⚠ Agents│
└─────────────────────┘
Detail Panel → bottom sheet (slides up)
```

---

## 5. Components

### 5.1 TopBar

**Height:** 56px  
**Position:** fixed top, full width  
**Background:** surface color với blur backdrop

**Elements (left → right):**
```
[Logo / wordmark]  [Project picker dropdown ▼]  ─── spacer ───  [Approval bell ⚠ count]  [User avatar + name ▼]
```

**Approval bell:**
- Không có pending → icon bình thường, no badge
- Có pending → icon amber, badge số đỏ (e.g. `2`)
- Click → navigate `/approvals`

**Project picker:**
- Dropdown liệt kê tất cả projects trong workspace
- Active project được highlight
- Option "+ New Project" ở cuối list

---

### 5.2 Sidebar

**Width:** 220px (desktop), icon-only 56px (tablet collapsed)  
**Position:** fixed left, full height  
**Background:** surface darker hơn main canvas

```
┌──────────────────┐
│ [Logo area]      │
├──────────────────┤
│ NAVIGATION       │
│                  │
│ 📋 Board         │  ← active state: accent color + bg highlight
│ ✅ Tasks         │
│ ⏳ Approvals [2] │  ← badge số pending (amber)
│ 🤖 Agents    [4] │  ← badge số agents active (blue)
│ 📝 Audit         │
├──────────────────┤
│ PROJECTS         │
│                  │
│ > Meow Land  ●   │  ← dot xanh = có hoạt động
│ > Auth API   ●   │
│ > Infra      ○   │  ← dot xám = inactive
│                  │
│ [+ New Project]  │
├──────────────────┤
│ [Settings]       │  ← bottom
└──────────────────┘
```

**Active states:**
- Nav item active: accent background (e.g. violet-50), accent text, left border 2px accent
- Project item active: bolder text

---

### 5.3 Alert Strip

**Vị trí:** dưới TopBar, trên main canvas  
**Hiển thị:** chỉ khi có approval pending  
**Tự ẩn:** khi không còn pending items

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠  task-007 đang chờ bạn approve · "Deploy to production"  [Review →]│
└─────────────────────────────────────────────────────────────┘
```

- Background: amber-50, border amber-200, text amber-900
- Nếu nhiều hơn 1 pending: hiện "2 tasks đang chờ approve" → click → `/approvals`
- Nếu chỉ 1: hiện task cụ thể với link

---

### 5.4 Task Card (compact)

**Dùng ở:** Board, Tasks list  
**Kích thước:** full width của column, chiều cao ~72px

```
┌──────────────────────────────┐
│ [priority dot] Task title    │  ← truncate 1 dòng
│ [avatar] assignee  [bar] XX% │  ← mini progress bar
└──────────────────────────────┘
```

**Priority dot màu:**
- `critical` → red-600
- `high` → amber-500
- `medium` → không có dot (neutral)
- `low` → slate-300

**Left border indicator:**
- `waiting-approval` → 3px amber
- `stale` → 3px red
- `blocked` → 3px red
- `critical priority` → 3px red-600
- `high priority` → 3px amber-500

**Agent presence (subtle):**
- Agent avatar nhỏ (20px) + pulse animation nhẹ khi agent đang active
- Avatar greyscale khi idle, color khi active

**State labels trên card:**
```
🤖  [avatar]  agent-name     ← agent active, đang làm
⏳  WAITING APPROVAL          ← chờ human, amber bg
🔴  STALE · 3h ago            ← không có heartbeat
✓   DONE                      ← muted, opacity giảm
```

**Hover state:**
- `transform: translateY(-2px)`
- `box-shadow: lifted`
- `border-color: accent rgba`
- transition 150ms ease

**Click → Detail Panel slide in**

---

### 5.5 Detail Panel

**Width:** 320px (desktop), full-width overlay (mobile bottom sheet)  
**Position:** right edge của main canvas  
**Trigger:** click task card từ bất kỳ view nào

```
┌──────────────────────────────┐
│ [✕]  task-005                │  ← close button
│ Deploy API to Production      │
│ [in-progress pill] [HIGH pill]│
├──────────────────────────────┤
│ Assignee   🤖 agent-backend  │
│ Project    Auth API          │
│ Board      Main Board        │
│ Column     In Progress       │
│ Progress   ████████░░ 80%    │
│ Last seen  2 minutes ago     │
├──────────────────────────────┤
│ (Approval block — chỉ hiện   │
│  khi status waiting-approval)│
│                              │
│ ⚠  WAITING APPROVAL          │
│ "Needs production DB access" │
│ Requested by agent-backend   │
│ 15 minutes ago               │
│                              │
│ [✓ Approve]  [✗ Reject]      │
├──────────────────────────────┤
│ (Blocked block — chỉ hiện    │
│  khi status blocked)         │
│                              │
│ 🔴 BLOCKED                   │
│ "Cannot connect to DB"       │
│ Since 2h ago                 │
│ [Reassign]  [Mark Cancelled] │
├──────────────────────────────┤
│ TIMELINE                     │
│ ● todo          Apr 23 10:00 │
│ ● in-progress   Apr 23 10:30 │
│ ◑ waiting-appr  Apr 23 14:00 │
│ ○ (pending)                  │
├──────────────────────────────┤
│ Tags: [auth] [api] [deploy]  │
│ Vault: tasks/task-005.md     │
│                [Open full ↗] │
└──────────────────────────────┘
```

**Hành vi:**
- Slide in từ phải, main canvas không bị che (thu hẹp)
- Đóng bằng `✕`, Escape, hoặc click outside
- Khi đang mở panel, click task khác → panel update nội dung (không đóng rồi mở lại)

---

### 5.6 Board View (main screen)

**Layout:** 4 columns ngang, horizontal scroll nếu không đủ chỗ

```
BOARD HEADER
┌─────────────────────────────────────────────────────────────┐
│  Main Board  ·  14 tasks  ·  4 agents active  [+ New Task] │
└─────────────────────────────────────────────────────────────┘

COLUMNS
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  TODO (3)    │ IN PROGRESS  │  REVIEW (2)  │  DONE (4)    │
│              │    (5)       │              │              │
│  task cards  │  task cards  │  task cards  │  task cards  │
│  stacked     │  stacked     │  stacked     │  stacked     │
│  vertically  │  vertically  │  vertically  │  (muted)     │
│              │              │              │              │
│              │              │              │              │
│ [+ Add task] │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

**Column header:**
- Column name + count
- Background nhẹ hơn card background
- Đường kẻ phân cách column rõ ràng

**Done column:**
- Cards muted (opacity 0.6)
- Collapse được sau N tasks (e.g. show 3, "Show 4 more...")

**Empty column state:**
- Dashed border
- Text "No tasks" nhỏ ở giữa
- TODO column: có button "+ Add task"

---

### 5.7 Tasks List View

**Trigger:** Click "Tasks" ở sidebar

```
HEADER
┌─────────────────────────────────────────────────────────────┐
│  Tasks  [+ New Task]                                        │
│  [🔍 Search tasks...]  [Project ▼]  [Status ▼]  [Assignee ▼]│
└─────────────────────────────────────────────────────────────┘

LIST
┌─────────────────────────────────────────────────────────────┐
│ ⏳ task-007  Deploy to prod          waiting  🤖 agent-b   │
│ 🔴 task-003  Login UI (stale)        in-prog  🤖 agent-f   │
│ ●  task-005  Implement API           in-prog  🤖 agent-b   │
│ ○  task-001  Write tests             todo     —            │
│ ✓  task-009  DB schema               done     🤖 agent-b   │
└─────────────────────────────────────────────────────────────┘
```

**List row anatomy:**
```
[status icon]  [id]  [title — truncate]  [spacer]  [status pill]  [assignee avatar + name]
```

**Sắp xếp mặc định:** urgent first (waiting-approval > stale > blocked > in-progress > todo > done)

**Search:** full-text, filter theo project/status/assignee theo real-time

**Click row → Detail Panel slide in**

---

### 5.8 Approvals View

**Trigger:** Click "Approvals" ở sidebar, hoặc alert strip

```
HEADER
Approvals — 2 pending

PENDING SECTION
┌─────────────────────────────────────────────────────────────┐
│  URGENT — waiting longest first                             │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ task-007  ·  Deploy to Production                     │  │
│  │ 🤖 agent-backend  ·  Auth API project                 │  │
│  │ "Needs production database access to run migration"   │  │
│  │ Requested 15 minutes ago                              │  │
│  │ [✓ Approve]  [✗ Reject]  [View task →]                │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ task-012  ·  Delete Legacy User Data                  │  │
│  │ 🤖 agent-cleanup  ·  Infra project                    │  │
│  │ "Removing 50,000 rows from users_v1 table"            │  │
│  │ Requested 1 hour ago                                  │  │
│  │ [✓ Approve]  [✗ Reject]  [View task →]                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

RESOLVED SECTION (collapsed by default)
▶ Show 12 resolved approvals
```

**Approve flow:**
1. Click `[✓ Approve]`
2. Confirm dialog: "Approve this action? This will allow the agent to continue."
3. `[Confirm Approve]` / `[Cancel]`
4. Task state cập nhật, card disappears từ pending list

**Reject flow:**
1. Click `[✗ Reject]`
2. Inline form mở ra:
   ```
   Reason for rejection (optional):
   [____________________________________]
   [Confirm Reject]  [Cancel]
   ```
3. Submit → task state cập nhật

---

### 5.9 Agents View

**Trigger:** Click "Agents" ở sidebar

```
HEADER
Agents — 4 active / 6 total

ACTIVE AGENTS
┌─────────────────────────────────────────────────────────────┐
│ 🟢 agent-backend                                            │
│    Deploy API to Production  ·  Auth API                    │
│    ████████░░  80%  ·  last heartbeat: 2 minutes ago        │
├─────────────────────────────────────────────────────────────┤
│ 🟡 agent-cleanup                           waiting-approval │
│    Delete Legacy Data  ·  Infra project                     │
│    Waiting for approval since 1h ago  [Review approval →]   │
├─────────────────────────────────────────────────────────────┤
│ 🔴 agent-frontend                                    stale  │
│    Login UI Redesign  ·  Auth API                           │
│    Last heartbeat: 3 hours ago  [Mark as blocked]           │
├─────────────────────────────────────────────────────────────┤
│ 🟢 agent-test                                               │
│    Write unit tests  ·  Auth API                            │
│    ████░░░░░░  40%  ·  last heartbeat: 5 minutes ago        │
└─────────────────────────────────────────────────────────────┘

IDLE AGENTS
┌─────────────────────────────────────────────────────────────┐
│ ⚪ agent-docs     Idle  ·  No active task                   │
│ ⚪ agent-infra    Idle  ·  No active task                   │
└─────────────────────────────────────────────────────────────┘
```

**Status dot màu:**
- 🟢 green = active, heartbeat recent
- 🟡 yellow = waiting for something (approval, dependency)
- 🔴 red = stale / blocked
- ⚪ grey = idle

**Click agent row → Detail Panel** hiện thị:
- Agent metadata (name, role, capabilities)
- Current task (nếu có)
- Recent activity log (5 dòng gần nhất)

---

### 5.10 Audit View

**Trigger:** Click "Audit" ở sidebar

```
HEADER
Audit Trail — Auth API  [All projects ▼]

TIMELINE
┌─────────────────────────────────────────────────────────────┐
│ TODAY                                                       │
│                                                             │
│ 14:32  🤖 agent-backend requested approval for task-007    │
│        "Needs production DB access"  · task-007            │
│                                                             │
│ 13:45  ✓ @amas approved task-005 (Deploy API)              │
│        Result: "Deployment successful, PR #42 merged"      │
│                                                             │
│ 12:00  🤖 agent-backend claimed task-005                    │
│        Status changed: todo → in-progress                  │
│                                                             │
│ YESTERDAY                                                   │
│                                                             │
│ 16:20  @amas created task-012 (Delete Legacy Data)         │
│        Assigned to agent-cleanup, priority: high           │
│                                                             │
│ 15:00  🤖 agent-backend completed task-009 (DB Schema)     │
│        "Schema migration applied successfully"             │
└─────────────────────────────────────────────────────────────┘
```

---

### 5.11 New Task Form

**Trigger:** Click `[+ New Task]` từ Board header hoặc Tasks header  
**Display:** Modal overlay (không phải full page)

```
┌────────────────────────────────────────┐
│ New Task                          [✕]  │
├────────────────────────────────────────┤
│ Title *                                │
│ [________________________________]     │
│                                        │
│ Description                            │
│ [________________________________]     │
│ [________________________________]     │
│                                        │
│ Project *         Board *              │
│ [Auth API ▼]      [Main Board ▼]       │
│                                        │
│ Priority          Assignee             │
│ [High ▼]          [agent-backend ▼]    │
│                                        │
│ Requires approval?                     │
│ ○ No   ● Yes                           │
│                                        │
│ Tags (optional)                        │
│ [api] [auth] [+ add]                   │
├────────────────────────────────────────┤
│              [Cancel]  [Create Task]   │
└────────────────────────────────────────┘
```

**Sau khi submit:**
- Modal đóng
- Task xuất hiện ở column TODO trên board (smooth insert animation)
- Toast notification: "Task created — task-013"

---

## 6. User Flows (End-to-End)

### Flow 1 — PM mở app buổi sáng, check trạng thái

```
Mở app
  │
  ▼
/boards/[default-board]
  │
  ├── Thấy Alert Strip: "2 tasks đang chờ approve"
  │     └── Click [Review →] → /approvals
  │
  ├── Scan board nhanh:
  │     ├── Thấy task 🔴 STALE → click → Detail Panel
  │     │     └── Quyết định reassign hoặc mark blocked
  │     ├── Thấy task ⏳ WAITING APPROVAL → click → Detail Panel
  │     │     └── Approve hoặc reject ngay tại panel
  │     └── Thấy progress bình thường → không cần action
  │
  └── Xong — không cần navigate ra ngoài board
```

---

### Flow 2 — PM tạo task mới

```
Đang ở Board view
  │
  ▼
Click [+ New Task]
  │
  ▼
Modal form mở
  │
  ├── Điền title, project, board, priority, assignee
  └── Click [Create Task]
        │
        ▼
      Task xuất hiện ở TODO column
      Toast "Task created"
      Modal đóng
```

---

### Flow 3 — PM phê duyệt approval request

**Path A — Từ Alert Strip:**
```
Alert Strip: "task-007 chờ approve"
  │
  ▼
Click [Review →]
  │
  ▼
Detail Panel mở (task-007)
  │
  ├── Đọc reason: "Needs prod DB access"
  ├── Click [✓ Approve]
  └── Confirm dialog → [Confirm Approve]
        │
        ▼
      Task state cập nhật
      Agent tiếp tục làm việc
      Panel hiện "Approved ✓"
```

**Path B — Từ Approvals page:**
```
Sidebar → Approvals [2]
  │
  ▼
/approvals — thấy danh sách pending
  │
  ├── Review từng item
  ├── Click [✓ Approve] hoặc [✗ Reject]
  └── (Reject: nhập reason → Confirm)
        │
        ▼
      Item biến mất khỏi pending list
      Badge giảm số
```

---

### Flow 4 — PM phát hiện và xử lý task stale

```
Board view
  │
  ▼
Thấy task card với [🔴 STALE · 3h ago]
  │
  ▼
Click task card → Detail Panel
  │
  ├── Thấy: last heartbeat 3 giờ trước
  ├── Agent: agent-frontend
  │
  ├── Option A: [Reassign]
  │     └── Dropdown chọn agent khác → assign
  │
  └── Option B: [Mark Blocked]
        └── Nhập blocked_reason → confirm
              │
              ▼
            Task chuyển sang BLOCKED state
            Hiện ở board với border đỏ
```

---

### Flow 5 — PM xem agents đang làm gì

```
Sidebar → Agents [4]
  │
  ▼
/agents — thấy danh sách agents với live status
  │
  ├── 🟢 agent-backend → task-005, 80%, 2m ago
  ├── 🟡 agent-cleanup → waiting approval
  ├── 🔴 agent-frontend → stale 3h
  └── ⚪ agent-test → idle
  │
  ├── Click agent-frontend (stale)
  │     └── Detail: last heartbeat, current task, activity log
  │           └── [Mark as blocked] hoặc [Reassign task]
  │
  └── Click agent-cleanup (waiting)
        └── Detail: approval reason, link to approval
              └── [Go to approval →]
```

---

### Flow 6 — Agent lifecycle (CLI — không qua UI)

```
Agent startup
  │
  ▼
CLI: relayhq tasks --assignee=agent-backend
  → Trả danh sách tasks status:todo được giao

  │
  ▼
CLI: relayhq claim task-005 --assignee=agent-backend
  → Vault write: status=in-progress, execution_started_at, heartbeat_at
  → Board: task chuyển sang IN PROGRESS, hiện avatar 🤖

  │
  ▼
Agent làm việc...
  │
  ├── Mỗi ~5 phút:
  │   CLI: relayhq heartbeat task-005 --assignee=agent-backend
  │   → Vault write: heartbeat_at=now
  │   → Board: "last seen X min ago" cập nhật
  │
  ├── Cần approval:
  │   CLI: relayhq request-approval task-005 --reason="Needs prod access"
  │   → Vault write: approval_needed=true, status=waiting-approval
  │   → Board: task hiện ⏳ WAITING APPROVAL
  │   → Alert Strip xuất hiện cho PM
  │   → Agent dừng, poll trạng thái
  │
  ├── Bị block:
  │   CLI: relayhq update task-005 --status=blocked --blocked-reason="..."
  │   → Board: task hiện 🔴 BLOCKED
  │
  └── Hoàn thành:
      CLI: relayhq update task-005 --status=done --result="PR #42 merged"
      → Vault write: status=done, result, completed_at
      → Board: task chuyển sang DONE column
      → Audit note được ghi tự động
```

---

## 7. Design System

### 7.1 Color tokens

| Token | Value | Usage |
|-------|-------|-------|
| `color-accent` | `#7c3aed` violet-600 | Primary actions, active nav, links |
| `color-accent-light` | `#ede9fe` violet-100 | Active nav background |
| `color-surface` | `#ffffff` | Card backgrounds |
| `color-surface-secondary` | `#f8fafc` slate-50 | Page background |
| `color-surface-sidebar` | `#f1f5f9` slate-100 | Sidebar background |
| `color-border` | `#e2e8f0` slate-200 | Card borders, dividers |
| `color-text-primary` | `#0f172a` slate-950 | Headings, primary labels |
| `color-text-secondary` | `#475569` slate-600 | Body text, descriptions |
| `color-text-tertiary` | `#94a3b8` slate-400 | Captions, timestamps |
| `color-status-active` | `#1d4ed8` blue-700 | In-progress status |
| `color-status-waiting` | `#d97706` amber-600 | Waiting approval, alerts |
| `color-status-blocked` | `#dc2626` red-600 | Blocked, stale, critical |
| `color-status-done` | `#16a34a` green-600 | Done, approved |
| `color-status-todo` | `#64748b` slate-500 | Todo, idle |

**Status pill colors:**
```
todo              → slate bg + slate text
in-progress       → blue-50 bg + blue-700 text
waiting-approval  → amber-50 bg + amber-700 text
blocked           → red-50 bg + red-700 text
done              → green-50 bg + green-700 text
cancelled         → slate-100 bg + slate-400 text
```

### 7.2 Typography

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Page title | 1.5rem (24px) | 700 | text-primary |
| Section heading | 1.125rem (18px) | 600 | text-primary |
| Card title | 0.9375rem (15px) | 500 | text-primary |
| Body text | 0.875rem (14px) | 400 | text-secondary |
| Caption / meta | 0.75rem (12px) | 400 | text-tertiary |
| Badge / pill | 0.6875rem (11px) | 700 | (status color) |
| Nav item | 0.875rem (14px) | 500 | text-secondary |
| Nav item active | 0.875rem (14px) | 600 | accent |

Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`

### 7.3 Spacing

```
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
```

### 7.4 Border radius

```
--radius-sm: 6px      ← badges, pills, small chips
--radius-md: 8px      ← buttons, inputs
--radius-lg: 12px     ← cards, panels
--radius-xl: 16px     ← modals, large containers
```

### 7.5 Shadows

```
--shadow-card:  0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)
--shadow-hover: 0 4px 12px rgba(15,23,42,0.12), 0 2px 4px rgba(15,23,42,0.06)
--shadow-panel: 0 20px 48px rgba(15,23,42,0.12), 0 8px 24px rgba(15,23,42,0.06)
--shadow-modal: 0 24px 64px rgba(15,23,42,0.16)
```

### 7.6 Animation

```
--duration-fast:   150ms
--duration-normal: 250ms
--duration-slow:   350ms
--ease-default:    cubic-bezier(0.4, 0, 0.2, 1)
--ease-out:        cubic-bezier(0, 0, 0.2, 1)
--ease-in:         cubic-bezier(0.4, 0, 1, 1)
```

**Standard animations:**
- Card hover: `transform: translateY(-2px)` + shadow lift — `150ms ease`
- Panel slide-in: `translateX(100%) → translateX(0)` — `300ms ease-out`
- Modal: `scale(0.96) + opacity(0) → scale(1) + opacity(1)` — `200ms ease-out`
- Toast: `translateY(16px) + opacity(0) → translateY(0) + opacity(1)` — `200ms ease-out`
- Agent pulse: `opacity 1 → 0.6 → 1`, 2s infinite (chỉ khi agent đang active)
- Task insert (new task): `translateY(-8px) + opacity(0) → normal` — `300ms ease-out`

---

## 8. Interaction States

### Task Card States

```
Default:
┌──────────────────────────┐
│ ● Deploy API to Prod      │
│ 🤖 agent-b  ████████ 80% │
└──────────────────────────┘

Hover:
┌──────────────────────────┐  transform: translateY(-2px)
│ ● Deploy API to Prod      │  border: rgba(124,58,237,0.3)
│ 🤖 agent-b  ████████ 80% │  shadow: lifted
└──────────────────────────┘

Waiting Approval:
┌──────────────────────────┐  left border: 3px amber-500
│ ● Deploy API to Prod      │
│ ⏳ WAITING APPROVAL       │
│ 🤖 agent-b  ████████ 80% │
└──────────────────────────┘

Stale:
┌──────────────────────────┐  left border: 3px red-500
│ ● Login UI Redesign       │
│ 🔴 STALE · 3h ago         │
│ 🤖 agent-f  ████░░░░ 40% │
└──────────────────────────┘

Critical Priority:
┌──────────────────────────┐  left border: 3px red-600
│ ‼ Fix Auth Vulnerability  │
│ 🤖 agent-b  ██░░░░░░ 20% │
└──────────────────────────┘

Done:
┌──────────────────────────┐  opacity: 0.6, no hover lift
│ ✓ DB Schema Migration     │
│ 🤖 agent-b  ████████100% │
└──────────────────────────┘
```

### Button States

```
Primary button:
[Create Task]     → accent bg, white text
[Create Task]:hover → accent darker
[Create Task]:active → scale(0.98)
[Create Task]:disabled → opacity 0.5, no pointer

Approve button:
[✓ Approve]       → green-600 bg, white text
[✓ Approve]:hover → green-700

Reject button:
[✗ Reject]        → red-600 bg, white text
[✗ Reject]:hover  → red-700

Ghost button:
[View task →]     → transparent bg, accent text, accent border
[View task →]:hover → accent-light bg
```

---

## 9. Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile S | < 480px | Single column, bottom nav |
| Mobile L | 480px – 767px | Single column, bottom nav |
| Tablet | 768px – 1023px | Sidebar icon-only + main, no right panel |
| Desktop | 1024px – 1279px | Sidebar 220px + main + panel |
| Desktop Wide | ≥ 1280px | Same + more comfortable spacing |

**Board responsive:**
- Desktop ≥ 1024px: 4 columns ngang
- Tablet: horizontal scroll, 2.5 columns visible
- Mobile: horizontal scroll, 1.2 columns visible + swipe gesture

**Detail Panel responsive:**
- Desktop: slide-in từ phải (320px), main canvas thu hẹp
- Tablet: overlay trên main canvas (full height, 80% width)
- Mobile: bottom sheet slide-up (90% height)

---

## 10. API Mapping

| UI action | API call | Vault write |
|-----------|----------|-------------|
| Load board | `GET /api/vault/read-model` | — |
| Create task | `POST /api/vault/tasks` | `vault/shared/tasks/task-{id}.md` |
| Approve task | `POST /api/vault/tasks/[id]/approve` | task frontmatter update |
| Reject task | `POST /api/vault/tasks/[id]/reject` | task frontmatter update |
| Reassign task | `PATCH /api/vault/tasks/[id]` | task frontmatter update |
| Mark blocked | `PATCH /api/vault/tasks/[id]` | status=blocked, blocked_reason |
| Load approvals | `GET /api/vault/read-model` (filter) | — |
| Load audit | `GET /api/vault/audit-notes` | — |
| Search tasks | `POST /api/kioku/search` | — |

---

## 11. Empty States

| Screen | Empty state message | Action |
|--------|--------------------|----|
| Board (no tasks) | "No tasks yet on this board" | [+ Create first task] |
| Approvals (no pending) | "All clear — nothing waiting for approval" | [View resolved →] |
| Agents (none registered) | "No agents registered in this workspace" | [See agent docs →] |
| Audit (no notes) | "No audit history yet" | — |
| Tasks search (no results) | "No tasks match your search" | [Clear filters] |

---

## 12. Screens Summary

| Screen | Route | Primary purpose |
|--------|-------|----------------|
| Board | `/boards/[id]` | Main daily view — Kanban, agent presence, live status |
| Tasks | `/tasks` | Full list, search, filter across all boards |
| Task Detail | `/tasks/[id]` | Full page (fallback) — detail panel là primary |
| Approvals | `/approvals` | Inbox-style queue — approve/reject actions |
| Agents | `/agents` | Live status của tất cả agents, activity |
| Audit | `/audit` | Timeline read-only — traceability |
| Project | `/projects/[id]` | Project metadata, boards, summary |

---

## 13. Out of Scope (Phase 1)

Các tính năng **chưa làm** trong lần này:

- Drag & drop task giữa columns
- Real-time websocket updates (vault polling là đủ)
- Notification center / inbox
- Multi-workspace switching
- Plan view / task hierarchy (parent-child)
- Progress dashboard / charts / analytics
- Comments / threads trên task
- @mentions
- Mobile app native (PWA là đủ)

---

*Tài liệu này là source of truth cho UI redesign Phase 1.*  
*Mọi thay đổi nên được cập nhật vào đây trước khi implement.*