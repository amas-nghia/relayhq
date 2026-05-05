# Giới thiệu RelayHQ — Bộ điều phối mã nguồn mở cho đội AI agent

> **TL;DR:** Bạn đang chạy Claude Code, Cursor, hay OpenCode để code? RelayHQ là lớp điều phối ngồi giữa bạn và các agent — phân công việc, ngăn agent dẫm lên nhau, yêu cầu phê duyệt trước khi làm việc rủi ro, và ghi lại toàn bộ lịch sử vào Git. Mã nguồn mở, miễn phí, chạy local hoàn toàn.

---

## Vấn đề

AI agent ngày càng mạnh. Claude Code có thể viết code, chạy test, mở PR. Cursor tự sửa bug. OpenCode tự deploy. Nhưng khi bạn chạy nhiều agent cùng lúc — hoặc chỉ một agent nhưng để nó tự quyết định — bắt đầu xuất hiện những câu hỏi không có câu trả lời:

- **Agent đang làm gì?** Không có dashboard. Không có log tập trung.
- **Hai agent có đang làm cùng một task không?** Không có cơ chế lock.
- **Agent có tự ý đụng vào production config không?** Không có approval gate.
- **Tuần trước agent làm gì, ai approve?** Không có audit trail.

Bạn có thể giải quyết từng cái bằng cách tự viết — nhưng đó không phải việc bạn muốn làm.

---

## RelayHQ giải quyết cái gì

RelayHQ là **lớp điều phối** ngồi giữa bạn và agent. Nó không thay thế agent — nó quản lý *ai làm gì, theo thứ tự nào, và ai phê duyệt trước khi tiếp tục*.

```
Bạn tạo task → định nghĩa tiêu chí chấp nhận → assign cho agent (hoặc để pool tự chọn)
       ↓
RelayHQ route đúng agent — lock task để không agent nào claim trùng
       ↓
Agent làm việc → gửi heartbeat → RelayHQ tự reclaim nếu agent im lặng quá lâu
       ↓
Cần phê duyệt? → agent dừng lại và chờ — không gì tiếp tục nếu chưa có approve
       ↓
Bạn review trên UI → approve hoặc gửi lại kèm ghi chú
       ↓
Xong. Ghi vào vault. Commit vào Git. Audit trail đầy đủ.
```

**RelayHQ điều phối công việc. Nó không thực thi công việc.**

---

## Vault-first — tại sao dùng Markdown + Git thay vì database

Mọi task trong RelayHQ là một file Markdown với YAML frontmatter:

```markdown
---
id: task-abc123
title: Implement JWT login endpoint
status: in-progress
assignee: claude-code
priority: high
progress: 60
---

Implement `/api/auth/login` với JWT.
Acceptance criteria: trả về 200 + token với credentials hợp lệ, 401 với credentials sai.
```

Tại sao Markdown thay vì database?

- **Không cần setup** — không Postgres, không Redis, không Docker
- **Git là source of truth** — mọi thay đổi có lịch sử, có thể revert
- **Đọc được bằng mắt thường** — mở file trong Obsidian, VS Code, hay bất kỳ editor nào
- **Agent tự đọc được** — không cần API đặc biệt để agent hiểu context
- **Audit trail tự động** — mỗi thay đổi là một commit

---

## Những tính năng chính

### Kanban board trực quan
Kéo thả task giữa các cột: Todo → In Progress → Review → Done. Xem tất cả agent đang làm gì trong real-time qua SSE.

### Multi-agent coordination với task locking
Khi một agent claim task, task bị lock với TTL. Nếu agent im lặng quá 10 phút mà không gửi heartbeat, lock hết hạn và task tự động trả về pool. Không bao giờ có hai agent làm cùng một việc.

### Approval gate
Agent không thể tự chuyển task sang `done`. Khi xong, agent chuyển sang `review` và chờ. Bạn approve hoặc gửi lại với feedback. Đặc biệt hữu ích cho: database migration, thay đổi config production, refactor lớn.

### Auto-dispatch
RelayHQ tự động route task đến agent phù hợp dựa trên `task_types_accepted` và `capabilities` của agent. Không cần tay assign từng task.

### Skill system
Agent nhận context có cấu trúc tại session start — bao gồm skills phù hợp với task type. Một agent làm bug fix sẽ nhận skill-bug-fix. Một agent làm code review sẽ nhận skill-code-review.

### Full audit trail
Mỗi action — claim, heartbeat, approval, rejection — đều được ghi vào `vault/shared/audit/` dưới dạng Markdown. Bạn biết ai làm gì, lúc nào, kết quả là gì.

### MCP native
Hoạt động ngay với Claude Code, Cursor, Antigravity qua 6 MCP tools: `relayhq_inbox`, `relayhq_start`, `relayhq_progress`, `relayhq_done`, `relayhq_request_approval`, `relayhq_blocked`.

---

## Bắt đầu trong 3 lệnh

```bash
git clone https://github.com/amas-nghia/relayhq.git
cd relayhq
pm2 start ecosystem.config.cjs
```

Mở [http://localhost:44211](http://localhost:44211) — onboarding wizard 3 bước hướng dẫn setup vault và kết nối agent đầu tiên.

### Kết nối Claude Code

Thêm vào `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "relayhq": {
      "command": "npx",
      "args": ["relayhq-mcp"],
      "env": {
        "RELAYHQ_BASE_URL": "http://127.0.0.1:44210",
        "RELAYHQ_VAULT_ROOT": "/path/to/your/vault"
      }
    }
  }
}
```

Restart Claude Code. Từ giờ mỗi session, Claude tự check inbox, claim task, gửi heartbeat, và chờ approval khi cần — không cần bạn nhắc.

---

## RelayHQ có phù hợp với bạn không?

**Phù hợp nếu:**
- Bạn đang dùng Claude Code / Cursor / OpenCode cho công việc thật và muốn track những gì chúng đang làm
- Bạn chạy nhiều AI agent trên cùng một project và cần chúng không dẫm lên nhau
- Bạn muốn agent xin phê duyệt trước khi đụng vào thứ gì đó rủi ro
- Bạn muốn audit log đầy đủ dưới dạng Markdown, commit vào Git

**Không phù hợp nếu:**
- Bạn muốn agent hoàn toàn tự chủ, không cần human oversight
- Bạn cần một platform enterprise với SSO, RBAC, compliance certification

---

## Mã nguồn mở, chạy local, không vendor lock-in

- **MIT License** — dùng, sửa, fork thoải mái
- **Chạy hoàn toàn local** — không có server trung tâm, không gửi data ra ngoài
- **Không vendor lock-in** — vault là plain Markdown, chạy được mà không cần RelayHQ
- **Works with any agent** — bất kỳ tool nào gọi được HTTP API đều hoạt động

---

## Thử ngay

**GitHub:** [github.com/amas-nghia/relayhq](https://github.com/amas-nghia/relayhq)

**Docs:** [amas.gitbook.io/relayhq](https://amas.gitbook.io/relayhq)

**Demo:** [Xem demo trên Loom](https://www.loom.com/share/496c1d58c33a435f826ad8f620191eab)

Nếu bạn đang build với AI agent và mọi thứ bắt đầu trở nên khó track — RelayHQ là thứ bạn đang cần. Star repo nếu thấy hữu ích, mở issue nếu có câu hỏi, và PR luôn được chào đón.
