---
name: codebase-brain
version: 1.0.0
description: Codebase second brain workflow for AI agents — use repo maps and capability maps before deep code reads
requires: []
task_types:
  - feature-implementation
  - bug-fix
  - refactoring
  - api-design
applies_to_tags:
  - codebase-brain
  - backend
  - frontend
  - api
---

# Codebase Brain Skill

## Mục tiêu

Giúp agent giảm thời gian re-discovery trong codebase bằng cách dùng codebase brain docs trước khi đọc sâu vào code.

## Quy trình mặc định

### Bước 1: Search repo-map và capability-map trước khi đọc code

Ngay khi nhận task:

1. Gọi `POST /api/agent/search-docs` với `projectId` của task.
2. Ưu tiên `types`: `repo-map`, `capability-map`, `runbook`, `adr`.
3. Chỉ sau khi đã đọc các doc liên quan mới bắt đầu search code hoặc mở file lớn.

Ví dụ payload:

```json
{
  "query": "approval flow",
  "projectId": "project-relayhq-aa6d7e",
  "types": ["repo-map", "capability-map", "runbook", "adr"],
  "agent_id": "agent-claude-code"
}
```

## Cách dùng codebase brain docs

- `repo-map`: hiểu cấu trúc thư mục, entrypoints, source of truth.
- `capability-map`: hiểu một luồng tính năng đi qua những route, service, store, component hoặc test nào.
- `runbook`: hiểu các bước thao tác hoặc debug flow.
- `adr`: hiểu vì sao kiến trúc hiện tại được chọn.

## Khi nào cần search gì

- Nếu task nói về một feature hoặc workflow: search `capability-map` trước.
- Nếu task nói về một module hoặc codebase chưa quen: search `repo-map` trước.
- Nếu task chạm behavior vận hành hoặc quy trình: search `runbook`.
- Nếu task có vẻ đi ngược kiến trúc hiện tại: search `adr` trước khi sửa.

## Sau khi sửa code

Khi thay đổi làm dịch chuyển hiểu biết về codebase, agent phải cập nhật hoặc tạo docs liên quan.

Nên update docs khi:

- xuất hiện file source of truth mới
- luồng capability đổi đường đi
- checklist thay đổi feature đã khác trước
- có quyết định kiến trúc mới hoặc rule mới đáng tái sử dụng

## Nguyên tắc thực thi

- Dùng docs để định hướng.
- Dùng code search để khoanh vùng.
- Chỉ đọc file đích sau khi đã có bản đồ.
- Nếu phát hiện doc sai hoặc cũ, sửa doc như một phần của task hoặc tạo follow-up rõ ràng.
