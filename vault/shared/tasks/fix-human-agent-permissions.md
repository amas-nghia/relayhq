---
id: "fix-human-agent-permissions"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "todo"
status: "todo"
priority: "high"
title: "Fix human/agent permission model and drag-to-done bug"
assignee: null
created_by: "@amas"
created_at: "2026-04-26T00:00:00Z"
updated_at: "2026-04-26T00:00:00Z"
heartbeat_at: null
execution_started_at: null
execution_notes: null
progress: 0
approval_needed: false
approval_requested_by: null
approval_reason: null
approved_by: null
approved_at: null
approval_outcome: "pending"
blocked_reason: null
blocked_since: null
result: null
completed_at: null
parent_task_id: null
depends_on: []
tags: ["permission", "drag-drop", "human", "agent", "boardview"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# Fix human/agent permission model and drag-to-done bug

## Mục tiêu

Phân biệt rõ human user và agent trong hệ thống permission. Human có thể:
- Kéo task từ **review → done** (approve/finalize)
- Kéo task từ **review → todo** (reject/reopen để agent làm lại)

Agent KHÔNG được phép làm hai việc trên. Đây là final-disposition privilege — chỉ human mới được quyết định kết quả cuối cùng.

Ngoài ra cần fix 2 bug phụ trong drag-drop UI khiến dữ liệu không cập nhật sau khi kéo.

---

## Root cause analysis

### Bug 1 — `void handleDrop` swallows API errors silently

**File:** `web/src/pages/BoardView.tsx` line 164, 199

```tsx
// WRONG — void discards rejected promises
onDrop={(event) => void handleDrop(col.id, event)}
```

Khi API trả về lỗi (4xx, 5xx, validation fail), `void` discards the rejected Promise. UI không re-render, không show error. Task card nhìn như đã di chuyển nhưng thực ra không có gì được ghi vào vault.

### Bug 2 — `actorId` dùng agent ID thay vì human-user

**File:** `web/src/pages/BoardView.tsx` line 86

```tsx
// WRONG — task.assigneeId là ID của agent (e.g. "claude-code")
await moveTaskToStatus(taskId, next.status, task.lockedBy ?? task.assigneeId ?? 'human-user');
```

Khi agent submit task sang review, lock được release (`locked_by = null`). Nhưng `task.assignee` vẫn là agent ID. Nên khi human kéo, `actorId = 'claude-code'` — hệ thống hiểu nhầm là agent đang thực hiện.

Hậu quả: permission check mới trên server sẽ chặn human vì nó thấy actorId là một registered agent.

### Trạng thái server-side (đã implement một phần)

**File:** `app/server/api/vault/tasks/[id].ts`

Server đã có check block agent thực hiện `review → done` và `review → todo`:

```ts
const HUMAN_ONLY_TRANSITIONS = [
  { from: "review", to: "done" },
  { from: "review", to: "todo" },
];
```

Nhưng check này chỉ hoạt động đúng nếu client gửi `actorId = 'human-user'` cho human actions.

### Bug 3 — Stale agent lock blocks human finalizations

Nếu agent bị crash/timeout trong khi task đang `in-progress` (lock chưa expire), human muốn force-move sang `todo` thì bị block bởi `assertTaskWriteable`. Cần `recoverStaleLock: true` cho human finalizations.

---

## Implementation

### Bước 1: Fix `actorId` trong BoardView

**File:** `web/src/pages/BoardView.tsx`

Xóa `task.lockedBy ?? task.assigneeId ??` — human drag luôn dùng `'human-user'`:

```tsx
// BEFORE (line 86)
await moveTaskToStatus(taskId, next.status, task.lockedBy ?? task.assigneeId ?? 'human-user');

// AFTER
await moveTaskToStatus(taskId, next.status, 'human-user');
```

### Bước 2: Fix `void handleDrop` — bắt và hiển thị lỗi

**File:** `web/src/pages/BoardView.tsx`

Thêm `dropError` state, bắt lỗi từ `handleDrop`, hiển thị trong UI.

```tsx
// Thêm state
const [dropError, setDropError] = useState<string | null>(null);

// Sửa handleDrop — thêm try/catch
const handleDrop = async (laneId: BoardLaneId, event: DragEvent<HTMLDivElement>) => {
  event.preventDefault();
  setDragOverLane(null);
  setDropHint(null);
  setDropError(null);
  const taskId = event.dataTransfer.getData('application/x-relayhq-task-id') || event.dataTransfer.getData('text/plain');
  if (!taskId) return;

  const task = tasks.find((entry) => entry.id === taskId);
  if (!task) return;

  const next = resolveBoardDrop(laneId, task.status);
  if (!next) {
    if (laneId === 'done' && task.status === 'waiting-approval') {
      setDropHint('This task is waiting approval. Approve it first.');
    } else if (laneId === 'done') {
      setDropHint('Only review tasks can be dropped into Done.');
    }
    return;
  }

  if (next.status === task.status && next.column === task.columnId) return;

  try {
    await moveTaskToStatus(taskId, next.status, 'human-user');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to move task.';
    setDropError(message);
    // Auto-clear after 5s
    setTimeout(() => setDropError(null), 5000);
  }
};

// Sửa onDrop — bỏ void, dùng arrow function handle error
onDrop={(event) => { void handleDrop(col.id, event); }}
// Hoặc đơn giản hơn, vì handleDrop tự catch lỗi:
onDrop={(event) => void handleDrop(col.id, event)}
// (giữ void là OK vì handleDrop đã catch internally rồi)
```

Thêm error banner vào JSX (dưới `mutationError` banner hiện có):

```tsx
{dropError && (
  <div className="shrink-0 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
    {dropError}
  </div>
)}
```

### Bước 3: `moveTaskToStatus` — đảm bảo default actorId là 'human-user'

**File:** `web/src/store/appStore.ts`

Hàm hiện tại đã có `actorId = 'human-user'` làm default — không cần sửa. Nhưng cần đảm bảo caller không override với agent ID:

```ts
// Hiện tại (appStore.ts line 538) — OK
moveTaskToStatus: async (taskId, status, actorId = 'human-user') => {
```

Caller duy nhất là BoardView.tsx line 86 — đã fix ở Bước 1.

### Bước 4: Server — enable `recoverStaleLock` cho human finalizations

**File:** `app/server/api/vault/tasks/[id].ts`

Thêm `recoverStaleLock: true` vào `patchTaskLifecycle` khi actor là human và đang thực hiện final-disposition:

```ts
// Xác định đây có phải human finalizing không
const isHumanFinalDisposition =
  !agentIds.has(body.actorId) &&
  typeof body.patch.status === "string" &&
  (body.patch.status === "done" || body.patch.status === "todo");

const result = await patchTaskLifecycle({
  taskId,
  actorId: body.actorId,
  patch: body.patch,
  recoverStaleLock: isHumanFinalDisposition,
});
```

**File:** `app/server/services/vault/task-lifecycle.ts`

Thêm `recoverStaleLock` vào `PatchTaskLifecycleRequest` và pass xuống `runTaskLifecycleMutation`:

```ts
export interface PatchTaskLifecycleRequest extends TaskLifecycleRequest {
  readonly patch: Readonly<Partial<TaskFrontmatter>>;
  readonly recoverStaleLock?: boolean;  // thêm field này
}

// Trong patchTaskLifecycle:
const result = await runTaskLifecycleMutation(
  { ...request, vaultRoot, historyEntry },
  () => patch,
  {
    releaseLock: ...,
    recoverStaleLock: request.recoverStaleLock ?? false,  // pass xuống
  },
);
```

### Bước 5: Verify `agentIds` được đọc đúng trong handler

**File:** `app/server/api/vault/tasks/[id].ts`

Để tránh đọc vault 2 lần, refactor để dùng chung `agentIds` cho cả permission check và `recoverStaleLock`:

```ts
// Chỉ đọc readModel một lần nếu patch.status có giá trị
let agentIds: Set<string> | undefined;

if (typeof body.patch.status === "string") {
  const vaultRoot = resolveVaultWorkspaceRoot();
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  agentIds = new Set(readModel.agents.map((a) => a.id));

  // Permission check
  if (agentIds.has(body.actorId)) {
    const currentTask = readModel.tasks.find((t) => t.id === taskId);
    const currentStatus = currentTask?.status ?? "";
    const nextStatus = body.patch.status as string;
    const blocked = HUMAN_ONLY_TRANSITIONS.some(
      (t) => t.from === currentStatus && t.to === nextStatus
    );
    if (blocked) {
      throw createError({
        statusCode: 403,
        statusMessage: `Agents cannot move tasks from "${currentStatus}" to "${nextStatus}". Only humans can perform this transition.`,
      });
    }
  }
}

// Determine recoverStaleLock
const isHumanFinalDisposition =
  agentIds !== undefined &&
  !agentIds.has(body.actorId) &&
  (body.patch.status === "done" || body.patch.status === "todo");

const result = await patchTaskLifecycle({
  taskId,
  actorId: body.actorId,
  patch: body.patch,
  recoverStaleLock: isHumanFinalDisposition,
});
```

---

## Files cần sửa

| File | Thay đổi |
|------|----------|
| `web/src/pages/BoardView.tsx` | Fix actorId (bỏ task.lockedBy/assigneeId), thêm dropError state + banner |
| `web/src/store/appStore.ts` | Không đổi — default 'human-user' đã đúng |
| `app/server/api/vault/tasks/[id].ts` | Refactor permission check + thêm recoverStaleLock |
| `app/server/services/vault/task-lifecycle.ts` | Thêm `recoverStaleLock?` vào PatchTaskLifecycleRequest |

---

## Acceptance Criteria

- [ ] Human kéo task từ review → done: task chuyển trạng thái thành công, board cập nhật ngay
- [ ] Human kéo task từ review → todo: task về todo, agent có thể claim lại và làm tiếp
- [ ] Agent (actorId = 'claude-code' hoặc bất kỳ registered agent ID) PATCH với `status: done` từ review: server trả 403, task không đổi
- [ ] Agent PATCH với `status: todo` từ review: server trả 403
- [ ] Khi API trả 403, BoardView hiển thị error message rõ ràng (không im lặng)
- [ ] Task có stale agent lock (agent crash): human vẫn có thể kéo sang done hoặc todo
- [ ] Agents vẫn có thể: claim (todo→in-progress), submit review (in-progress→review), heartbeat, update notes/progress

## Constraints

- Không thay đổi `AgentFrontmatter` schema
- Không thêm authentication/JWT — system này local-first, trust model dựa vào actorId convention
- `'human-user'` là hardcoded ID cho human actor trong UI — đây là intentional design (single-user local tool)
- Không dùng database hoặc session — check agents registry trong vault mỗi request là đủ (vault cached trong memory)

## Context Files

- app/server/api/vault/tasks/[id].ts
- app/server/services/vault/task-lifecycle.ts
- web/src/pages/BoardView.tsx
- web/src/store/appStore.ts
